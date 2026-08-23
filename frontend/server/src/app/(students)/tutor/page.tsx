"use client";

// AI チューター（線形代数 RAG チュータ）
// 移植元: agents/workspace/rag/project/tutor-web/app/tutor_web.html
// API: /api/tutor/* （backend が tutor サービスへ中継。学生IDは JWT から決まる）

import { Bot, Loader2, RotateCcw, Send, Sparkles, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MathJax, MathJaxSetup } from "@/components/shared/MathJax";
import TcAccessTime from "@/components/tc_access_time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import axios from "@/lib/axios";
import { TutorViz, type VizSpec } from "./components/TutorViz";

type Choice = { id: string; label: string };
type ChoiceBundle = { prompt?: string; choices?: Choice[] };
type Citation = { section?: string; type?: string; excerpt?: string };

interface TutorMessageResponse {
	reply: string;
	state: Record<string, unknown>;
	diagnosis?: ChoiceBundle | null;
	clarify?: ChoiceBundle | null;
	citations?: Citation[];
	knowledge_mode?: string;
	banner?: string;
	retrieval_path?: string;
	turn_class?: string;
	viz?: VizSpec | null;
}

interface ChatMessage {
	id: number;
	role: "student" | "tutor" | "system";
	text: string;
	banner?: string;
	citations?: Citation[];
	viz?: VizSpec | null;
	knowledgeMode?: string;
}

const CITATION_HEADING = "## 参考（教科書）";

// 回答本文から、システムが付ける「参考」ブロックとバナーを取り除く（出典は別枠で表示）
function cleanReply(reply: string, banner?: string): string {
	let text = reply ?? "";
	if (banner && text.startsWith(banner)) {
		text = text.slice(banner.length).replace(/^\n+/, "");
	}
	const idx = text.indexOf(CITATION_HEADING);
	if (idx >= 0) text = text.slice(0, idx).trimEnd();
	return text;
}

