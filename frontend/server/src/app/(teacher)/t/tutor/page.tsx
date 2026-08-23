"use client";

// 教員向け: AI チューター分析
//   学生の質問一覧／ページ別・学生別・概念別の集計／つまずきの多い問題／週次の品質／フィードバック／
//   教科書ページ→KG 節の対応表（上書き可）／モデル設定（管理者のみ保存可）
import { Bot, RefreshCw, Save } from "lucide-react";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import axios from "@/lib/axios";

type Row = Record<string, string | number | null | undefined>;
type Stats = {
	enabled: boolean;
	days: number;
	by_page: Row[];
	by_student: Row[];
	by_concept: Row[];
	hard_questions: Row[];
	weekly: Row[];
	feedback_recent: Row[];
};
type Question = {
	id: number;
	created_at: string;
	student_id: number;
	course_id?: number | null;
	page_title?: string | null;
	question: string;
	turn_class?: string | null;
	focus_concept?: string | null;
	understanding_level?: string | null;
};
type SectionRow = {
	lesson_page_id: number;
	title: string;
	section: string | null;
	overridden: boolean;
};
type SettingsRes = {
	settings: Record<string, unknown>;
	effective: {
		llm_model: string;
		llm_base_url: string;
		embed_model?: string;
		rerank_model?: string;
		kb_version_id?: number;
		persistence: boolean;
	};
	models: string[];
	models_source?: string;
	models_error?: string;
};

const fmt = (v: unknown) =>
	v === null || v === undefined
		? "—"
		: typeof v === "number"
			? v.toLocaleString("ja-JP")
			: String(v);
const fmtDate = (v: unknown) =>
	typeof v === "string" && v
		? new Date(v).toLocaleString("ja-JP", {
				month: "numeric",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			})
		: "—";

