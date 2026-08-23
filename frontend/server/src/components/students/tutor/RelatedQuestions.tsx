"use client";

// チューターの回答に添える「この話題の演習問題」。
//   - 教員が作った既存問題（questions テーブル）を話題に近い順に並べたもので、LLM が問題を生成しているわけではない
//   - 1問だけ出して、その場で解答・採点できる（採点規則と保存 API は既存の演習ページと同じ）。
//     続けて解きたいときは「他の問題も解く」で既存の演習ページへ
//   - 問題文は LMS の他画面と同じ Markdown+MathJax 流儀（数式内のバックスラッシュは二重化済み）なのでそのまま渡す
import { ArrowRight, Check, ExternalLink, ListChecks, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import axios from "@/lib/axios";
import { SafeMathJax } from "./SafeMathJax";

type Blank = {
	blank_id: string;
	label: string;
	answers?: number[] | null;
	tolerance?: number | null;
};

export type RelatedQuestion = {
	id: number;
	title: string;
	question_type: string;
	difficulty?: number | null;
	question: string;
	hint?: string;
	answers: { label: string; answers: unknown }[];
	grading?: {
		type: string;
		answers?: number[] | null;
		tolerance?: number | null;
		blanks?: Blank[];
	} | null;
	score?: number;
	status?: "wrong" | "unanswered" | "correct" | "unknown";
	attempts?: number;
	shown_before?: boolean;
	tags?: string[];
	exercise_set?: {
		id: number;
		title: string;
		course_id: number;
		url: string;
	} | null;
};

export type RelatedMeta = {
	suppressed?: number;
	topic_tags?: string[];
	more?: number;
};

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
	wrong: {
		label: "前回 不正解",
		cls: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
	},
	unanswered: {
		label: "未回答",
		cls: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
	},
	correct: {
		label: "正解済み",
		cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
	},
};

// 「答えを確認」「演習ページで解く」を tutor に記録（次回の提示判断に使う。失敗しても無視）
function recordEvent(questionId: number, kind: "revealed" | "clicked") {
	void axios
		.post(`/tutor/related-questions/${questionId}/event`, { kind })
		.catch(() => undefined);
}

