"use client";

// AI チューター チャット（共通コンポーネント）
//   - /tutor ページ（単体）と、教科書ページのサイドパネル（context 付き）の両方で使う
//   - API: /api/tutor/open | message | summary | reset （backend が tutor サービスへ中継）
// 移植元: agents/workspace/rag/project/tutor-web/app/tutor_web.html

import { Bot, Loader2, RotateCcw, Send, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MathJax } from "@/components/shared/MathJax";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import axios from "@/lib/axios";
import { TutorViz, type VizSpec } from "./TutorViz";

export type TutorContext = {
	course_id?: number | null;
	lesson_item_id?: number | null;
	lesson_page_id?: number | null;
};

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
	conversation_id?: number | null;
}

interface HistoryItem {
	seq: number;
	role: "student" | "tutor";
	text: string;
	choice_id?: string | null;
	banner?: string;
	citations?: Citation[];
	viz?: VizSpec | null;
	diagnosis?: ChoiceBundle | null;
	clarify?: ChoiceBundle | null;
}

interface OpenResponse {
	resumed: boolean;
	conversation_id: number | null;
	greeting: string;
	history: HistoryItem[];
	persistence: boolean;
}

export interface ChatMessage {
	id: number;
	role: "student" | "tutor" | "system";
	text: string;
	banner?: string;
	citations?: Citation[];
	viz?: VizSpec | null;
}

const CITATION_HEADING = "## 参考（教科書）";

// LLM の回答は Markdown として描画するため、数式内の `\\`（行区切り）や `\{` が Markdown のエスケープで
// 消えてしまう。$...$ / $$...$$ / \(...\) / \[...\] の内側だけバックスラッシュを二重化して MathJax に無傷で渡す。
const MATH_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;
function protectMath(text: string): string {
	return text.replace(MATH_RE, (m) => m.replace(/\\/g, "\\\\"));
}

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

type Props = {
	context?: TutorContext | null;
	/** サイドパネル用: 余白を詰め、見出しを省く */
	compact?: boolean;
	className?: string;
	/** 親がサービス状態を知りたいとき */
	onServiceStatus?: (ok: boolean) => void;
};

export function TutorChat({
	context,
	compact = false,
	className = "",
	onServiceStatus,
}: Props) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [sending, setSending] = useState(false);
	const [opening, setOpening] = useState(true);
	const [choices, setChoices] = useState<{
		kind: "diagnosis" | "clarify";
		bundle: ChoiceBundle;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const logRef = useRef<HTMLDivElement>(null);
	const idRef = useRef(0);
	const contextRef = useRef<TutorContext | null | undefined>(context);
	contextRef.current = context;

	const push = useCallback((m: Omit<ChatMessage, "id">) => {
		idRef.current += 1;
		setMessages((prev) => [...prev, { ...m, id: idRef.current }]);
	}, []);

	const openSession = useCallback(async () => {
		setOpening(true);
		setError(null);
		try {
			const res = await axios.post<OpenResponse>("/tutor/open", {
				context: contextRef.current ?? null,
			});
			const data = res.data;
			const restored: ChatMessage[] = [];
			for (const h of data.history ?? []) {
				idRef.current += 1;
				if (h.role === "student") {
					restored.push({
						id: idRef.current,
						role: "student",
						text: h.choice_id ? `${h.choice_id}.` : h.text,
					});
				} else {
					const bundle = h.diagnosis ?? h.clarify;
					restored.push({
						id: idRef.current,
						role: "tutor",
						text:
							bundle?.choices?.length && bundle.prompt
								? bundle.prompt
								: cleanReply(h.text, h.banner),
						banner: h.banner || undefined,
						citations: h.citations ?? [],
						viz: h.viz ?? null,
					});
				}
			}
			idRef.current += 1;
			restored.push({ id: idRef.current, role: "system", text: data.greeting });
			setMessages(restored);
			// 途中だった診断/clarify があれば選択肢を復元
			const last = (data.history ?? []).at(-1);
			const pending =
				last?.role === "tutor" ? (last.diagnosis ?? last.clarify) : null;
			setChoices(
				pending?.choices?.length
					? { kind: last?.diagnosis ? "diagnosis" : "clarify", bundle: pending }
					: null,
			);
			onServiceStatus?.(true);
		} catch {
			onServiceStatus?.(false);
			setMessages([]);
			setError(
				"チューターに接続できません。しばらくしてから再度お試しください。",
			);
		} finally {
			setOpening(false);
		}
	}, [onServiceStatus]);

	useEffect(() => {
		void openSession();
	}, [openSession]);

	// 教科書ページが変わったら、その旨を会話に残す（本文は送信ごとに backend が解決する）
	const lastPageRef = useRef<number | null | undefined>(undefined);
	useEffect(() => {
		const pid = context?.lesson_page_id ?? null;
		if (lastPageRef.current === undefined) {
			lastPageRef.current = pid;
			return;
		}
		if (pid !== lastPageRef.current) {
			lastPageRef.current = pid;
			if (pid)
				push({
					role: "system",
					text: "開いているページが変わりました。このページについても、そのまま聞けます。",
				});
		}
	}, [context?.lesson_page_id, push]);

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
					context: contextRef.current ?? null,
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
				});
				setChoices(
					bundle?.choices?.length
						? { kind: data.diagnosis ? "diagnosis" : "clarify", bundle }
						: null,
				);
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
			setChoices(null);
			setMessages([]);
			await openSession();
		} catch {
			setError("リセットに失敗しました。");
		} finally {
			setSending(false);
		}
	};

	return (
		<div className={`flex min-h-0 flex-1 flex-col ${className}`}>
			<div
				className={`flex shrink-0 items-center justify-end gap-1 ${compact ? "px-2 pt-1" : "px-3 pt-2"}`}
			>
				<Button
					variant="ghost"
					size="sm"
					onClick={onSummary}
					disabled={sending || opening}
				>
					振り返り
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={onReset}
					disabled={sending || opening}
					title="会話をリセット"
				>
					<RotateCcw className="h-4 w-4" />
				</Button>
			</div>
			<div
				ref={logRef}
				className={`min-h-0 flex-1 space-y-4 overflow-y-auto ${compact ? "p-3" : "p-4"}`}
			>
				{opening ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						前回の記録を確認中…
					</div>
				) : null}
				{!opening && messages.length <= 1 ? (
					<p className="text-sm text-muted-foreground">
						例：「固有値って何ですか？」「行列式の余因子展開のやり方は？」「この式がよくわからない」
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
									<MathJax text={protectMath(m.text)} />
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
														<MathJax text={protectMath(c.excerpt)} />
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
			</div>

			<div className={`shrink-0 space-y-2 border-t ${compact ? "p-2" : "p-3"}`}>
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
						placeholder={
							context?.lesson_page_id
								? "このページについて質問（Enterで送信）"
								: "質問を入力（Enterで送信、Shift+Enterで改行）"
						}
						rows={2}
						disabled={sending || opening}
						className="min-h-[2.5rem] resize-none"
					/>
					<Button
						onClick={onSubmit}
						disabled={sending || opening || !input.trim()}
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
		</div>
	);
}