export default function TutorPage() {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [sending, setSending] = useState(false);
	const [choices, setChoices] = useState<{
		kind: "diagnosis" | "clarify";
		bundle: ChoiceBundle;
	} | null>(null);
	const [serviceOk, setServiceOk] = useState<boolean | null>(null);
	const [error, setError] = useState<string | null>(null);
	const logRef = useRef<HTMLDivElement>(null);
	const idRef = useRef(0);

	const push = useCallback((m: Omit<ChatMessage, "id">) => {
		idRef.current += 1;
		setMessages((prev) => [...prev, { ...m, id: idRef.current }]);
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await axios.get<{ ok: boolean }>("/tutor/health");
				if (!cancelled) setServiceOk(Boolean(res.data?.ok));
			} catch {
				if (!cancelled) setServiceOk(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: メッセージ追加・送信状態の変化をトリガに末尾へスクロールする
	useEffect(() => {
		const el = logRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages, sending]);

	const send = useCallback(
		async (payload: { text?: string; choice_id?: string }, echo: string) => {
			if (sending) return;
			setSending(true);
			setError(null);
			push({ role: "student", text: echo });
			try {
				const res = await axios.post<TutorMessageResponse>("/tutor/message", {
					text: payload.text ?? "",
					choice_id: payload.choice_id ?? null,
				});
				const data = res.data;
				const bundle = data.diagnosis ?? data.clarify;
				push({
					role: "tutor",
					// 選択肢はボタンとして別枠に出すので、吹き出しには問いかけ文だけを残す
					text:
						bundle?.choices?.length && bundle.prompt
							? bundle.prompt
							: cleanReply(data.reply, data.banner),
					banner: data.banner || undefined,
					citations: data.citations ?? [],
					viz: data.viz ?? null,
					knowledgeMode: data.knowledge_mode,
				});
				if (bundle?.choices?.length) {
					setChoices({
						kind: data.diagnosis ? "diagnosis" : "clarify",
						bundle,
					});
				} else {
					setChoices(null);
				}
			} catch (e: unknown) {
				const detail =
					(e as { response?: { data?: { detail?: string } } })?.response?.data
						?.detail ?? "チューターとの通信に失敗しました。";
				setError(String(detail));
			} finally {
				setSending(false);
			}
		},
		[push, sending],
	);

	const onSubmit = async () => {
		const text = input.trim();
		if (!text) return;
		setInput("");
		await send({ text }, text);
	};

	const onChoice = async (c: Choice) => {
		setChoices(null);
		await send({ choice_id: c.id }, `${c.id}. ${c.label}`);
	};

	const onSummary = async () => {
		if (sending) return;
		setSending(true);
		setError(null);
		try {
			const res = await axios.get<{ summary: string }>("/tutor/summary");
			push({
				role: "system",
				text: res.data.summary || "（まだ記録がありません）",
			});
		} catch {
			setError("まとめの取得に失敗しました。");
		} finally {
			setSending(false);
		}
	};

	const onReset = async () => {
		if (sending) return;
		setSending(true);
		setError(null);
		try {
			await axios.post("/tutor/reset");
			setMessages([]);
			setChoices(null);
			push({ role: "system", text: "新しいセッションを開始しました。" });
		} catch {
			setError("リセットに失敗しました。");
		} finally {
			setSending(false);
		}
	};

	return (
		<MathJaxSetup>
			<TcAccessTime page="tutor" />
			<div className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-4xl flex-col gap-3 p-4">
				<Card className="shrink-0">
					<CardHeader className="py-4">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<CardTitle className="flex items-center gap-2 text-lg">
									<Sparkles className="h-5 w-5" />
									AIチューター（線形代数）
								</CardTitle>
								<CardDescription>
									わからないところをそのまま聞いてください。教科書の該当箇所を引用しながら説明します。
								</CardDescription>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								{serviceOk === false ? (
									<Badge variant="destructive">停止中</Badge>
								) : null}
								<Button
									variant="outline"
									size="sm"
									onClick={onSummary}
									disabled={sending}
								>
									振り返り
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={onReset}
									disabled={sending}
									title="会話をリセット"
								>
									<RotateCcw className="h-4 w-4" />
								</Button>
							</div>
						</div>
					</CardHeader>
				</Card>

				<Card className="flex min-h-0 flex-1 flex-col">
					<CardContent
						ref={logRef}
						className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
					>
						{messages.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								例：「固有値って何ですか？」「行列式の余因子展開のやり方は？」「内積がよくわからない」
							</p>
						) : null}
						{messages.map((m) => (
							<div
								key={m.id}
								className={`flex gap-2 ${m.role === "student" ? "justify-end" : "justify-start"}`}
							>
								{m.role !== "student" ? (
									<div className="mt-1 shrink-0 self-start rounded-full bg-muted p-1.5">
										<Bot className="h-4 w-4" />
									</div>
								) : null}
								<div
									className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
										m.role === "student"
											? "bg-primary text-primary-foreground"
											: m.role === "system"
												? "border bg-muted/40"
												: "border bg-card"
									}`}
								>
									{m.banner ? (
										<div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
											{m.banner}
										</div>
									) : null}
									{m.role === "student" ? (
										<p className="whitespace-pre-wrap">{m.text}</p>
									) : (
										<div className="prose prose-sm max-w-none dark:prose-invert">
											<MathJax text={m.text} />
										</div>
									)}
									<TutorViz viz={m.viz} />
									{m.citations && m.citations.length > 0 ? (
										<details className="mt-2 text-xs text-muted-foreground">
											<summary className="cursor-pointer select-none">
												参考（教科書） {m.citations.length}件
											</summary>
											<ul className="mt-1 list-disc space-y-1 pl-4">
												{m.citations.map((c, i) => (
													<li key={`${c.section ?? ""}-${i}`}>
														<span className="font-medium">
															{(c.section ?? "").replace(/^#+\s*/, "")}
														</span>
														{c.type ? <span> / {c.type}</span> : null}
														{c.excerpt ? (
															<div className="mt-0.5 line-clamp-3 opacity-80">
																<MathJax text={c.excerpt} />
															</div>
														) : null}
													</li>
												))}
											</ul>
										</details>
									) : null}
								</div>
								{m.role === "student" ? (
									<div className="mt-1 shrink-0 self-start rounded-full bg-primary/10 p-1.5">
										<User className="h-4 w-4" />
									</div>
								) : null}
							</div>
						))}
						{sending ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								考え中…
							</div>
						) : null}
					</CardContent>

					<div className="shrink-0 space-y-2 border-t p-3">
						{choices?.bundle?.choices?.length ? (
							<div className="rounded-md border bg-muted/30 p-2">
								<p className="mb-2 text-xs text-muted-foreground">
									{choices.bundle.prompt ?? "選んでください"}
								</p>
								<div className="flex flex-wrap gap-2">
									{choices.bundle.choices.map((c) => (
										<Button
											key={c.id}
											variant="secondary"
											size="sm"
											disabled={sending}
											onClick={() => onChoice(c)}
										>
											<span className="mr-1 font-mono">{c.id}.</span>
											{c.label}
										</Button>
									))}
								</div>
							</div>
						) : null}
						{error ? <p className="text-xs text-destructive">{error}</p> : null}
						<div className="flex items-end gap-2">
							<Textarea
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={(e) => {
									if (
										e.key === "Enter" &&
										!e.shiftKey &&
										!e.nativeEvent.isComposing
									) {
										e.preventDefault();
										void onSubmit();
									}
								}}
								placeholder="質問を入力（Enterで送信、Shift+Enterで改行）"
								rows={2}
								disabled={sending}
								className="min-h-[2.5rem] resize-none"
							/>
							<Button
								onClick={onSubmit}
								disabled={sending || !input.trim()}
								size="icon"
								aria-label="送信"
							>
								{sending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Send className="h-4 w-4" />
								)}
							</Button>
						</div>
					</div>
				</Card>
			</div>
		</MathJaxSetup>
	);
}