// 問題文の先頭の見出し（# Q1 …）と入力注記は本文から外して読みやすくする
function cleanQuestion(q: string): string {
	return q
		.replace(/^#+\s*Q?\d*\s*/m, "")
		.replace(/\(半角で入力\)/g, "")
		.trim();
}

// 既存の演習ページ（set/[set_id]/page.tsx checkAnswer）と同じ採点規則
function numericOk(
	raw: string | undefined,
	answers: number[] | null | undefined,
	tolerance: number | null | undefined,
): boolean {
	const num =
		raw != null && raw !== ""
			? Number.parseFloat(String(raw).trim())
			: Number.NaN;
	const tol = tolerance ?? 0;
	return (answers ?? []).some(
		(a) => !Number.isNaN(num) && Math.abs(num - a) <= tol,
	);
}

function grade(
	q: RelatedQuestion,
	input: Record<string, string>,
): boolean | null {
	const g = q.grading;
	if (!g) return null;
	if (g.type === "numeric")
		return numericOk(input.value, g.answers, g.tolerance);
	if (g.type === "multiple_numeric") {
		const blanks = g.blanks ?? [];
		if (blanks.length === 0) return null;
		return blanks.every((b) =>
			numericOk(input[`blank_${b.blank_id}`], b.answers, b.tolerance),
		);
	}
	return null; // その他の型（mcq / descriptive …）はその場採点の対象外 → 演習ページへ
}

function QuestionCard({ q, more }: { q: RelatedQuestion; more: number }) {
	const [input, setInput] = useState<Record<string, string>>({});
	const [result, setResult] = useState<boolean | null>(null);
	const [saving, setSaving] = useState(false);
	const [saveNote, setSaveNote] = useState<string | null>(null);
	const [showAnswer, setShowAnswer] = useState(false);
	const [attempts, setAttempts] = useState(0);

	const solvable =
		q.grading?.type === "numeric" ||
		(q.grading?.type === "multiple_numeric" &&
			(q.grading.blanks?.length ?? 0) > 0);
	const chip = q.status ? STATUS_CHIP[q.status] : undefined;

	const submit = async () => {
		const ok = grade(q, input);
		if (ok === null) return;
		setResult(ok);
		setAttempts((n) => n + 1);
		// 既存の演習セッション API で保存（演習セットに入っている問題だけ記録できる）。source で「チューターで解いた」と分かるようにする
		if (q.exercise_set?.id) {
			setSaving(true);
			try {
				const sess = await axios.post<{ id: number }>(
					`/exercise-sets/${q.exercise_set.id}/sessions`,
					{},
				);
				await axios.post(`/exercise-sessions/${sess.data.id}/answers`, {
					question_id: q.id,
					answer_data: { ...input, source: "tutor" },
					is_correct: ok,
				});
				setSaveNote(null);
			} catch {
				setSaveNote("結果を保存できませんでした（採点はこの画面だけ）。");
			} finally {
				setSaving(false);
			}
		} else {
			setSaveNote(
				"この問題は演習セットに入っていないため、結果は記録されません。",
			);
		}
	};

	const onKey = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.nativeEvent.isComposing) {
			e.preventDefault();
			void submit();
		}
	};

	return (
		<div className="rounded-lg border bg-background">
			<div className="flex items-center gap-2 px-3 py-2 text-sm">
				<span className="min-w-0 flex-1 truncate font-medium">{q.title}</span>
				{q.shown_before && q.status === "wrong" ? (
					<span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
						もう一度
					</span>
				) : null}
				{result === null && chip ? (
					<span
						className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${chip.cls}`}
					>
						{chip.label}
					</span>
				) : null}
				{q.difficulty ? (
					<span className="shrink-0 text-[11px] text-muted-foreground">
						難易度 {q.difficulty}
					</span>
				) : null}
			</div>
			<div className="space-y-3 border-t px-3 py-3 text-sm">
				<div className="prose prose-sm max-w-none dark:prose-invert">
					<SafeMathJax text={cleanQuestion(q.question)} />
				</div>

				{/* 解答欄（numeric / multiple_numeric）。その他の型は演習ページへ */}
				{solvable ? (
					<div className="space-y-2">
						{q.grading?.type === "numeric" ? (
							<div className="flex items-center gap-2">
								<Input
									inputMode="decimal"
									placeholder="数値を入力"
									value={input.value ?? ""}
									onChange={(e) => setInput({ value: e.target.value })}
									onKeyDown={onKey}
									disabled={saving || result === true}
									className="h-9 max-w-[12rem]"
								/>
								<Button
									size="sm"
									onClick={submit}
									disabled={
										saving || result === true || !(input.value ?? "").trim()
									}
								>
									解答する
								</Button>
							</div>
						) : (
							<div className="space-y-2">
								{(q.grading?.blanks ?? []).map((b) => (
									<div key={b.blank_id} className="flex items-center gap-2">
										<span className="w-16 shrink-0 text-xs text-muted-foreground">
											{b.label}
										</span>
										<Input
											inputMode="decimal"
											placeholder="数値"
											value={input[`blank_${b.blank_id}`] ?? ""}
											onChange={(e) =>
												setInput((prev) => ({
													...prev,
													[`blank_${b.blank_id}`]: e.target.value,
												}))
											}
											onKeyDown={onKey}
											disabled={saving || result === true}
											className="h-9 max-w-[10rem]"
										/>
									</div>
								))}
								<Button
									size="sm"
									onClick={submit}
									disabled={
										saving ||
										result === true ||
										(q.grading?.blanks ?? []).some(
											(b) => !(input[`blank_${b.blank_id}`] ?? "").trim(),
										)
									}
								>
									解答する
								</Button>
							</div>
						)}
						{result !== null ? (
							<div
								className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
									result
										? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
										: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
								}`}
							>
								{result ? (
									<Check className="mt-0.5 h-4 w-4 shrink-0" />
								) : (
									<X className="mt-0.5 h-4 w-4 shrink-0" />
								)}
								<div>
									<div className="font-medium">
										{result ? "正解！" : "不正解"}
									</div>
									{!result ? (
										<div className="text-xs opacity-80">
											もう一度試すか、「答えを確認」で解き方を見られます。
											{q.hint ? " ヒントもあります。" : ""}
										</div>
									) : null}
									{saveNote ? (
										<div className="text-xs opacity-80">{saveNote}</div>
									) : null}
								</div>
							</div>
						) : null}
					</div>
				) : (
					<p className="text-xs text-muted-foreground">
						この形式の問題は演習ページで解答できます。
					</p>
				)}

				{showAnswer ? (
					<div className="rounded-md bg-muted/60 px-3 py-2 text-xs">
						{q.answers.length === 0 ? (
							<span className="text-muted-foreground">
								この問題の答えは演習ページで確認してください。
							</span>
						) : (
							<ul className="space-y-0.5">
								{q.answers.map((a) => (
									<li key={a.label}>
										<span className="font-medium">{a.label}:</span>{" "}
										{Array.isArray(a.answers)
											? a.answers.join(", ")
											: String(a.answers ?? "")}
									</li>
								))}
							</ul>
						)}
						{q.hint ? (
							<div className="mt-1 text-muted-foreground">
								ヒント: <SafeMathJax text={q.hint} />
							</div>
						) : null}
					</div>
				) : null}

				{q.tags?.length ? (
					<div className="flex flex-wrap gap-1">
						{q.tags.map((t) => (
							<span
								key={t}
								className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
							>
								#{t}
							</span>
						))}
					</div>
				) : null}

				<div className="flex flex-wrap items-center gap-2">
					{/* 答えは、解答を試した後（または解けない形式のとき）に見られる */}
					{attempts > 0 || !solvable || result === true ? (
						<Button
							variant="outline"
							size="sm"
							className="rounded-full"
							onClick={() => {
								if (!showAnswer) recordEvent(q.id, "revealed");
								setShowAnswer((v) => !v);
							}}
						>
							{showAnswer ? "答えを隠す" : "答えを確認"}
						</Button>
					) : null}
					{q.exercise_set?.url ? (
						<Button
							asChild
							variant={result !== null ? "default" : "ghost"}
							size="sm"
							className="rounded-full"
						>
							<Link
								href={q.exercise_set.url}
								onClick={() => recordEvent(q.id, "clicked")}
							>
								他の問題も解く{more > 0 ? `（あと${more}問）` : ""}
								<ArrowRight className="ml-1 h-3.5 w-3.5" />
							</Link>
						</Button>
					) : null}
					{!q.exercise_set?.url && !solvable ? (
						<span className="text-xs text-muted-foreground">
							<ExternalLink className="mr-1 inline h-3 w-3" />
							演習セットに未登録
						</span>
					) : null}
				</div>
			</div>
		</div>
	);
}

export function RelatedQuestions({
	items,
	meta,
}: {
	items: RelatedQuestion[];
	meta?: RelatedMeta | null;
}) {
	if (!items?.length) {
		// この話題の問題はすべて提示済み（間違えた問題があれば再提示される）
		if (meta?.suppressed) {
			return (
				<p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
					<ListChecks className="h-3.5 w-3.5" />
					この話題の演習問題はすべて提示済みです。間違えた問題があれば、また出します。
				</p>
			);
		}
		return null;
	}
	const more = meta?.more ?? Math.max(items.length - 1, 0);
	return (
		<div className="mt-3 rounded-xl border bg-muted/30 p-2">
			<div className="mb-1.5 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
				<ListChecks className="h-3.5 w-3.5" />
				この話題の演習問題（教員が作成した問題から 1 問。その場で解けます）
			</div>
			<div className="space-y-1.5">
				{items.slice(0, 1).map((q) => (
					<QuestionCard key={q.id} q={q} more={more} />
				))}
			</div>
		</div>
	);
}
