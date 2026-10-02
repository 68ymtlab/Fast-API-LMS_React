// 実行: node --experimental-strip-types --test src/lib/tutor/errors.test.mjs（TypeScript の errors.ts を直接読む。Node 22.6 以上）
// .mjs（型注釈なし）にしているのは、tsc の型チェック（.ts の拡張子付き import を禁止）の対象外にするため
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	DEFAULT_MAINTENANCE_MESSAGE,
	maintenanceFromHealth,
	parseTutorError,
	recheckDelayMs,
} from "./errors.ts";

const axiosError = (status, data) => ({
	response: { status, data },
});

test("LLM に繋がらない(llm_unavailable)は『メンテナンス中』として、サーバーの文面をそのまま使う", () => {
	const info = parseTutorError(
		axiosError(503, {
			detail: "AIチューターは現在メンテナンス中です。15:00 まで。",
			code: "llm_unavailable",
			retry_after_sec: 20,
		}),
		"通信に失敗しました。",
	);
	assert.equal(info.kind, "maintenance");
	assert.match(info.message, /15:00/);
	assert.equal(info.retryAfterSec, 20);
});

test("tutor が止まっている・起動中も『メンテナンス中』", () => {
	for (const code of ["tutor_unavailable", "starting"]) {
		const info = parseTutorError(
			axiosError(502, { detail: "x", code }),
			"通信に失敗しました。",
		);
		assert.equal(info.kind, "maintenance", code);
	}
});

test("maintenance で文面が無ければ既定の文面", () => {
	const info = parseTutorError(
		axiosError(503, { code: "llm_unavailable" }),
		"x",
	);
	assert.equal(info.message, DEFAULT_MAINTENANCE_MESSAGE);
	assert.equal(info.retryAfterSec, 30);
});

test("前の質問に回答中(busy / 429)は busy。メンテナンス表示にしない", () => {
	assert.equal(
		parseTutorError(
			axiosError(429, { detail: "回答中です", code: "busy" }),
			"x",
		).kind,
		"busy",
	);
	assert.equal(parseTutorError(axiosError(429, {}), "x").kind, "busy");
});

test("混雑(overloaded)・タイムアウト・その他は generic で、サーバーの文面を出す", () => {
	for (const code of ["overloaded", "timeout", "error"]) {
		const info = parseTutorError(
			axiosError(503, { detail: "混み合っています", code }),
			"x",
		);
		assert.equal(info.kind, "generic", code);
		assert.equal(info.message, "混み合っています");
	}
});

test("応答が無い（ネットワークエラー）・想定外の形は generic で、既定の文面", () => {
	assert.deepEqual(parseTutorError(new Error("Network Error"), "通信に失敗"), {
		kind: "generic",
		message: "通信に失敗",
		code: undefined,
	});
	assert.equal(parseTutorError(null, "x").kind, "generic");
	assert.equal(parseTutorError(undefined, "x").message, "x");
	assert.equal(
		parseTutorError({ response: { data: 42 } }, "x").kind,
		"generic",
	);
});

test("health: llm.ok=false のときだけメンテナンス表示", () => {
	assert.equal(maintenanceFromHealth(null), null);
	assert.equal(maintenanceFromHealth({}), null);
	assert.equal(
		maintenanceFromHealth({ ok: true, llm: { ok: true, state: "ok" } }),
		null,
	);
	assert.equal(
		maintenanceFromHealth({ ok: true, llm: { state: "unknown" } }),
		null,
		"確認前(unknown)は、質問を止めない",
	);
	const m = maintenanceFromHealth({
		ok: true,
		llm: {
			ok: false,
			state: "down",
			message: "メンテナンス中です",
			retry_after_sec: 12,
		},
	});
	assert.deepEqual(m, { message: "メンテナンス中です", retryAfterSec: 12 });
});

test("health: 文面・秒数が無ければ既定", () => {
	assert.deepEqual(maintenanceFromHealth({ llm: { ok: false } }), {
		message: DEFAULT_MAINTENANCE_MESSAGE,
		retryAfterSec: 30,
	});
});

test("復旧の確認の間隔は 10〜60 秒に収める", () => {
	assert.equal(recheckDelayMs({ message: "", retryAfterSec: 1 }), 10_000);
	assert.equal(recheckDelayMs({ message: "", retryAfterSec: 25 }), 25_000);
	assert.equal(recheckDelayMs({ message: "", retryAfterSec: 600 }), 60_000);
});
