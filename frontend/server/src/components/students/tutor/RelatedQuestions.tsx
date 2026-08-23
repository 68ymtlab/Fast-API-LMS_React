"use client";

// チューターの回答に添える「関連する演習問題」。教員が作った既存問題（questions テーブル）を
// 話題に近い順に並べたもので、LLM が問題を生成しているわけではない。
// 問題文は LMS の他画面と同じ Markdown+MathJax 流儀（数式内のバックスラッシュは二重化済み）なのでそのまま渡す。
import { ChevronDown, ChevronUp, ExternalLink, ListChecks } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MathJax } from "@/components/shared/MathJax";
import { Button } from "@/components/ui/button";

export type RelatedQuestion = {
	id: number;
	title: string;
	question_type: string;
	difficulty?: number | null;
	question: string;
	hint?: string;
	answers: { label: string; answers: unknown }[];
	score?: number;
	exercise_set?: {
		id: number;
		title: string;
		course_id: number;
		url: string;
	} | null;
};

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
					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							className="rounded-full"
							onClick={() => setShowAnswer((v) => !v)}
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
								<Link href={q.exercise_set.url}>
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

export function RelatedQuestions({ items }: { items: RelatedQuestion[] }) {
	if (!items?.length) return null;
	return (
		<div className="mt-3 rounded-xl border bg-muted/30 p-2">
			<div className="mb-1.5 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
				<ListChecks className="h-3.5 w-3.5" />
				関連する演習問題（教員が作成した問題から）
			</div>
			<ul className="space-y-1.5">
				{items.map((q) => (
					<RelatedItem key={q.id} q={q} />
				))}
			</ul>
		</div>
	);
}