function Table({
	cols,
	rows,
	empty = "データがありません",
}: {
	cols: { key: string; label: string; render?: (r: Row) => React.ReactNode }[];
	rows: Row[];
	empty?: string;
}) {
	if (!rows?.length)
		return <p className="px-1 py-3 text-sm text-muted-foreground">{empty}</p>;
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b text-left text-xs text-muted-foreground">
						{cols.map((c) => (
							<th
								key={c.key}
								className="whitespace-nowrap px-2 py-2 font-medium"
							>
								{c.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((r, i) => (
						<tr
							key={`${i}-${String(r.id ?? r.student_id ?? r.lesson_page_id ?? r.week ?? r.concept ?? "")}`}
							className="border-b last:border-0"
						>
							{cols.map((c) => (
								<td key={c.key} className="px-2 py-1.5 align-top tabular-nums">
									{c.render ? c.render(r) : fmt(r[c.key])}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default function TeacherTutorPage() {
	const { data: session } = useSession();
	const uid = useId();
	const isAdmin =
		(session?.user as { role?: { name?: string } } | undefined)?.role?.name ===
		"admin";
	const [days, setDays] = useState(30);
	const [stats, setStats] = useState<Stats | null>(null);
	const [questions, setQuestions] = useState<Question[]>([]);
	const [sections, setSections] = useState<{
		items: SectionRow[];
		sections: string[];
	} | null>(null);
	const [settings, setSettings] = useState<SettingsRes | null>(null);
	const [model, setModel] = useState("");
	const [overrides, setOverrides] = useState<Record<string, string>>({});
	const [loading, setLoading] = useState(false);
	const [msg, setMsg] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setMsg(null);
		try {
			const [s, q, sec, st] = await Promise.all([
				axios.get<Stats>("/tutor/admin/stats", { params: { days } }),
				axios.get<{ items: Question[] }>("/tutor/questions", {
					params: { limit: 200 },
				}),
				axios.get<{ items: SectionRow[]; sections: string[] }>(
					"/tutor/admin/sections",
				),
				axios.get<SettingsRes>("/tutor/admin/settings"),
			]);
			setStats(s.data);
			setQuestions(q.data.items ?? []);
			setSections(sec.data);
			setSettings(st.data);
			setModel(st.data.effective.llm_model);
			setOverrides(
				((st.data.settings.page_section_overrides as Record<string, string>) ??
					{}) as Record<string, string>,
			);
		} catch {
			setMsg(
				"読み込みに失敗しました（チューターサービスが起動しているか確認してください）。",
			);
		} finally {
			setLoading(false);
		}
	}, [days]);

	useEffect(() => {
		void load();
	}, [load]);

	const week = stats?.weekly?.[0];
	const kpis = useMemo(
		() => [
			{ k: "今週の回答数", v: fmt(week?.answers) },
			{ k: "今週の利用学生", v: fmt(week?.students) },
			{
				k: "👍 / 👎（今週）",
				v: `${fmt(week?.thumbs_up)} / ${fmt(week?.thumbs_down)}`,
			},
			{ k: "平均応答（ms）", v: fmt(week?.avg_latency_ms) },
			{ k: "教科書外で補った回答", v: fmt(week?.extra_knowledge) },
		],
		[week],
	);

	const saveSettings = async (payload: {
		llm_model?: string;
		page_section_overrides?: Record<string, string>;
	}) => {
		setMsg(null);
		try {
			const res = await axios.put<{ ok: boolean; effective_model: string }>(
				"/tutor/admin/settings",
				payload,
			);
			setMsg(
				`保存しました（現在のモデル: ${res.data.effective_model}）。再起動は不要です。`,
			);
			await load();
		} catch (e: unknown) {
			const code = (e as { response?: { status?: number } })?.response?.status;
			setMsg(
				code === 403
					? "設定の変更は管理者のみ行えます。"
					: "保存に失敗しました。",
			);
		}
	};

	return (
		<div className="mx-auto w-full max-w-6xl space-y-4 p-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h1 className="flex items-center gap-2 text-xl font-semibold">
						<Bot className="h-5 w-5" />
						AIチューター分析
					</h1>
					<p className="text-sm text-muted-foreground">
						学生がチューターに何を聞き、どこで詰まっているか。週次の品質と設定。
					</p>
				</div>
				<div className="flex items-center gap-2">
					<label
						className="text-xs text-muted-foreground"
						htmlFor={`${uid}-days`}
					>
						集計期間
					</label>
					<select
						id={`${uid}-days`}
						className="h-8 rounded-md border bg-background px-2 text-sm"
						value={days}
						onChange={(e) => setDays(Number(e.target.value))}
					>
						<option value={7}>7日</option>
						<option value={30}>30日</option>
						<option value={90}>90日</option>
						<option value={180}>半期</option>
					</select>
					<Button variant="outline" size="sm" onClick={load} disabled={loading}>
						<RefreshCw
							className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`}
						/>
						更新
					</Button>
				</div>
			</div>
			{msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

			<div className="grid grid-cols-2 gap-3 md:grid-cols-5">
				{kpis.map((x) => (
					<Card key={x.k}>
						<CardContent className="p-3">
							<div className="text-xs text-muted-foreground">{x.k}</div>
							<div className="text-xl font-semibold tabular-nums">{x.v}</div>
						</CardContent>
					</Card>
				))}
			</div>

			<Tabs defaultValue="questions">
				<TabsList className="flex-wrap">
					<TabsTrigger value="questions">質問一覧</TabsTrigger>
					<TabsTrigger value="pages">ページ別</TabsTrigger>
					<TabsTrigger value="students">学生別</TabsTrigger>
					<TabsTrigger value="concepts">概念別</TabsTrigger>
					<TabsTrigger value="hard">つまずく問題</TabsTrigger>
					<TabsTrigger value="quality">週次の品質</TabsTrigger>
					<TabsTrigger value="feedback">フィードバック</TabsTrigger>
					<TabsTrigger value="sections">ページ→節</TabsTrigger>
					<TabsTrigger value="settings">設定</TabsTrigger>
				</TabsList>

				<TabsContent value="questions">
					<Card>
						<CardHeader className="py-3">
							<CardTitle className="text-base">
								学生の質問（新しい順）
							</CardTitle>
							<CardDescription>
								チューターへの発話だけ（診断の選択などは除く）。どのページを見ながらの質問かも分かります。
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-0">
							<Table
								rows={questions as unknown as Row[]}
								cols={[
									{
										key: "created_at",
										label: "日時",
										render: (r) => fmtDate(r.created_at),
									},
									{ key: "student_id", label: "学生ID" },
									{ key: "page_title", label: "見ていたページ" },
									{
										key: "question",
										label: "質問",
										render: (r) => (
											<span className="whitespace-pre-wrap">
												{fmt(r.question)}
											</span>
										),
									},
									{ key: "focus_concept", label: "焦点概念" },
									{ key: "understanding_level", label: "理解度" },
								]}
							/>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="pages">
					<Card>
						<CardHeader className="py-3">
							<CardTitle className="text-base">
								ページ別（教科書ページを見ながらの質問）
							</CardTitle>
							<CardDescription>
								質問が多い・混乱が多いページは、教材の説明を見直す候補です。
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-0">
							<Table
								rows={stats?.by_page ?? []}
								cols={[
									{ key: "page_title", label: "ページ" },
									{ key: "questions", label: "質問数" },
									{ key: "students", label: "学生数" },
									{ key: "confused", label: "混乱（言い直し）" },
								]}
							/>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="students">
					<Card>
						<CardHeader className="py-3">
							<CardTitle className="text-base">学生別</CardTitle>
							<CardDescription>
								質問数・会話数・最終利用・理解度（自己申告＋推定）・最後の焦点概念。
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-0">
							<Table
								rows={stats?.by_student ?? []}
								cols={[
									{ key: "name", label: "学生" },
									{ key: "questions", label: "質問数" },
									{ key: "conversations", label: "会話数" },
									{ key: "confused", label: "混乱" },
									{ key: "level", label: "理解度" },
									{ key: "last_focus", label: "最後の焦点" },
									{
										key: "last_at",
										label: "最終利用",
										render: (r) => fmtDate(r.last_at),
									},
								]}
							/>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="concepts">
					<Card>
						<CardHeader className="py-3">
							<CardTitle className="text-base">概念別</CardTitle>
							<CardDescription>
								質問が集中している概念。授業で補足する候補です。
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-0">
							<Table
								rows={stats?.by_concept ?? []}
								cols={[
									{ key: "concept", label: "概念" },
									{ key: "questions", label: "質問数" },
									{ key: "students", label: "学生数" },
									{ key: "confused", label: "混乱" },
								]}
							/>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="hard">
					<Card>
						<CardHeader className="py-3">
							<CardTitle className="text-base">つまずく演習問題</CardTitle>
							<CardDescription>
								チューターが提示した問題のうち、「前回不正解」として再提示された回数が多い順。
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-0">
							<Table
								rows={stats?.hard_questions ?? []}
								cols={[
									{ key: "title", label: "問題" },
									{ key: "shown", label: "提示回数" },
									{ key: "shown_as_wrong", label: "不正解で再提示" },
									{ key: "students", label: "学生数" },
									{ key: "revealed", label: "答えを見た" },
								]}
							/>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="quality">
					<Card>
						<CardHeader className="py-3">
							<CardTitle className="text-base">週次の品質</CardTitle>
							<CardDescription>
								回答数・利用学生・教科書外で補った回答・混乱・位置特定（clarify）・平均応答時間・👍👎。研究側の週次ループの入力（
								<code>tutor.v_weekly_quality</code>）。
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-0">
							<Table
								rows={stats?.weekly ?? []}
								cols={[
									{ key: "week", label: "週（月曜）" },
									{ key: "answers", label: "回答" },
									{ key: "students", label: "学生" },
									{ key: "extra_knowledge", label: "教科書外" },
									{ key: "confused", label: "混乱" },
									{ key: "clarify", label: "clarify" },
									{ key: "avg_latency_ms", label: "平均ms" },
									{ key: "thumbs_up", label: "👍" },
									{ key: "thumbs_down", label: "👎" },
								]}
							/>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="feedback">
					<Card>
						<CardHeader className="py-3">
							<CardTitle className="text-base">最近のフィードバック</CardTitle>
							<CardDescription>
								学生が回答に付けた 👍👎 とコメント。👎
								は回答の改善（研究側のプロンプト・検索）に回します。
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-0">
							<Table
								rows={stats?.feedback_recent ?? []}
								cols={[
									{
										key: "created_at",
										label: "日時",
										render: (r) => fmtDate(r.created_at),
									},
									{
										key: "rating",
										label: "評価",
										render: (r) => (Number(r.rating) > 0 ? "👍" : "👎"),
									},
									{ key: "student_id", label: "学生ID" },
									{
										key: "question",
										label: "質問",
										render: (r) => (
											<span className="line-clamp-2 max-w-xs">
												{fmt(r.question)}
											</span>
										),
									},
									{
										key: "answer",
										label: "回答（冒頭）",
										render: (r) => (
											<span className="line-clamp-2 max-w-md">
												{String(r.answer ?? "").slice(0, 160)}
											</span>
										),
									},
									{ key: "comment", label: "コメント" },
								]}
							/>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="sections">
					<Card>
						<CardHeader className="py-3">
							<CardTitle className="text-base">
								教科書ページ → 知識ベースの節
							</CardTitle>
							<CardDescription>
								学生がページを見ながら質問したとき、検索の一次候補をこの節に寄せます。自動対応（タイトルと定義文から推定）が違う場合は上書きしてください（保存は管理者）。
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3 pt-0">
							<Table
								rows={(sections?.items ?? []) as unknown as Row[]}
								cols={[
									{ key: "lesson_page_id", label: "ページID" },
									{ key: "title", label: "LMS のページ" },
									{
										key: "section",
										label: "自動対応した節",
										render: (r) => fmt(r.section),
									},
									{
										key: "override",
										label: "上書き",
										render: (r) => (
											<select
												className="h-8 max-w-xs rounded-md border bg-background px-2 text-xs"
												value={overrides[String(r.lesson_page_id)] ?? ""}
												onChange={(e) =>
													setOverrides((p) => ({
														...p,
														[String(r.lesson_page_id)]: e.target.value,
													}))
												}
											>
												<option value="">（自動）</option>
												<option value="-">対応なし</option>
												{(sections?.sections ?? []).map((s) => (
													<option key={s} value={s}>
														{s.replace(/^#+\s*/, "")}
													</option>
												))}
											</select>
										),
									},
								]}
							/>
							<Button
								size="sm"
								onClick={() =>
									saveSettings({
										page_section_overrides: Object.fromEntries(
											Object.entries(overrides).filter(([, v]) => v),
										),
									})
								}
								disabled={!isAdmin}
								title={isAdmin ? "" : "管理者のみ"}
							>
								<Save className="mr-1 h-4 w-4" />
								上書きを保存
							</Button>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="settings">
					<Card>
						<CardHeader className="py-3">
							<CardTitle className="text-base">モデル設定</CardTitle>
							<CardDescription>
								回答を作るチャットモデル。保存すると再起動なしで切り替わり、次回起動後も保持されます（管理者のみ）。埋め込み・リランカーは知識ベースと紐づくため、ここでは変えられません（研究側で再構築）。
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3 pt-0 text-sm">
							<div className="grid gap-2 md:grid-cols-2">
								<div>
									<div className="text-xs text-muted-foreground">
										現在のモデル
									</div>
									<div className="font-mono">
										{settings?.effective.llm_model ?? "—"}
									</div>
								</div>
								<div>
									<div className="text-xs text-muted-foreground">
										ゲートウェイ
									</div>
									<div className="font-mono">
										{settings?.effective.llm_base_url ?? "—"}
									</div>
								</div>
								<div>
									<div className="text-xs text-muted-foreground">
										埋め込み / リランカー（固定）
									</div>
									<div className="font-mono">
										{settings?.effective.embed_model ?? "—"} /{" "}
										{settings?.effective.rerank_model ?? "—"}
									</div>
								</div>
								<div>
									<div className="text-xs text-muted-foreground">
										知識ベースの版 / 永続化
									</div>
									<div className="font-mono">
										#{fmt(settings?.effective.kb_version_id)} /{" "}
										{settings?.effective.persistence ? "on" : "off"}
									</div>
								</div>
							</div>
							<div className="flex flex-wrap items-end gap-2">
								<div className="space-y-1">
									<label
										className="text-xs text-muted-foreground"
										htmlFor={`${uid}-model-select`}
									>
										候補から選ぶ
										{settings?.models_source === "env"
											? "（env TUTOR_MODEL_CHOICES）"
											: ""}
									</label>
									<select
										id={`${uid}-model-select`}
										className="block h-9 min-w-64 rounded-md border bg-background px-2 text-sm"
										value={settings?.models.includes(model) ? model : ""}
										onChange={(e) => e.target.value && setModel(e.target.value)}
									>
										<option value="">—</option>
										{(settings?.models ?? []).map((m) => (
											<option key={m} value={m}>
												{m}
											</option>
										))}
									</select>
								</div>
								<div className="space-y-1">
									<label
										className="text-xs text-muted-foreground"
										htmlFor={`${uid}-model-input`}
									>
										または直接入力（ゲートウェイに登録済みの名前）
									</label>
									<Input
										id={`${uid}-model-input`}
										className="h-9 min-w-80 font-mono"
										value={model}
										onChange={(e) => setModel(e.target.value)}
									/>
								</div>
								<Button
									size="sm"
									onClick={() => saveSettings({ llm_model: model.trim() })}
									disabled={!isAdmin || !model.trim()}
									title={isAdmin ? "" : "管理者のみ"}
								>
									<Save className="mr-1 h-4 w-4" />
									このモデルに切り替える
								</Button>
							</div>
							<p className="text-xs text-muted-foreground">
								env（<code>tutor/.env</code> の{" "}
								<code>ANTHROPIC_DEFAULT_SONNET_MODEL</code>
								）は起動時の既定値。ここで保存した値が優先されます。
							</p>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
