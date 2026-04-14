"use client";

import { useParams, useRouter } from "next/navigation";
import {
	memo,
	useCallback,
	useEffect,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
} from "react";
import { MathJax, MathJaxSetup } from "@/components/shared/MathJax";
import TcAccessTime from "@/components/tc_access_time";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import axios from "@/lib/axios";

// -----------------------------------------------------------------------
// DOM ハイライト適用ユーティリティ（コンポーネント外で定義）
// -----------------------------------------------------------------------

const MARKER_COLOR_MAP: Record<string, string> = {
	yellow: "#fff59d",
	pink: "#ffd6eb",
	green: "#d9fdd3",
	blue: "#dbeafe",
	orange: "#ffe4bf",
};

const STUDENT_RESUME_KEY = "student-last-learning-v1";

type StudentResumeSnapshot = {
	courseId: number;
	lessonItemId: number;
	page: number;
	href: string;
	savedAt: string;
};

function resolveMarkerColor(color: string | null | undefined): string {
	if (!color) return MARKER_COLOR_MAP.yellow;
	return MARKER_COLOR_MAP[color] ?? color;
}

function removeHighlights(container: HTMLElement) {
	container
		.querySelectorAll("span[data-textbook-marker]")
		.forEach((span) => {
			const parent = span.parentNode;
			if (!parent) return;
			while (span.firstChild) parent.insertBefore(span.firstChild, span);
			parent.removeChild(span);
		});
	container
		.querySelectorAll<HTMLElement>("[data-textbook-marker-math='true']")
		.forEach((el) => {
			el.removeAttribute("data-textbook-marker-math");
			el.removeAttribute("data-marker-id");
			el.style.backgroundColor = "";
			el.style.borderRadius = "";
			el.style.boxShadow = "";
			el.style.cursor = "";
			el.title = "";
		});
	container.normalize();
}

