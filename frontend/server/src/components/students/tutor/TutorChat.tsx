"use client";

// AI チューター チャット（共通コンポーネント）
//   - /tutor ページ（showSidebar: 会話一覧付き）と、教科書ページのサイドパネル（compact, context 付き）で使う
//   - API: /api/tutor/open | message | conversations | preferences | summary | reset（backend が tutor サービスへ中継）
//   - 見た目は ChatGPT / Gemini / Claude に寄せる: 左に会話一覧、中央は枠のないメッセージ列、下に丸い入力欄
// 移植元: agents/workspace/rag/project/tutor-web/app/tutor_web.html

import {
	ArrowUp,
	Check,
	ChevronDown,
	Loader2,
	MessageSquare,
	PanelLeft,
	PanelLeftClose,
	Pencil,
	Plus,
	RotateCcw,
	SlidersHorizontal,
	Sparkles,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import axios from "@/lib/axios";
import { type Reflection, ReflectionCard } from "./ReflectionCard";
import {
	type RelatedMeta,
	type RelatedQuestion,
	RelatedQuestions,
} from "./RelatedQuestions";
import { SafeMathJax } from "./SafeMathJax";
import { TutorViz, type VizSpec } from "./TutorViz";

export type TutorContext = {
	course_id?: number | null;
	lesson_item_id?: number | null;
	lesson_page_id?: number | null;
};

export type AnswerLength = "short" | "normal" | "long";
const LENGTH_OPTIONS: { value: AnswerLength; label: string; hint: string }[] = [
	{ value: "short", label: "短め", hint: "結論を2〜4文で" },
	{ value: "normal", label: "ふつう", hint: "理解度に合わせた長さ" },
	{ value: "long", label: "詳しく", hint: "例・途中計算・誤解しやすい点まで" },
];

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
	viz?: VizSpec | null;
	conversation_id?: number | null;
	related_questions?: RelatedQuestion[];
	related_meta?: RelatedMeta | null;
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

export interface ConversationItem {
	id: number;
	title: string;
	page_title?: string | null;
	turn_count?: number;
	ended?: boolean;
	last_activity_at?: string | null;
}

interface OpenResponse {
	resumed: boolean;
	conversation_id: number | null;
	greeting: string;
	history: HistoryItem[];
	persistence: boolean;
	answer_length?: AnswerLength;
	conversations?: ConversationItem[];
}

export interface ChatMessage {
	id: number;
	role: "student" | "tutor" | "system";
	text: string;
	banner?: string;
	citations?: Citation[];
	viz?: VizSpec | null;
	relatedQuestions?: RelatedQuestion[];
	relatedMeta?: RelatedMeta | null;
	reflection?: Reflection | null;
	reflectionMeta?: { level?: string; goal?: string };
}

const CITATION_HEADING = "## 参考（教科書）";

// LLM の回答は Markdown として描画するため、数式内の `\\`（行区切り）や `\{` が Markdown のエスケープで
// 消えてしまう。$...$ / $$...$$ / \(...\) / \[...\] の内側だけバックスラッシュを二重化して MathJax に無傷で渡す。
const MATH_RE =
	/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;
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

function relativeTime(iso?: string | null): string {
	if (!iso) return "";
	const diff = Date.now() - new Date(iso).getTime();
	const m = Math.floor(diff / 60000);
	if (m < 1) return "たった今";
	if (m < 60) return `${m}分前`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}時間前`;
	const d = Math.floor(h / 24);
	if (d < 7) return `${d}日前`;
	return new Date(iso).toLocaleDateString("ja-JP", {
		month: "numeric",
		day: "numeric",
	});
}

function historyToMessages(
	history: HistoryItem[],
	nextId: () => number,
): {
	messages: ChatMessage[];
	pending: ChoiceBundle | null;
	pendingKind: "diagnosis" | "clarify";
} {
	const out: ChatMessage[] = [];
	for (const h of history) {
		if (h.role === "student") {
			out.push({
				id: nextId(),
				role: "student",
				text: h.choice_id ? `${h.choice_id}.` : h.text,
			});
		} else {
			const bundle = h.diagnosis ?? h.clarify;
			out.push({
				id: nextId(),
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
	const last = history.at(-1);
	const pending =
		last?.role === "tutor" ? (last.diagnosis ?? last.clarify ?? null) : null;
	return {
		messages: out,
		pending: pending?.choices?.length ? pending : null,
		pendingKind: last?.diagnosis ? "diagnosis" : "clarify",
	};
}

type Props = {
	context?: TutorContext | null;
	/** サイドパネル用: 余白を詰める */
	compact?: boolean;
	/** /tutor ページ用: 左に会話一覧を出す */
	showSidebar?: boolean;
	className?: string;
	onServiceStatus?: (ok: boolean) => void;
};

export function TutorChat({
	context,
	compact = false,
	showSidebar = false,
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
	const [answerLength, setAnswerLength] = useState<AnswerLength>("normal");
	const [conversations, setConversations] = useState<ConversationItem[]>([]);
	const [currentId, setCurrentId] = useState<number | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(false); // モバイル: オーバーレイ表示
	const [sidebarVisible, setSidebarVisible] = useState(true); // デスクトップ: 畳む／広げる（記憶する）
	useEffect(() => {
		try {
			if (window.localStorage.getItem("tutor.sidebar") === "0")
				setSidebarVisible(false);
		} catch {
			/* localStorage が使えない環境は既定（表示）のまま */
		}
	}, []);
	const toggleSidebar = () => {
		if (window.matchMedia("(min-width: 768px)").matches) {
			setSidebarVisible((v) => {
				try {
					window.localStorage.setItem("tutor.sidebar", v ? "0" : "1");
				} catch {
					/* ignore */
				}
				return !v;
			});
		} else {
			setSidebarOpen((v) => !v);
		}
	};
	const [editingId, setEditingId] = useState<number | null>(null);
	const [editingTitle, setEditingTitle] = useState("");
	const logRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const idRef = useRef(0);
	const nextId = useCallback(() => ++idRef.current, []);
	const contextRef = useRef<TutorContext | null | undefined>(context);
	contextRef.current = context;

	const push = useCallback((m: Omit<ChatMessage, "id">) => {
		setMessages((prev) => [...prev, { ...m, id: ++idRef.current }]);
	}, []);

	const refreshConversations = useCallback(async () => {
		try {
			const res = await axios.get<{
				current_id: number | null;
				items: ConversationItem[];
			}>("/tutor/conversations");
			setConversations(res.data.items ?? []);
			setCurrentId(res.data.current_id ?? null);
		} catch {
			/* 一覧は補助情報なので失敗しても会話は続ける */
		}
	}, []);

	const openSession = useCallback(async () => {
		setOpening(true);
		setError(null);
		try {
			const res = await axios.post<OpenResponse>("/tutor/open", {
				context: contextRef.current ?? null,
			});
			const data = res.data;
			const {
				messages: restored,
				pending,
				pendingKind,
			} = historyToMessages(data.history ?? [], nextId);
			restored.push({ id: nextId(), role: "system", text: data.greeting });
			setMessages(restored);
			setChoices(pending ? { kind: pendingKind, bundle: pending } : null);
			if (data.answer_length) setAnswerLength(data.answer_length);
			setCurrentId(data.conversation_id ?? null);
			if (data.conversations) setConversations(data.conversations);
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
	}, [onServiceStatus, nextId]);

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

	// 入力欄の高さを内容に合わせる（最大 8 行程度）
	// biome-ignore lint/correctness/useExhaustiveDependencies: 入力内容が変わるたびに高さを測り直す
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "0px";
		el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
	}, [input]);

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
					answer_length: answerLength,
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
					relatedQuestions: data.related_questions ?? [],
					relatedMeta: data.related_meta ?? null,
				});
				setChoices(
					bundle?.choices?.length
						? { kind: data.diagnosis ? "diagnosis" : "clarify", bundle }
						: null,
				);
				if (data.conversation_id && data.conversation_id !== currentId)
					setCurrentId(data.conversation_id);
				if (showSidebar) void refreshConversations();
			} catch (e: unknown) {
				const detail =
					(e as { response?: { data?: { detail?: string } } })?.response?.data
						?.detail ?? "チューターとの通信に失敗しました。";
				setError(String(detail));
			} finally {
				setSending(false);
			}
		},
		[push, sending, answerLength, currentId, showSidebar, refreshConversations],
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

	const onChangeLength = async (v: AnswerLength) => {
		setAnswerLength(v);
		try {
			await axios.post("/tutor/preferences", { answer_length: v });
		} catch {
			/* 次の送信時にも answer_length を付けるので致命的ではない */
		}
	};

	const onSummary = async () => {
		if (sending) return;
		setSending(true);
		setError(null);
		try {
			const res = await axios.get<{
				summary: string;
				structured?: Reflection | null;
				state?: Record<string, unknown>;
			}>("/tutor/summary");
			const ls = (res.data.state?.learner_state ?? {}) as {
				understanding_level?: string;
				goal?: string;
			};
			const LV: Record<string, string> = {
				none: "はじめて",
				heard: "聞いたことがある",
				can_compute: "計算できる",
				can_prove: "証明・一般化まで",
			};
			const GL: Record<string, string> = {
				intuition: "イメージをつかむ",
				application: "使い方を知る",
				definition: "定義を正確に",
				proof: "証明を理解する",
				generalization: "一般化・条件を知る",
			};
			if (res.data.structured?.did?.length) {
				push({
					role: "system",
					text: "振り返り",
					reflection: res.data.structured,
					reflectionMeta: {
						level: LV[ls.understanding_level ?? ""],
						goal: GL[ls.goal ?? ""],
					},
				});
			} else {
				push({
					role: "system",
					text: res.data.summary || "（まだ記録がありません）",
				});
			}
		} catch {
			setError("まとめの取得に失敗しました。");
		} finally {
			setSending(false);
		}
	};

	const onNewConversation = async () => {
		if (sending) return;
		setSending(true);
		setError(null);
		try {
			await axios.post("/tutor/conversations");
			setChoices(null);
			setMessages([]);
			setSidebarOpen(false);
			await openSession();
		} catch {
			setError("新しい会話を開始できませんでした。");
		} finally {
			setSending(false);
		}
	};

	const onSwitch = async (id: number) => {
		if (sending || id === currentId) {
			setSidebarOpen(false);
			return;
		}
		setSending(true);
		setError(null);
		try {
			const res = await axios.post<{
				conversation_id: number;
				history: HistoryItem[];
			}>(`/tutor/conversations/${id}/switch`);
			const {
				messages: restored,
				pending,
				pendingKind,
			} = historyToMessages(res.data.history ?? [], nextId);
			setMessages(restored);
			setChoices(pending ? { kind: pendingKind, bundle: pending } : null);
			setCurrentId(id);
			setSidebarOpen(false);
		} catch {
			setError("会話を開けませんでした。");
		} finally {
			setSending(false);
		}
	};

	const onRename = async (id: number) => {
		const title = editingTitle.trim();
		setEditingId(null);
		if (!title) return;
		try {
			await axios.put(`/tutor/conversations/${id}`, { title });
			setConversations((prev) =>
				prev.map((c) => (c.id === id ? { ...c, title } : c)),
			);
		} catch {
			setError("名前を変更できませんでした。");
		}
	};

	const onDelete = async (id: number) => {
		if (!window.confirm("この会話を一覧から削除しますか？")) return;
		try {
			await axios.delete(`/tutor/conversations/${id}`);
			setConversations((prev) => prev.filter((c) => c.id !== id));
			if (id === currentId) {
				setMessages([]);
				setChoices(null);
				await openSession();
			}
		} catch {
			setError("削除できませんでした。");
		}
	};

	const sidebar = showSidebar ? (
		<aside
			className={`absolute inset-y-0 left-0 z-20 flex w-64 shrink-0 flex-col overflow-hidden border-r bg-muted/40 backdrop-blur transition-[transform,width,opacity] duration-200 md:static md:translate-x-0 ${
				sidebarOpen ? "translate-x-0" : "-translate-x-full"
			} ${sidebarVisible ? "md:w-64 md:opacity-100" : "md:w-0 md:border-r-0 md:opacity-0"}`}
			aria-hidden={!sidebarOpen && !sidebarVisible}
		>
			<div className="flex items-center gap-1 p-2">
				<Button
					variant="ghost"
					className="flex-1 justify-start gap-2"
					onClick={onNewConversation}
					disabled={sending || opening}
				>
					<Plus className="h-4 w-4" />
					新しい会話
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={toggleSidebar}
					aria-label="会話履歴を隠す"
					title="会話履歴を隠す"
				>
					<PanelLeftClose className="h-4 w-4" />
				</Button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
				{conversations.length === 0 ? (
					<p className="px-2 py-4 text-xs text-muted-foreground">
						保存された会話はまだありません。
					</p>
				) : null}
				<ul className="space-y-0.5">
					{conversations.map((c) => {
						const active = c.id === currentId;
						return (
							<li
								key={c.id}
								className={`group rounded-md ${active ? "bg-background shadow-sm" : "hover:bg-background/70"}`}
							>
								{editingId === c.id ? (
									<div className="flex items-center gap-1 px-2 py-1">
										<input
											className="h-7 min-w-0 flex-1 rounded border bg-background px-2 text-sm"
											value={editingTitle}
											onChange={(e) => setEditingTitle(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") void onRename(c.id);
												if (e.key === "Escape") setEditingId(null);
											}}
											// biome-ignore lint/a11y/noAutofocus: 名前変更を始めた直後にそのまま入力できるようにする
											autoFocus
										/>
										<Button
											variant="ghost"
											size="icon"
											className="h-7 w-7"
											onClick={() => onRename(c.id)}
											aria-label="保存"
										>
											<Check className="h-3.5 w-3.5" />
										</Button>
									</div>
								) : (
									<div className="flex items-center">
										<button
											type="button"
											className="flex min-w-0 flex-1 flex-col items-start px-3 py-2 text-left"
											onClick={() => onSwitch(c.id)}
											title={c.title}
										>
											<span className="w-full truncate text-sm">{c.title}</span>
											<span className="text-[11px] text-muted-foreground">
												{relativeTime(c.last_activity_at)}
												{c.page_title ? ` · ${c.page_title}` : ""}
											</span>
										</button>
										<div className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7"
												onClick={() => {
													setEditingId(c.id);
													setEditingTitle(c.title);
												}}
												aria-label="名前を変更"
											>
												<Pencil className="h-3.5 w-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7"
												onClick={() => onDelete(c.id)}
												aria-label="削除"
											>
												<Trash2 className="h-3.5 w-3.5" />
											</Button>
										</div>
									</div>
								)}
							</li>
						);
					})}
				</ul>
			</div>
		</aside>
	) : null;

	const currentTitle = conversations.find((c) => c.id === currentId)?.title;
	const showEmptyState =
		!opening && messages.filter((m) => m.role !== "system").length === 0;

	return (
		<div
			className={`relative flex min-h-0 flex-1 overflow-hidden ${className}`}
		>
			{sidebar}
			{showSidebar && sidebarOpen ? (
				<button
					type="button"
					className="absolute inset-0 z-10 bg-black/20 md:hidden"
					onClick={() => setSidebarOpen(false)}
					aria-label="サイドバーを閉じる"
				/>
			) : null}

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				{/* 上部バー: 会話タイトルと最小限の操作 */}
				<div
					className={`flex shrink-0 items-center gap-1 ${compact ? "px-2 py-1" : "px-3 py-2"}`}
				>
					{showSidebar ? (
						<Button
							variant="ghost"
							size="icon"
							onClick={toggleSidebar}
							aria-label="会話履歴を表示／隠す"
							title="会話履歴を表示／隠す"
							aria-pressed={sidebarVisible}
						>
							<PanelLeft className="h-4 w-4" />
						</Button>
					) : null}
					<div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
						{currentTitle ?? (compact ? "" : "AIチューター")}
					</div>
					<Button
						variant="ghost"
						size="sm"
						onClick={onSummary}
						disabled={sending || opening}
						title="この会話の振り返り"
					>
						振り返り
					</Button>
					{!showSidebar ? (
						<Button
							variant="ghost"
							size="icon"
							onClick={onNewConversation}
							disabled={sending || opening}
							title="新しい会話"
							aria-label="新しい会話"
						>
							<RotateCcw className="h-4 w-4" />
						</Button>
					) : null}
				</div>

				{/* メッセージ列 */}
				<div ref={logRef} className="min-h-0 flex-1 overflow-y-auto">
					<div
						className={`mx-auto w-full ${compact ? "max-w-none px-3 py-2" : "max-w-3xl px-4 py-4"} space-y-6`}
					>
						{opening ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								前回の記録を確認中…
							</div>
						) : null}
						{showEmptyState ? (
							<div
								className={`flex flex-col items-center gap-4 text-center ${compact ? "py-6" : "py-16"}`}
							>
								<div className="rounded-full bg-muted p-3">
									<Sparkles className="h-6 w-6" />
								</div>
								<div>
									<p className="text-lg font-medium">何について学びますか？</p>
									<p className="mt-1 text-sm text-muted-foreground">
										線形代数の教科書をもとに、理解度に合わせて説明します。
									</p>
								</div>
								<div className="flex flex-wrap justify-center gap-2">
									{[
										"固有値って何ですか？",
										"行列式の余因子展開のやり方は？",
										"内積がよくわからない",
									].map((q) => (
										<Button
											key={q}
											variant="outline"
											size="sm"
											className="rounded-full"
											onClick={() => setInput(q)}
										>
											{q}
										</Button>
									))}
								</div>
							</div>
						) : null}
						{messages.map((m) =>
							m.role === "system" ? (
								m.reflection ? (
									<ReflectionCard
										key={m.id}
										r={m.reflection}
										level={m.reflectionMeta?.level}
										goal={m.reflectionMeta?.goal}
									/>
								) : /^##\s/m.test(m.text) ? (
									// 振り返りなど見出し付きの長文はカードで（幅いっぱい・通常サイズ）
									<div
										key={m.id}
										className="rounded-xl border bg-muted/30 px-4 py-3 text-sm"
									>
										<div className="prose prose-sm max-w-none dark:prose-invert">
											<SafeMathJax text={protectMath(m.text)} />
										</div>
									</div>
								) : (
									<div key={m.id} className="flex justify-center">
										<div className="max-w-[90%] rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
											{m.text}
										</div>
									</div>
								)
							) : m.role === "student" ? (
								<div key={m.id} className="flex justify-end">
									<div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-muted px-4 py-2 text-sm">
										{m.text}
									</div>
								</div>
							) : (
								<div key={m.id} className="flex gap-3">
									<div className="mt-0.5 shrink-0 self-start rounded-full border bg-background p-1.5">
										<Sparkles className="h-3.5 w-3.5" />
									</div>
									<div className="min-w-0 flex-1 text-sm leading-7">
										{m.banner ? (
											<div className="mb-2 inline-block rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
												{m.banner}
											</div>
										) : null}
										<div className="prose prose-sm max-w-none dark:prose-invert">
											<SafeMathJax text={protectMath(m.text)} />
										</div>
										<TutorViz viz={m.viz} />
										{m.relatedQuestions?.length || m.relatedMeta?.suppressed ? (
											<RelatedQuestions
												items={m.relatedQuestions ?? []}
												meta={m.relatedMeta}
											/>
										) : null}
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
																	<SafeMathJax text={protectMath(c.excerpt)} />
																</div>
															) : null}
														</li>
													))}
												</ul>
											</details>
										) : null}
									</div>
								</div>
							),
						)}
						{sending ? (
							<div className="flex items-center gap-3 text-sm text-muted-foreground">
								<div className="rounded-full border bg-background p-1.5">
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
								</div>
								考え中…
							</div>
						) : null}
					</div>
				</div>

				{/* 入力欄 */}
				<div
					className={`shrink-0 ${compact ? "px-2 pb-2 pt-1" : "px-4 pb-4 pt-2"}`}
				>
					<div
						className={`mx-auto w-full ${compact ? "max-w-none" : "max-w-3xl"} space-y-2`}
					>
						{choices?.bundle?.choices?.length ? (
							<div className="rounded-xl border bg-muted/30 p-2">
								<p className="mb-2 px-1 text-xs text-muted-foreground">
									{choices.bundle.prompt ?? "選んでください"}
								</p>
								<div className="flex flex-wrap gap-2">
									{choices.bundle.choices.map((c) => (
										<Button
											key={c.id}
											variant="secondary"
											size="sm"
											className="rounded-full"
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
						{/* 回答の長さ: 普段は小さなボタンだけ。押したときに3択（説明付き）が開く */}
						<div className="flex items-center justify-between px-1">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="sm"
										className="h-7 gap-1.5 rounded-full px-2 text-xs text-muted-foreground"
									>
										<SlidersHorizontal className="h-3.5 w-3.5" />
										回答の長さ:{" "}
										<span className="font-medium text-foreground">
											{
												LENGTH_OPTIONS.find((o) => o.value === answerLength)
													?.label
											}
										</span>
										<ChevronDown className="h-3 w-3" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start" className="w-72">
									<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
										回答の長さ（次の回答から反映。設定は保存されます）
									</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuRadioGroup
										value={answerLength}
										onValueChange={(v) => onChangeLength(v as AnswerLength)}
									>
										{LENGTH_OPTIONS.map((o) => (
											<DropdownMenuRadioItem
												key={o.value}
												value={o.value}
												className="flex-col items-start gap-0 py-2"
											>
												<span className="text-sm">{o.label}</span>
												<span className="text-xs text-muted-foreground">
													{o.hint}
												</span>
											</DropdownMenuRadioItem>
										))}
									</DropdownMenuRadioGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
						{error ? (
							<p className="px-1 text-xs text-destructive">{error}</p>
						) : null}
						<div className="flex items-end gap-2 rounded-2xl border bg-background py-1.5 pr-1.5 pl-2 shadow-sm focus-within:ring-1 focus-within:ring-ring">
							<textarea
								ref={textareaRef}
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
										? "このページについて質問する"
										: "質問する"
								}
								rows={1}
								disabled={sending || opening}
								className="block min-h-[2.25rem] w-full resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
							/>
							<Button
								onClick={onSubmit}
								disabled={sending || opening || !input.trim()}
								size="icon"
								className="h-8 w-8 rounded-full"
								aria-label="送信"
							>
								{sending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<ArrowUp className="h-4 w-4" />
								)}
							</Button>
						</div>
						{!compact ? (
							<p className="px-1 text-center text-[11px] text-muted-foreground">
								<MessageSquare className="mr-1 inline h-3 w-3" />
								会話は保存され、次回は続きから再開できます。Enter
								で送信、Shift+Enter で改行。
							</p>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
