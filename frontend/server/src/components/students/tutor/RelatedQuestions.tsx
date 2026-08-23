"use client";

// チューターの回答に添える「関連する演習問題」。教員が作った既存問題（questions テーブル）を
// 話題に近い順に並べたもので、LLM が問題を生成しているわけではない。
// 問題文は LMS の他画面と同じ Markdown+MathJax 流儀（数式内のバックスラッシュは二重化済み）なのでそのまま渡す。
import { ChevronDown, ChevronUp, ExternalLink, ListChecks } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MathJax } from "@/components/shared/MathJax";
import { Button } from "@/components/ui/button";
import axios from "@/lib/axios";

export type RelatedQuestion = {
	id: number;
	title: string;
	question_type: string;
	difficulty?: number | null;
	question: string;
	hint?: string;
	answers: { label: string; answers: unknown }[];
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

function RelatedItem({ q }: { q: RelatedQuestion }) {
	const [open, setOpen] = useState(false);
	const [showAnswer, setShowAnswer] = useState(false);
	return (
		<li className="rounded-lg border bg-background">
			<button
				type="button"
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
			>
				<span className="min-w-0 flex-1 truncate">{q.title}</span>
				{q.shown_before && q.status === "wrong" ? (
					<span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
						もう一度
					</span>
				) : null}
				{q.status && STATUS_CHIP[q.status] ? (
					<span
						className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_CHIP[q.status].cls}`}
					>
						{STATUS_CHIP[q.status].label}
					</span>
				) : null}
				{q.difficulty ? (
					<span className="shrink-0 text-[11px] text-muted-foreground">
						難易度 {q.difficulty}
					</span>
				) : null}
				{open ? (
					<ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
				) : (
					<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
				)}
			</button>
			{open ? (
				<div className="space-y-2 border-t px-3 py-2 text-sm">
					<div className="prose prose-sm max-w-none dark:prose-invert">
						<MathJax text={cleanQuestion(q.question)} />
					</div>
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
								<p className="mt-1 text-muted-foreground">
									ヒント: <MathJax text={q.hint} />
								</p>
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
						{q.exercise_set?.url ? (
							<Button
								asChild
								variant="ghost"
								size="sm"
								className="rounded-full"
							>
								<Link
									href={q.exercise_set.url}
									onClick={() => recordEvent(q.id, "clicked")}
								>
									演習ページで解く
									<ExternalLink className="ml-1 h-3.5 w-3.5" />
								</Link>
							</Button>
						) : null}
					</div>
				</div>
			) : null}
		</li>
	);
}

export type RelatedMeta = { suppressed?: number; topic_tags?: string[] };

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
	return (
		<div className="mt-3 rounded-xl border bg-muted/30 p-2">
			<div className="mb-1.5 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
				<ListChecks className="h-3.5 w-3.5" />
				この話題の演習問題（教員が作成した問題から。間違えた問題は優先、出した問題は繰り返さない）
			</div>
			<ul className="space-y-1.5">
				{items.map((q) => (
					<RelatedItem key={q.id} q={q} />
				))}
			</ul>
		</div>
	);
}