// 空白を正規化（比較用）。連続空白・改行を1スペースにし trim
function normalizeSpaces(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

function isIgnoredForMarker(node: Node): boolean {
	const parent =
		node.nodeType === Node.ELEMENT_NODE
			? (node as Element)
			: node.parentElement;
	if (!parent) return true;
	return !!parent.closest(
		"mjx-assistive-mml, .MJX_Assistive_MathML, script, style, noscript",
	);
}

function getMarkerTextNodes(container: HTMLElement): Text[] {
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
	const nodes: Text[] = [];
	let node = walker.nextNode() as Text | null;
	while (node) {
		if ((node.nodeValue?.length ?? 0) > 0 && !isIgnoredForMarker(node)) {
			nodes.push(node);
		}
		node = walker.nextNode() as Text | null;
	}
	return nodes;
}

function getMarkerFullText(container: HTMLElement): string {
	return getMarkerTextNodes(container)
		.map((n) => n.nodeValue ?? "")
		.join("");
}

function getMathJaxContainerIndex(container: HTMLElement, node: Node): number | null {
	const base =
		node.nodeType === Node.ELEMENT_NODE
			? (node as Element)
			: node.parentElement;
	if (!base) return null;
	const math = base.closest("mjx-container");
	if (!math) return null;
	const all = Array.from(container.querySelectorAll("mjx-container"));
	const idx = all.indexOf(math as Element);
	return idx >= 0 ? idx : null;
}

function getMathJaxContainerByIndex(
	container: HTMLElement,
	index: number | null,
): HTMLElement | null {
	if (typeof index !== "number" || index < 0) return null;
	const mathEls = container.querySelectorAll<HTMLElement>("mjx-container");
	return mathEls[index] ?? null;
}

function getMathJaxReadableText(mathEl: HTMLElement | null): string {
	if (!mathEl) return "";
	const assistiveText =
		mathEl
			.querySelector("mjx-assistive-mml, .MJX_Assistive_MathML")
			?.textContent?.trim() ?? "";
	if (assistiveText) return assistiveText;
	const ariaLabel = mathEl.getAttribute("aria-label")?.trim() ?? "";
	if (ariaLabel) return ariaLabel;
	return mathEl.textContent?.trim() ?? "";
}

function getSingleMathJaxIndexFromRange(
	container: HTMLElement,
	range: Range,
): number | null {
	const mathEls = Array.from(container.querySelectorAll<HTMLElement>("mjx-container"));
	const hit = mathEls
		.map((el, idx) => ({ el, idx }))
		.filter(({ el }) => {
			try {
				return range.intersectsNode(el);
			} catch {
				return false;
			}
		})
		.map(({ idx }) => idx);
	return hit.length === 1 ? hit[0] : null;
}

function getMathJaxIndexesFromRange(
	container: HTMLElement,
	range: Range,
): number[] {
	const mathEls = Array.from(container.querySelectorAll<HTMLElement>("mjx-container"));
	return mathEls
		.map((el, idx) => ({ el, idx }))
		.filter(({ el }) => {
			try {
				return range.intersectsNode(el);
			} catch {
				return false;
			}
		})
		.map(({ idx }) => idx);
}

// container.textContent と同じ基準で、任意の DOM 境界点を「文字オフセット」に変換する
function boundaryToTextOffset(
	container: HTMLElement,
	boundaryNode: Node,
	boundaryOffset: number,
): number | null {
	const nodes = getMarkerTextNodes(container);
	let acc = 0;

	// 境界が Text ノード内なら直接
	if (
		boundaryNode.nodeType === Node.TEXT_NODE &&
		!isIgnoredForMarker(boundaryNode)
	) {
		for (const node of nodes) {
			const len = node.nodeValue?.length ?? 0;
			if (node === boundaryNode) return acc + Math.min(Math.max(boundaryOffset, 0), len);
			acc += len;
		}
		return null;
	}

	// Element などの場合は、その境界位置を示す collapsed Range を作り、
	// 各テキストノードの先頭が境界以上になる最初の位置を返す
	const br = document.createRange();
	try {
		br.setStart(boundaryNode, boundaryOffset);
		br.collapse(true);
	} catch {
		return null;
	}

	for (const node of nodes) {
		const len = node.nodeValue?.length ?? 0;
		const cmp = br.comparePoint(node, 0);
		if (cmp >= 0) {
			// このテキストノード先頭が境界以上 → 現在の acc が境界位置
			return acc;
		}
		acc += len;
	}

	// 境界が全テキストノードより後ろなら、全文末尾
	return acc;
}

// Range から container.textContent 基準のオフセット [start, end) を求める
function rangeToTextOffsets(
	container: HTMLElement,
	range: Range,
): { start: number; end: number } | null {
	const start = boundaryToTextOffset(
		container,
		range.startContainer,
		range.startOffset,
	);
	const end = boundaryToTextOffset(
		container,
		range.endContainer,
		range.endOffset,
	);
	if (typeof start === "number" && typeof end === "number" && end > start) {
		return { start, end };
	}

	// フォールバック: 交差しているテキストノード群から最小/最大オフセットを推定
	const nodes = getMarkerTextNodes(container);
	let acc = 0;
	let startGuess: number | null = null;
	let endGuess: number | null = null;

	for (const node of nodes) {
		const len = node.nodeValue?.length ?? 0;
		const nodeStart = acc;
		const nodeEnd = acc + len;
		let intersects = false;
		try {
			intersects = range.intersectsNode(node);
		} catch {
			intersects = false;
		}

		if (intersects) {
			if (startGuess === null) startGuess = nodeStart;
			endGuess = nodeEnd;
		}
		acc = nodeEnd;
	}

	if (
		typeof startGuess === "number" &&
		typeof endGuess === "number" &&
		endGuess > startGuess
	) {
		return { start: startGuess, end: endGuess };
	}
	return null;
}

// マーカー位置の検索結果（開始インデックスとハイライトする長さ）
type MarkerMatch = { start: number; length: number };

// コンテナ全体のプレーンテキスト上で、マーカーの位置を探す
function findMarkerPositionInFullText(
	fullText: string,
	marker: TextbookMarkerType,
): MarkerMatch | null {
	const target = marker.exact_text.trim();
	if (!target) return null;

	const normTarget = normalizeSpaces(target);

	// 1) 完全一致で検索（prefix/suffix は空白正規化して比較）
	let pos = 0;
	while (pos <= fullText.length - target.length) {
		const idx = fullText.indexOf(target, pos);
		if (idx === -1) break;

		const prefixLen = marker.text_prefix?.length ?? 0;
		const suffixLen = marker.text_suffix?.length ?? 0;
		const rawPrefix = fullText.slice(
			Math.max(0, idx - Math.max(prefixLen, 40)),
			idx,
		);
		const rawSuffix = fullText.slice(
			idx + target.length,
			idx + target.length + Math.max(suffixLen, 40),
		);
		const prefixOk =
			!marker.text_prefix ||
			normalizeSpaces(rawPrefix).endsWith(
				normalizeSpaces(marker.text_prefix),
			);
		const suffixOk =
			!marker.text_suffix ||
			normalizeSpaces(rawSuffix).startsWith(
				normalizeSpaces(marker.text_suffix),
			);

		if (prefixOk && suffixOk) return { start: idx, length: target.length };
		pos = idx + target.length;
	}

	// 2) exact_text の最初の出現だけ使う
	const fallback = fullText.indexOf(target);
	if (fallback >= 0) return { start: fallback, length: target.length };

	// 3) 空白正規化した文字列で探す（改行・スペース差対策）
	for (let i = 0; i <= fullText.length - normTarget.length; i++) {
		let len = normTarget.length;
		const maxLen = Math.min(target.length + 300, fullText.length - i);
		for (; len <= maxLen; len++) {
			const slice = fullText.slice(i, i + len);
			if (normalizeSpaces(slice) === normTarget) {
				return { start: i, length: len };
			}
		}
	}
	return null;
}

// プレーンテキスト上のオフセット範囲 [start, end) から DOM Range を構築
function createRangeFromOffsets(
	container: HTMLElement,
	start: number,
	end: number,
): Range | null {
	const nodes = getMarkerTextNodes(container);
	let acc = 0;
	const range = document.createRange();
	let startSet = false;
	let endSet = false;

	for (const node of nodes) {
		const len = node.nodeValue?.length ?? 0;
		const nodeStart = acc;
		const nodeEnd = acc + len;

		if (!startSet && start >= nodeStart && start <= nodeEnd) {
			range.setStart(node, start - nodeStart);
			startSet = true;
		}

		if (startSet && end >= nodeStart && end <= nodeEnd) {
			range.setEnd(node, end - nodeStart);
			endSet = true;
			break;
		}

		acc = nodeEnd;
	}

	// start/end のどちらかでも決まらなければ不正なオフセットとして扱う
	if (startSet && endSet && !range.collapsed) {
		return range;
	}
	return null;
}

// note フィールドからオフセット情報をパース（新規マーカー用）
function parseMarkerNote(
	note: string | null,
): {
	offsets: { start: number; end: number } | null;
	mathIndex: number | null;
	mathIndexes: number[];
} {
	if (!note) return { offsets: null, mathIndex: null, mathIndexes: [] };
	try {
		const parsed = JSON.parse(note) as {
			s?: number;
			e?: number;
			mjx?: number;
			mjx_list?: unknown;
		};
		const offsets =
			typeof parsed.s === "number" &&
			typeof parsed.e === "number" &&
			parsed.s >= 0 &&
			parsed.e >= parsed.s
				? { start: parsed.s, end: parsed.e }
				: null;
		const mathIndex =
			typeof parsed.mjx === "number" && parsed.mjx >= 0
				? parsed.mjx
				: null;
		const mathIndexes = Array.isArray(parsed.mjx_list)
			? parsed.mjx_list.filter((v): v is number => typeof v === "number" && v >= 0)
			: [];
		return { offsets, mathIndex, mathIndexes };
	} catch {
		return { offsets: null, mathIndex: null, mathIndexes: [] };
	}
}

function parseOffsetsFromNote(
	note: string | null,
): { start: number; end: number } | null {
	if (!note) return null;
	try {
		const parsed = JSON.parse(note) as { s?: number; e?: number };
		if (
			typeof parsed.s === "number" &&
			typeof parsed.e === "number" &&
			parsed.s >= 0 &&
			parsed.e >= parsed.s
		) {
			return { start: parsed.s, end: parsed.e };
		}
	} catch {
		// 旧データなど JSON でない場合は無視
	}
	return null;
}

function applyHighlightsToDOM(
	container: HTMLElement,
	markers: TextbookMarkerType[],
) {
	removeHighlights(container);
	if (!markers.length) return;
	let markerFullTextCache: string | null = null;

	// 長いものから先に処理（短いマーカーが長いものの内側にあるのを防ぐ）
	const sorted = [...markers].sort(
		(a, b) => b.exact_text.length - a.exact_text.length,
	);

	for (const marker of sorted) {
		const target = marker.exact_text.trim();
		if (!target) continue;

		const normTarget = normalizeSpaces(target);
		const parsedNote = parseMarkerNote(marker.note);
		const offsets = parsedNote.offsets ?? parseOffsetsFromNote(marker.note);
		let range: Range | null = null;

		if (parsedNote.mathIndexes.length > 0) {
			const mathEls = container.querySelectorAll<HTMLElement>("mjx-container");
			for (const idx of parsedNote.mathIndexes) {
				const mathEl = mathEls[idx];
				if (!mathEl) continue;
				const color = marker.color || "yellow";
				mathEl.setAttribute("data-textbook-marker-math", "true");
				mathEl.setAttribute("data-marker-id", String(marker.id));
				const resolvedColor = resolveMarkerColor(color);
				mathEl.style.backgroundColor = resolvedColor;
				mathEl.style.borderRadius = "0.2em";
				mathEl.style.boxShadow = `inset 0 -0.35em 0 ${resolvedColor}`;
				mathEl.style.cursor = "context-menu";
				mathEl.title = "右クリックでマーカーを削除";
			}
			// offsets がある場合は本文側も続けてハイライトする
			if (!offsets) continue;
		}

		if (typeof parsedNote.mathIndex === "number") {
			const mathEls = container.querySelectorAll<HTMLElement>("mjx-container");
			const mathEl = mathEls[parsedNote.mathIndex];
			if (mathEl) {
				const color = marker.color || "yellow";
				const resolvedColor = resolveMarkerColor(color);
				mathEl.setAttribute("data-textbook-marker-math", "true");
				mathEl.setAttribute("data-marker-id", String(marker.id));
				mathEl.style.backgroundColor = resolvedColor;
				mathEl.style.borderRadius = "0.2em";
				mathEl.style.boxShadow = `inset 0 -0.35em 0 ${resolvedColor}`;
				mathEl.style.cursor = "context-menu";
				mathEl.title = "右クリックでマーカーを削除";
				// offsets がある場合は本文側も続けてハイライトする
				if (!offsets) continue;
			}
		}

		// 1) まず保存済みオフセットから Range を復元してみる
		if (offsets) {
			range = createRangeFromOffsets(container, offsets.start, offsets.end);
			if (range && !range.collapsed) {
				const rendered = range.toString();
				const normRendered = normalizeSpaces(rendered);

				// オフセットが明らかにおかしい（極端に短い/長い or 内容が全然違う）場合は無効として扱う
				const tooShort = normRendered.length < Math.min(normTarget.length * 0.4, normTarget.length - 10);
				const tooLong = normRendered.length > normTarget.length + 300;
				const headMatch =
					normTarget.length <= 30 ||
					normRendered.startsWith(normTarget.slice(0, Math.min(30, normTarget.length)));

				if (tooShort || tooLong || !headMatch) {
					range = null;
				}
			}
		}

		// 2) オフセットが使えない場合は、現在の本文テキストから検索して位置を決める
		if (!range) {
			if (markerFullTextCache === null) {
				markerFullTextCache = getMarkerFullText(container);
			}
			if (!markerFullTextCache) continue;
			const match = findMarkerPositionInFullText(markerFullTextCache, marker);
			if (!match) continue;
			const end = match.start + match.length;
			range = createRangeFromOffsets(container, match.start, end);
		}

		if (!range || range.collapsed) continue;

		// 最後の安全装置：レンダリングされた範囲が極端に長すぎる場合はスキップ（ページ全体が塗られるのを防ぐ）
		const finalRendered = range.toString();
		if (normalizeSpaces(finalRendered).length > normTarget.length + 400) continue;

		const spanAttrs = (span: HTMLSpanElement) => {
			span.setAttribute("data-textbook-marker", "true");
			span.setAttribute("data-marker-id", String(marker.id));
			span.style.backgroundColor = resolveMarkerColor(marker.color);
			// MathJaxの記号・数字が細かいノードに分かれる場合でも字間が開かないようにする
			span.style.padding = "0";
			span.style.borderRadius = "0.15em";
			span.style.cursor = "context-menu";
			span.title = "右クリックでマーカーを削除";
		};

		try {
			const span = document.createElement("span");
			spanAttrs(span);
			range.surroundContents(span);
		} catch {
			// ブロック要素をまたぐなどで一括で囲めない場合は、テキストノードごとに分割してハイライト
			applyHighlightBySegments(range, spanAttrs);
		}
	}
}

/** Range がブロックをまたぐ場合、テキストノード単位で span を当てる */
function applyHighlightBySegments(
	range: Range,
	spanAttrs: (span: HTMLSpanElement) => void,
) {
	const root =
		range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
			? (range.commonAncestorContainer as Element)
			: range.commonAncestorContainer.parentElement;
	if (!root) return;

	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
	const segments: { node: Text; start: number; end: number }[] = [];
	let node = walker.nextNode() as Text | null;

	while (node) {
		if ((node.nodeValue?.length ?? 0) > 0 && range.intersectsNode(node)) {
			const len = node.length;
			const segStart = node === range.startContainer ? range.startOffset : 0;
			const segEnd = node === range.endContainer ? range.endOffset : len;
			if (segStart < segEnd) {
				segments.push({ node, start: segStart, end: segEnd });
			}
		}
		node = walker.nextNode() as Text | null;
	}

	for (const { node: textNode, start, end } of segments) {
		// 改行や段落間の空白だけのセグメントはレイアウト崩れの原因になるのでスキップ
		const slice = textNode.data.slice(start, end);
		if (/^[\n\r\t ]*$/.test(slice)) continue;
		try {
			const seg = document.createRange();
			seg.setStart(textNode, start);
			seg.setEnd(textNode, end);
			const span = document.createElement("span");
			spanAttrs(span);
			seg.surroundContents(span);
		} catch {
			// このセグメントはスキップ（既に別の span に含まれている等）
		}
	}
}

// 新APIのレスポンス型定義
type LessonPageType = {
	id: number;
	lesson_id: number;
	page_number: number;
	title: string | null;
	raw_content_id: number | null;
	rendered_content_id: number | null;
	is_active: boolean;
	raw_content_body: string | null;
	rendered_content_body: string | null;
};

type LessonItemType = {
	id: number;
	lesson_id: number;
	title: string;
	item_content_type: string;
	display_order: number;
};

type TextbookMarkerType = {
	id: number;
	user_id: number;
	lesson_page_id: number;
	exact_text: string;
	text_prefix: string;
	text_suffix: string;
	color: string;
	note: string | null;
	created_at: string;
	updated_at: string;
};

type PopupState = {
	exactText: string;
	textPrefix: string;
	textSuffix: string;
	top: number;
	left: number;
	startOffset: number | null;
	endOffset: number | null;
	mathJaxIndex: number | null;
	mathJaxIndexes: number[];
};

type MarkerContextMenuState = {
	markerId: number;
	top: number;
	left: number;
};

const MARKER_COLOR_OPTIONS = [
	{ value: "yellow", label: "黄", hex: "#fff59d" },
	{ value: "pink", label: "桃", hex: "#ffd6eb" },
	{ value: "green", label: "緑", hex: "#d9fdd3" },
	{ value: "blue", label: "青", hex: "#dbeafe" },
	{ value: "orange", label: "橙", hex: "#ffe4bf" },
] as const;

// -----------------------------------------------------------------------
// React.memo でラップ → content が変わった時のみ再レンダリング
// markers が変わっても BetterMathJax は再タイプセットしないので
// useEffect で差し込んだ <span> が消えない
// -----------------------------------------------------------------------
const TextbookContent = memo(function TextbookContent({
	text,
}: { text: string }) {
	return (
		<MathJaxSetup>
			<MathJax text={text} />
		</MathJaxSetup>
	);
});

function countSatisfiedMarkers(
	container: HTMLElement,
	markerList: TextbookMarkerType[],
): number {
	const mathEls = Array.from(
		container.querySelectorAll<HTMLElement>("mjx-container"),
	);

	let satisfied = 0;
	for (const marker of markerList) {
		const markerId = String(marker.id);
		const noteInfo = parseMarkerNote(marker.note);
		const hasTextHighlight =
			container.querySelector(
				`span[data-textbook-marker][data-marker-id="${markerId}"]`,
			) !== null;

		let hasRequiredMathHighlight = true;
		if (noteInfo.mathIndexes.length > 0) {
			hasRequiredMathHighlight = noteInfo.mathIndexes.every((idx) => {
				const mathEl = mathEls[idx];
				return (
					!!mathEl &&
					mathEl.getAttribute("data-marker-id") === markerId &&
					mathEl.getAttribute("data-textbook-marker-math") === "true"
				);
			});
		} else if (typeof noteInfo.mathIndex === "number") {
			const mathEl = mathEls[noteInfo.mathIndex];
			hasRequiredMathHighlight =
				!!mathEl &&
				mathEl.getAttribute("data-marker-id") === markerId &&
				mathEl.getAttribute("data-textbook-marker-math") === "true";
		}

		const hasOffsets = !!noteInfo.offsets;
		const ok =
			hasRequiredMathHighlight &&
			(!hasOffsets || hasTextHighlight || marker.exact_text.startsWith("[math:"));
		if (ok) satisfied += 1;
	}
	return satisfied;
}

const LessonPage = () => {
	const router = useRouter();
	const params = useParams();
	const course_id = params.course_id as string;
	const lesson_item_id = params.lesson_id as string; // URL上は lesson_id だが実際は lesson_item_id
	const page = params.page as string;

	const [lessonItem, setLessonItem] = useState<LessonItemType | null>(null);
	const [pages, setPages] = useState<LessonPageType[]>([]);
	const [currentPage, setCurrentPage] = useState<LessonPageType | null>(null);
	const [content, setContent] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [markers, setMarkers] = useState<TextbookMarkerType[]>([]);
	const [markerMode, setMarkerMode] = useState(false);
	const [showMarkerHint, setShowMarkerHint] = useState(true);
	const [popup, setPopup] = useState<PopupState | null>(null);
	const [contextMenu, setContextMenu] = useState<MarkerContextMenuState | null>(null);
	const [markerSaving, setMarkerSaving] = useState(false);
	const [markerMessage, setMarkerMessage] = useState<string | null>(null);
	const [deletingMarkerIds, setDeletingMarkerIds] = useState<number[]>([]);
	const [updatingMarkerIds, setUpdatingMarkerIds] = useState<number[]>([]);
	const [selectedMarkerColor, setSelectedMarkerColor] = useState<string>("yellow");
	const containerRef = useRef<HTMLDivElement | null>(null);
	const popupRef = useRef<HTMLDivElement | null>(null);
	const contextMenuRef = useRef<HTMLDivElement | null>(null);
	const pointerDownRef = useRef(false);
	const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
	const selectionChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	// markersの最新値をeffect内から参照するためのref
	const markersRef = useRef<TextbookMarkerType[]>([]);
	markersRef.current = markers;
	const deleteInFlightRef = useRef<Set<number>>(new Set());
	const applyRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const applyRetryRafRef = useRef<number | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") return;
		window.sessionStorage.setItem("currentCourseId", course_id);
		window.sessionStorage.setItem("currentLessonId", lesson_item_id);

		const parsedCourseId = Number.parseInt(course_id, 10);
		const parsedLessonItemId = Number.parseInt(lesson_item_id, 10);
		const parsedPage = Number.parseInt(page, 10);
		if (
			Number.isNaN(parsedCourseId) ||
			Number.isNaN(parsedLessonItemId) ||
			Number.isNaN(parsedPage) ||
			parsedCourseId <= 0 ||
			parsedLessonItemId <= 0 ||
			parsedPage <= 0
		) {
			return;
		}

		const snapshot: StudentResumeSnapshot = {
			courseId: parsedCourseId,
			lessonItemId: parsedLessonItemId,
			page: parsedPage,
			href: `/lesson/${parsedCourseId}/${parsedLessonItemId}/${parsedPage}`,
			savedAt: new Date().toISOString(),
		};
		window.localStorage.setItem(STUDENT_RESUME_KEY, JSON.stringify(snapshot));
	}, [course_id, lesson_item_id, page]);

	// レッスン項目情報とページ一覧を取得
	useEffect(() => {
		const fetchData = async () => {
			setLoading(true);
			setError(null);
			try {
				// レッスン項目情報とページ一覧を並列取得
				const [itemRes, pagesRes] = await Promise.all([
					axios.get(`/lesson-item/${lesson_item_id}`),
					axios.get(`/lesson-items/${lesson_item_id}/lesson-pages`),
				]);
				setLessonItem(itemRes.data);
				const sortedPages = (pagesRes.data as LessonPageType[]).sort(
					(a, b) => a.page_number - b.page_number,
				);
				setPages(sortedPages);
			} catch (err: unknown) {
				console.error("データ取得に失敗しました:", err);
				setError("コンテンツの取得に失敗しました。");
			} finally {
				setLoading(false);
			}
		};

		fetchData();
	}, [lesson_item_id]);

	// ページ番号が変わったら現在のページを更新
	useEffect(() => {
		if (pages.length > 0) {
			const pageIndex = Number.parseInt(page) - 1;
			if (pageIndex >= 0 && pageIndex < pages.length) {
				const selectedPage = pages[pageIndex];
				setCurrentPage(selectedPage);
				// rendered_content_body があればそれを使用、なければ raw_content_body
				setContent(
					selectedPage.rendered_content_body ||
						selectedPage.raw_content_body ||
						"",
				);
			} else {
				setError("指定されたページが見つかりません。");
			}
		}
	}, [page, pages]);

	useEffect(() => {
		if (!currentPage?.id) {
			setMarkers([]);
			return;
		}
		setPopup(null);
		setMarkerMessage(null);
		axios
			.get(`/lesson-pages/${currentPage.id}/markers`)
			.then((res) => setMarkers((res.data as TextbookMarkerType[]) ?? []))
			.catch(() => setMarkers([]));
	}, [currentPage?.id]);

	// ----------------------------------------------------------------
	// ハイライト適用
	// - contentが変わった直後はMathJaxの非同期タイプセットを待って適用
	// - markersだけが変わった場合はDOMを再描画せずに即時適用
	// MutationObserverは使わない（DOM変更→再発火の無限ループを防ぐ）
	// ----------------------------------------------------------------
	const applyHighlights = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;
		applyHighlightsToDOM(container, markersRef.current);
	}, []);

	const clearApplyRetry = useCallback(() => {
		if (applyRetryTimerRef.current) {
			clearTimeout(applyRetryTimerRef.current);
			applyRetryTimerRef.current = null;
		}
		if (applyRetryRafRef.current !== null) {
			cancelAnimationFrame(applyRetryRafRef.current);
			applyRetryRafRef.current = null;
		}
	}, []);

	const scheduleApplyHighlights = useCallback((reason: "content" | "markers") => {
		clearApplyRetry();

		let attempt = 0;
		const maxAttempts = reason === "content" ? 12 : 6;

		const run = () => {
			applyHighlights();

			const container = containerRef.current;
			if (!container) return;

			const markerCount = markersRef.current.length;
			if (markerCount === 0) return;

			const satisfiedCount = countSatisfiedMarkers(
				container,
				markersRef.current,
			);
			if (satisfiedCount >= markerCount) return;

			if (attempt >= maxAttempts) {
				console.warn("[marker] highlight apply retry exceeded", {
					reason,
					markerCount,
					satisfiedCount,
				});
				return;
			}

			attempt += 1;
			const delay = reason === "content" ? 120 : 80;
			applyRetryTimerRef.current = setTimeout(run, delay);
		};

		applyRetryRafRef.current = requestAnimationFrame(run);
	}, [applyHighlights, clearApplyRetry]);

	useEffect(() => {
		// MathJax描画完了の揺らぎに備えて、content更新時は短時間リトライで適用
		scheduleApplyHighlights("content");
		return clearApplyRetry;
	}, [content, scheduleApplyHighlights, clearApplyRetry]);

	useEffect(() => {
		// markers更新直後はDOM確定前のことがあるため、即時 + 短時間リトライで補強
		scheduleApplyHighlights("markers");
	}, [markers, scheduleApplyHighlights]);

	// ----------------------------------------------------------------
	// テキスト選択でポップアップ表示（マウスカーソル付近に出す）
	// ----------------------------------------------------------------
	const openMarkerPopupFromSelection = useCallback((cursor?: {
		x: number;
		y: number;
	}) => {
		if (!markerMode) {
			// モードオフ時は何もしない
			return;
		}

		const container = containerRef.current;
		if (!container) {
			return;
		}

		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) {
			return;
		}

		const range = sel.getRangeAt(0);
		const inContainer =
			container.contains(range.commonAncestorContainer) ||
			(container.contains(range.startContainer) &&
				container.contains(range.endContainer));
		if (!inContainer) return;

		const fullText = getMarkerFullText(container);
		const offsets = rangeToTextOffsets(container, range);
		const startMathIndex = getMathJaxContainerIndex(container, range.startContainer);
		const endMathIndex = getMathJaxContainerIndex(container, range.endContainer);
		const mathJaxIndexByBoundary =
			startMathIndex !== null && startMathIndex === endMathIndex
				? startMathIndex
				: null;
		const mathJaxIndexes = getMathJaxIndexesFromRange(container, range);
		const mathJaxIndex =
			mathJaxIndexByBoundary ??
			(mathJaxIndexes.length === 1
				? mathJaxIndexes[0]
				: getSingleMathJaxIndexFromRange(container, range));

		let exactText = sel.toString().trim();
		if (!exactText) {
			exactText = range.toString().trim();
		}
		if (!exactText) {
			try {
				exactText = range.cloneContents().textContent?.trim() ?? "";
			} catch {
				// clone失敗時は次のフォールバックへ
			}
		}
		if (!exactText && offsets) {
			// Selection API が空文字を返すケースでも、可視テキスト基準の範囲文字列で補完
			exactText = fullText.slice(offsets.start, offsets.end).trim();
		}
		if (!exactText && mathJaxIndex !== null) {
			const mathEl = getMathJaxContainerByIndex(container, mathJaxIndex);
			exactText = getMathJaxReadableText(mathEl);
		}
		if (!exactText && mathJaxIndexes.length > 0) {
			exactText = mathJaxIndexes
				.map((idx) =>
					getMathJaxReadableText(getMathJaxContainerByIndex(container, idx)),
				)
				.filter(Boolean)
				.join(" ");
		}
		if (!exactText && mathJaxIndex !== null) {
			// ここまで空文字の場合でも、MathJax選択として扱えるよう保存キーを作る
			exactText = `[math:${mathJaxIndex}]`;
		}
		if (!exactText && mathJaxIndexes.length > 0) {
			exactText = `[math-list:${mathJaxIndexes.join(",")}]`;
		}
		if (!exactText) {
			setPopup(null);
			return;
		}
		// オフセット計算が失敗しても、選択文字列が取れていればポップアップは表示する
		// （長い数式・特殊DOMで boundary 計算が不安定なケースの取りこぼし防止）
		const startOffset = offsets?.start ?? null;
		const endOffset = offsets?.end ?? null;
		// offsets がある場合は、保存用の exactText を本文基準で統一する
		// （MathJax可読文字列優先だと本文が欠けて保存され、再適用で数式だけになる）
		if (typeof startOffset === "number" && typeof endOffset === "number") {
			const fromOffsets = fullText.slice(startOffset, endOffset).trim();
			if (fromOffsets) exactText = fromOffsets;
		}
		const textPrefix =
			typeof startOffset === "number"
				? fullText.slice(Math.max(0, startOffset - 20), startOffset)
				: "";
		const textSuffix =
			typeof endOffset === "number"
				? fullText.slice(endOffset, endOffset + 20)
				: "";

		// マウスカーソル位置を基準にポップアップ表示位置を決定
		// ポップアップは position: fixed なので、スクロール量は足さない（client 座標をそのまま使う）
		const rect = range.getBoundingClientRect();
		const cursorX = cursor?.x ?? rect.right;
		const cursorY = cursor?.y ?? rect.bottom;
		const popupTop = Math.max(8, cursorY + 8);
		const popupLeft = Math.min(
			Math.max(8, cursorX + 8),
			window.innerWidth - 220,
		);

		setPopup({
			exactText,
			textPrefix,
			textSuffix,
			top: popupTop,
			left: popupLeft,
			startOffset,
			endOffset,
			mathJaxIndex,
			mathJaxIndexes,
		});
	}, [markerMode]);

	const handleMouseUp = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
		openMarkerPopupFromSelection({ x: e.clientX, y: e.clientY });
	}, [openMarkerPopupFromSelection]);

	useEffect(() => {
		const onMouseUp = (e: globalThis.MouseEvent) => {
			pointerDownRef.current = false;
			lastPointerRef.current = { x: e.clientX, y: e.clientY };
			if (!markerMode) return;
			const targetNode = e.target as Node | null;
			if (
				(targetNode && popupRef.current?.contains(targetNode)) ||
				(targetNode && contextMenuRef.current?.contains(targetNode))
			) {
				return;
			}
			openMarkerPopupFromSelection({ x: e.clientX, y: e.clientY });
		};

		document.addEventListener("mouseup", onMouseUp);
		return () => document.removeEventListener("mouseup", onMouseUp);
	}, [markerMode, openMarkerPopupFromSelection]);

	useEffect(() => {
		const onSelectionChange = () => {
			if (!markerMode) return;
			if (pointerDownRef.current) return;
			if (selectionChangeTimerRef.current) {
				clearTimeout(selectionChangeTimerRef.current);
			}
			selectionChangeTimerRef.current = setTimeout(() => {
				const sel = window.getSelection();
				if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
				const range = sel.getRangeAt(0);
				const container = containerRef.current;
				if (!container) return;
				if (
					!container.contains(range.startContainer) ||
					!container.contains(range.endContainer)
				) {
					return;
				}
				openMarkerPopupFromSelection(lastPointerRef.current ?? undefined);
			}, 80);
		};

		document.addEventListener("selectionchange", onSelectionChange);
		return () => {
			document.removeEventListener("selectionchange", onSelectionChange);
			if (selectionChangeTimerRef.current) {
				clearTimeout(selectionChangeTimerRef.current);
				selectionChangeTimerRef.current = null;
			}
		};
	}, [markerMode, openMarkerPopupFromSelection]);

	useEffect(() => {
		const onDown = (e: globalThis.MouseEvent) => {
			pointerDownRef.current = true;
			lastPointerRef.current = { x: e.clientX, y: e.clientY };
			const targetNode = e.target as Node;
			const inContainer = !!containerRef.current?.contains(targetNode);
			const inPopup = !!popupRef.current?.contains(targetNode);
			const inContextMenu = !!contextMenuRef.current?.contains(targetNode);
			// 教科書本文 or ポップアップ内のクリックでは閉じない
			if (!inContainer && !inPopup) {
				setPopup(null);
			}
			if (!inContextMenu) {
				setContextMenu(null);
			}
		};
		const onBlur = () => {
			pointerDownRef.current = false;
		};
		document.addEventListener("mousedown", onDown);
		window.addEventListener("blur", onBlur);
		return () => {
			document.removeEventListener("mousedown", onDown);
			window.removeEventListener("blur", onBlur);
		};
	}, []);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setPopup(null);
				setContextMenu(null);
			}
		};
		const onScroll = () => {
			setContextMenu(null);
		};
		document.addEventListener("keydown", onKeyDown);
		window.addEventListener("scroll", onScroll, true);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("scroll", onScroll, true);
		};
	}, []);

	// ----------------------------------------------------------------
	// マーカー作成 / 削除
	// ----------------------------------------------------------------
	const deleteMarker = useCallback(async (id: number) => {
		if (deleteInFlightRef.current.has(id)) return;

		deleteInFlightRef.current.add(id);
		setDeletingMarkerIds((prev) =>
			prev.includes(id) ? prev : [...prev, id],
		);

		try {
			await axios.delete(`/textbook-markers/${id}`);
			setMarkers((prev) => prev.filter((m) => m.id !== id));
			setMarkerMessage(null);
		} catch (err) {
			const anyErr = err as any;
			if (anyErr?.response?.status === 404) {
				setMarkers((prev) => prev.filter((m) => m.id !== id));
				setMarkerMessage("対象マーカーは既に削除されています。");
			} else {
				setMarkerMessage("マーカーの削除に失敗しました。通信状態をご確認ください。");
			}
		} finally {
			deleteInFlightRef.current.delete(id);
			setDeletingMarkerIds((prev) => prev.filter((v) => v !== id));
		}
	}, []);

	const updateMarkerColor = useCallback(async (id: number, color: string) => {
		setMarkerMessage(null);
		setUpdatingMarkerIds((prev) =>
			prev.includes(id) ? prev : [...prev, id],
		);
		try {
			const res = (await axios.put(`/textbook-markers/${id}`, {
				color,
			})) as { data: TextbookMarkerType };
			setMarkers((prev) =>
				prev.map((m) => (m.id === id ? { ...m, color: res.data.color } : m)),
			);
		} catch (err) {
			const anyErr = err as any;
			if (anyErr?.response?.status === 404) {
				setMarkers((prev) => prev.filter((m) => m.id !== id));
				setMarkerMessage("対象マーカーが見つかりませんでした。");
			} else {
				setMarkerMessage("マーカー色の更新に失敗しました。");
			}
		} finally {
			setUpdatingMarkerIds((prev) => prev.filter((v) => v !== id));
		}
	}, []);

	const isSameMarkerRange = useCallback(
		(marker: TextbookMarkerType, currentPopup: PopupState) => {
			if (marker.exact_text !== currentPopup.exactText) return false;
			const parsed = parseMarkerNote(marker.note);
			const markerOffsets = parsed.offsets;
			const popupHasOffsets =
				typeof currentPopup.startOffset === "number" &&
				typeof currentPopup.endOffset === "number";
			const markerHasOffsets = !!markerOffsets;
			const popupHasMath = typeof currentPopup.mathJaxIndex === "number";
			const markerHasMath = typeof parsed.mathIndex === "number";
			const popupHasMathList = currentPopup.mathJaxIndexes.length > 0;
			const markerHasMathList = parsed.mathIndexes.length > 0;

			if (popupHasMathList || markerHasMathList) {
				if (!popupHasMathList || !markerHasMathList) return false;
				if (currentPopup.mathJaxIndexes.length !== parsed.mathIndexes.length) {
					return false;
				}
				return currentPopup.mathJaxIndexes.every(
					(v, i) => v === parsed.mathIndexes[i],
				);
			}

			if (popupHasMath || markerHasMath) {
				if (!popupHasMath || !markerHasMath) return false;
				return currentPopup.mathJaxIndex === parsed.mathIndex;
			}

			if (popupHasOffsets || markerHasOffsets) {
				if (!popupHasOffsets || !markerHasOffsets) return false;
				return (
					currentPopup.startOffset === markerOffsets.start &&
					currentPopup.endOffset === markerOffsets.end
				);
			}

			return (
				marker.text_prefix === currentPopup.textPrefix &&
				marker.text_suffix === currentPopup.textSuffix
			);
		},
		[],
	);

	const createMarker = async () => {
		if (!currentPage?.id || !popup || markerSaving) return;
		setMarkerSaving(true);
		setMarkerMessage(null);
		try {
			// 同一範囲の既存マーカーがある場合のみトグル/色変更する
			const sameRangeMarker = markers.find(
				(m) => isSameMarkerRange(m, popup),
			);

			if (sameRangeMarker) {
				console.log("[marker] same range resolved", {
					markerId: sameRangeMarker.id,
					markerText: sameRangeMarker.exact_text,
					popupOffsets: {
						start: popup.startOffset,
						end: popup.endOffset,
						mjx: popup.mathJaxIndex,
						mjxList: popup.mathJaxIndexes,
					},
					markerNote: parseMarkerNote(sameRangeMarker.note),
				});
				if (sameRangeMarker.color === selectedMarkerColor) {
					console.log(
						"[marker] same range marker found, toggling (delete)",
						sameRangeMarker.id,
					);
					await deleteMarker(sameRangeMarker.id);
				} else {
					console.log(
						"[marker] same range marker found, updating color",
						sameRangeMarker.id,
					);
					await updateMarkerColor(sameRangeMarker.id, selectedMarkerColor);
				}
				setPopup(null);
				window.getSelection()?.removeAllRanges();
				setMarkerSaving(false);
				return;
			}

			// オフセット情報を note に保存しておく（ハイライト時はこれを最優先で使用）
			const notePayload =
				typeof popup.startOffset === "number" &&
				typeof popup.endOffset === "number" &&
				popup.startOffset >= 0 &&
				popup.endOffset >= popup.startOffset
					? JSON.stringify({
							s: popup.startOffset,
							e: popup.endOffset,
							mjx:
								typeof popup.mathJaxIndex === "number"
									? popup.mathJaxIndex
									: undefined,
							mjx_list:
								popup.mathJaxIndexes.length > 0
									? popup.mathJaxIndexes
									: undefined,
					  })
					: typeof popup.mathJaxIndex === "number"
					? JSON.stringify({ mjx: popup.mathJaxIndex })
					: popup.mathJaxIndexes.length > 0
					? JSON.stringify({ mjx_list: popup.mathJaxIndexes })
					: null;

			// 選択内容をコンソールに出力してデバッグしやすくする
			console.log("[marker] createMarker payload", {
				lesson_page_id: currentPage.id,
				exact_text: popup.exactText,
				text_prefix: popup.textPrefix,
				text_suffix: popup.textSuffix,
				note: notePayload,
			});

			const res = await axios.post(
				`/lesson-pages/${currentPage.id}/markers`,
				{
					exact_text: popup.exactText,
					text_prefix: popup.textPrefix,
					text_suffix: popup.textSuffix,
					color: selectedMarkerColor,
					note: notePayload,
				},
			) as { data: TextbookMarkerType };

			console.log("[marker] createMarker response", res.data);
			setMarkers((prev) => {
				if (prev.some((m) => m.id === res.data.id)) return prev;
				return [...prev, res.data];
			});
			setPopup(null);
			window.getSelection()?.removeAllRanges();
		} catch (err) {
			const anyErr = err as any;
			const status = anyErr?.response?.status;
			const detail = anyErr?.response?.data?.detail;
			console.error("[marker] createMarker error", err);
			if (status) {
				setMarkerMessage(
					`マーカーの保存に失敗しました（${status}${
						detail ? `: ${String(detail)}` : ""
					}）。`,
				);
			} else {
				setMarkerMessage("マーカーの保存に失敗しました。");
			}
		} finally {
			setMarkerSaving(false);
		}
	};

	// ----------------------------------------------------------------
	// ハイライト部分を右クリックで削除メニュー表示
	// ----------------------------------------------------------------
	const handleContainerContextMenu = useCallback(
		(e: ReactMouseEvent<HTMLDivElement>) => {
			if (!markerMode) return;
			const target = e.target as HTMLElement | null;
			if (!target) return;
			const span = target.closest(
				"span[data-textbook-marker]",
			) as HTMLSpanElement | null;
			const math = target.closest(
				"[data-textbook-marker-math='true']",
			) as HTMLElement | null;
			const markerEl = span ?? math;
			if (!markerEl) return;

			const idAttr = markerEl.getAttribute("data-marker-id");
			const id = idAttr ? Number(idAttr) : NaN;
			if (!id || Number.isNaN(id)) return;

			e.preventDefault();
			e.stopPropagation();
			const menuWidth = 140;
			const menuHeight = 44;
			const left = Math.min(
				Math.max(8, e.clientX),
				window.innerWidth - menuWidth - 8,
			);
			const top = Math.min(
				Math.max(8, e.clientY),
				window.innerHeight - menuHeight - 8,
			);

			setContextMenu({ markerId: id, left, top });
			setPopup(null);
		},
		[markerMode],
	);

	const totalPages = pages.length;

	const go_previous_page = () => {
		router.push(
			`/lesson/${course_id}/${lesson_item_id}/${Number(page) - 1}`,
		);
	};

	const go_next_page = () => {
		router.push(
			`/lesson/${course_id}/${lesson_item_id}/${Number(page) + 1}`,
		);
	};

	const go_lesson_page = () => {
		router.push(`/course/${course_id}`);
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<p>読み込み中...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center min-h-screen">
				<p className="text-red-600 mb-4">{error}</p>
				<Button onClick={go_lesson_page}>コンテンツ一覧に戻る</Button>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-white">
			<TcAccessTime 
				page="student_lesson_page" 
				details={JSON.stringify({ course_id, lesson_item_id, current_page: page, total_pages: totalPages })}
			/>
			{/* マーカーモードトグル（画面右上に固定）＋簡単なガイド */}
			<div className="fixed right-4 top-20 z-40 flex flex-col items-end gap-2">
				<Button
					size="icon"
					variant={markerMode ? "default" : "outline"}
					className={markerMode ? "bg-yellow-300 text-black hover:bg-yellow-400" : ""}
					onClick={() => setMarkerMode((v) => !v)}
					aria-pressed={markerMode}
					aria-label={markerMode ? "マーカーモードON" : "マーカーモードOFF"}
				>
					<span className="text-xl">🖊</span>
				</Button>
				{markerMode && showMarkerHint && (
					<div className="rounded-md border bg-white/90 px-3 py-2 text-xs text-gray-700 shadow-md max-w-xs">
						<div className="flex items-start gap-2">
							<div>
								<p>テキストを選択するとマーカーを追加できます。</p>
								<p>付いたハイライトを右クリックすると削除できます。</p>
							</div>
							<button
								type="button"
								className="ml-1 text-gray-400 hover:text-gray-600"
								onClick={() => setShowMarkerHint(false)}
								aria-label="ヒントを閉じる"
							>
								✕
							</button>
						</div>
					</div>
				)}
			</div>

			<div className="w-full flex justify-center mb-6 pt-4">
				{totalPages > 0 && (
					<Tabs value={page} className="smart-tabs-bar">
						<TabsList className="flex underline-tabs-bar">
							{pages.map((_, i) => (
								<TabsTrigger
									key={i + 1}
									value={(i + 1).toString()}
									className="smart-tab-btn"
									onClick={() =>
										router.push(
											`/lesson/${course_id}/${lesson_item_id}/${i + 1}`,
										)
									}
								>
									{i + 1}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				)}
			</div>
			<div className="container textbook max-md:px-4">
				<h1>{lessonItem?.title || currentPage?.title || ""}</h1>

				{markerMessage && (
					<p className="mb-3 text-sm text-red-600">{markerMessage}</p>
				)}

				{/* 選択時だけ表示するポップアップ */}
				{popup && (
					<div
						ref={popupRef}
						className="fixed z-50 rounded-md border bg-white px-2 py-2 shadow-md"
						style={{ top: popup.top, left: popup.left }}
					>
						<div className="mb-2 text-xs text-gray-500">色を選択</div>
						<div className="mb-2 flex items-center gap-1">
							{MARKER_COLOR_OPTIONS.map((opt) => {
								const isActive = selectedMarkerColor === opt.value;
								return (
									<button
										key={opt.value}
										type="button"
										className={`h-6 w-6 rounded-full border transition ${
											isActive
												? "ring-2 ring-offset-1 ring-blue-500 border-gray-700"
												: "border-gray-300 hover:scale-105"
										}`}
										style={{ backgroundColor: opt.hex }}
										onClick={() => setSelectedMarkerColor(opt.value)}
										aria-label={`マーカー色: ${opt.label}`}
										title={`マーカー色: ${opt.label}`}
									/>
								);
							})}
						</div>
						<div className="flex items-center gap-1">
						<Button
							size="sm"
							variant="outline"
							disabled={markerSaving}
							onClick={() => {
								console.log("[marker] marker button clicked");
								void createMarker();
							}}
						>
							{markerSaving ? "保存中..." : "🖊 マーカー"}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								setPopup(null);
								window.getSelection()?.removeAllRanges();
							}}
						>
							✕
						</Button>
						</div>
					</div>
				)}

				{contextMenu && (
					<div
						ref={contextMenuRef}
						className="fixed z-50 rounded-md border bg-white p-1 shadow-md"
						style={{ top: contextMenu.top, left: contextMenu.left }}
					>
						<Button
							size="sm"
							variant="ghost"
							className="h-8 w-full justify-start px-2 text-sm"
							disabled={deletingMarkerIds.includes(contextMenu.markerId)}
							onClick={() => {
								void deleteMarker(contextMenu.markerId);
								setContextMenu(null);
							}}
						>
							{deletingMarkerIds.includes(contextMenu.markerId)
								? "削除中..."
								: "削除"}
						</Button>
					</div>
				)}

				{/* 教科書本文 — suppressHydrationWarning でDOM直接操作を許容 */}
				<div
					ref={containerRef}
					onMouseUp={handleMouseUp}
					onContextMenu={handleContainerContextMenu}
					suppressHydrationWarning
				>
					<TextbookContent text={content} />
				</div>

				{/* マーカーON中だけ表示する保存済みマーカー一覧 */}
				{markerMode && markers.length > 0 && (
					<div className="mt-6 space-y-1 border-t pt-4">
						<p className="mb-2 text-sm font-medium text-muted-foreground">
							マーカー一覧（このページ）
						</p>
						{markers.map((m) => (
							<div key={m.id} className="flex items-center gap-2 text-sm">
								<span
									className="inline-block h-3 w-4 shrink-0 rounded-sm"
									style={{ backgroundColor: resolveMarkerColor(m.color) }}
								/>
								<span className="flex-1 truncate text-muted-foreground">
									{m.exact_text}
								</span>
								<div className="flex items-center gap-1">
									{MARKER_COLOR_OPTIONS.map((opt) => (
										<button
											key={`${m.id}-${opt.value}`}
											type="button"
											disabled={updatingMarkerIds.includes(m.id)}
											className={`h-4 w-4 rounded-full border transition ${
												m.color === opt.value
													? "ring-2 ring-offset-1 ring-blue-500 border-gray-700"
													: "border-gray-300 hover:scale-105"
											} disabled:opacity-60`}
											style={{ backgroundColor: opt.hex }}
											onClick={() => {
												setSelectedMarkerColor(opt.value);
												void updateMarkerColor(m.id, opt.value);
											}}
											aria-label={`「${m.exact_text}」の色を${opt.label}に変更`}
											title={`色を${opt.label}に変更`}
										/>
									))}
								</div>
								<Button
									variant="ghost"
									size="sm"
									className="shrink-0 text-xs"
									disabled={
										deletingMarkerIds.includes(m.id) ||
										updatingMarkerIds.includes(m.id)
									}
									onClick={() => deleteMarker(m.id)}
								>
									{deletingMarkerIds.includes(m.id)
										? "削除中..."
										: updatingMarkerIds.includes(m.id)
										? "更新中..."
										: "削除"}
								</Button>
							</div>
						))}
					</div>
				)}
				<div className="mt-8 flex items-center justify-between gap-3">
					{Number(page) !== 1 ? (
						<Button className="default align-middle" onClick={go_previous_page}>
							前のページ
						</Button>
					) : (
						<div />
					)}

					{Number(page) === totalPages ? (
						<Button className="default align-middle" onClick={go_lesson_page}>
							コンテンツ一覧に戻る
						</Button>
					) : (
						<Button className="default align-middle" onClick={go_next_page}>
							次のページ
						</Button>
					)}
				</div>
			</div>
		</div>
	);
};

export default LessonPage;
