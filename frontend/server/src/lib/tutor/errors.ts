// AI チューターのエラーの種類の判定（画面に出し分けるための、副作用のない関数だけ）。
// backend のエラー応答: { detail: string, code?: string, state?: string, retry_after_sec?: number }（api/core/tutor_errors.py）
// テスト: errors.test.mts（node --experimental-strip-types --test）

export type TutorErrorKind = "maintenance" | "busy" | "generic";

export type TutorErrorInfo = {
	kind: TutorErrorKind;
	message: string;
	code?: string;
	retryAfterSec?: number;
};

export type TutorMaintenance = {
	message: string;
	retryAfterSec: number;
};

export const DEFAULT_MAINTENANCE_MESSAGE =
	"AIチューターは現在メンテナンス中です。しばらくしてからもう一度お試しください。";

// 「AI サーバーに繋がらない」「チューターが止まっている／起動中」は、学生には『メンテナンス中』として見せる
const MAINTENANCE_CODES = new Set([
	"llm_unavailable",
	"tutor_unavailable",
	"starting",
]);

const DEFAULT_RETRY_SEC = 30;

type AxiosLikeError = {
	response?: {
		status?: number;
		data?: { detail?: unknown; code?: unknown; retry_after_sec?: unknown };
	};
};

export function parseTutorError(
	e: unknown,
	fallbackMessage: string,
): TutorErrorInfo {
	const res = (e as AxiosLikeError | null | undefined)?.response;
	const data = res?.data;
	const code = typeof data?.code === "string" ? data.code : undefined;
	const detail =
		typeof data?.detail === "string" && data.detail.trim()
			? data.detail
			: undefined;
	const retry =
		typeof data?.retry_after_sec === "number" && data.retry_after_sec > 0
			? data.retry_after_sec
			: undefined;

	if (code && MAINTENANCE_CODES.has(code)) {
		return {
			kind: "maintenance",
			message: detail ?? DEFAULT_MAINTENANCE_MESSAGE,
			code,
			retryAfterSec: retry ?? DEFAULT_RETRY_SEC,
		};
	}
	if (code === "busy" || res?.status === 429) {
		return { kind: "busy", message: detail ?? fallbackMessage, code };
	}
	return { kind: "generic", message: detail ?? fallbackMessage, code };
}

export type TutorHealth = {
	ok?: boolean;
	llm?: {
		ok?: boolean;
		state?: string;
		message?: string | null;
		retry_after_sec?: number;
	};
};

// /api/tutor/health の応答から、メンテナンス表示が必要か（null = 不要）。
// llm が無い・判定できない場合は「不要」（誤って学生の質問を止めない）
export function maintenanceFromHealth(
	h: TutorHealth | null | undefined,
): TutorMaintenance | null {
	if (!h || !h.llm || h.llm.ok !== false) return null;
	return {
		message: h.llm.message || DEFAULT_MAINTENANCE_MESSAGE,
		retryAfterSec:
			typeof h.llm.retry_after_sec === "number" && h.llm.retry_after_sec > 0
				? h.llm.retry_after_sec
				: DEFAULT_RETRY_SEC,
	};
}

// 復旧の確認を何秒後にするか（短すぎても長すぎても困るので 10〜60 秒に収める）
export function recheckDelayMs(m: TutorMaintenance): number {
	return Math.min(60, Math.max(10, m.retryAfterSec)) * 1000;
}
