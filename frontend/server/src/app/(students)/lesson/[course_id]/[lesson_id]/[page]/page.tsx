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

function removeHighlights(container: HTMLElement) {
	container
		.querySelectorAll("span[data-textbook-marker]")
		.forEach((span) => {
			const parent = span.parentNode;
			if (!parent) return;
			while (span.firstChild) parent.insertBefore(span.firstChild, span);
			parent.removeChild(span);
		});
	container.normalize();
}

// 空白を正規化（比較用）。連続空白・改行を1スペースにし trim
function normalizeSpaces(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

// container.textContent と同じ基準で、任意の DOM 境界点を「文字オフセット」に変換する
function boundaryToTextOffset(
	container: HTMLElement,
	boundaryNode: Node,
	boundaryOffset: number,
): number | null {
	const walker = document.createTreeWalker(
		container,
		NodeFilter.SHOW_TEXT,
		null,
	);

	let acc = 0;
	let node = walker.nextNode() as Text | null;

	// 境界が Text ノード内なら直接
	if (boundaryNode.nodeType === Node.TEXT_NODE) {
		while (node) {
			const len = node.nodeValue?.length ?? 0;
			if (node === boundaryNode) {
				return acc + Math.min(Math.max(boundaryOffset, 0), len);
			}
			acc += len;
			node = walker.nextNode() as Text | null;
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

	while (node) {
		const len = node.nodeValue?.length ?? 0;
		const cmp = br.comparePoint(node, 0);
		if (cmp >= 0) {
			// このテキストノード先頭が境界以上 → 現在の acc が境界位置
			return acc;
		}
		acc += len;
		node = walker.nextNode() as Text | null;
	}

	// 境界が全テキストノードより後ろなら、全文末尾
	return acc;
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
	const walker = document.createTreeWalker(
		container,
		NodeFilter.SHOW_TEXT,
		null,
	);

	let node = walker.nextNode() as Text | null;
	let acc = 0;
	const range = document.createRange();
	let startSet = false;
	let endSet = false;

	while (node) {
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
		node = walker.nextNode() as Text | null;
	}

	// start/end のどちらかでも決まらなければ不正なオフセットとして扱う
	if (startSet && endSet && !range.collapsed) {
		return range;
	}
	return null;
}

// note フィールドからオフセット情報をパース（新規マーカー用）
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

	const fullText = container.textContent ?? "";
	if (!fullText) return;

	// 長いものから先に処理（短いマーカーが長いものの内側にあるのを防ぐ）
	const sorted = [...markers].sort(
		(a, b) => b.exact_text.length - a.exact_text.length,
	);

	for (const marker of sorted) {
		const target = marker.exact_text.trim();
		if (!target) continue;

		const normTarget = normalizeSpaces(target);
		const offsets = parseOffsetsFromNote(marker.note);
		let range: Range | null = null;

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
			const match = findMarkerPositionInFullText(fullText, marker);
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
			span.style.backgroundColor = marker.color || "yellow";
			span.style.padding = "0 0.1em";
			span.style.borderRadius = "0.15em";
			span.style.cursor = "pointer";
			span.title = "クリックでマーカーを削除";
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
	const endNode = range.endContainer;
	const endOffset = range.endOffset;
	const segments: { node: Text; start: number; end: number }[] = [];

	let node: Node | null = range.startContainer;
	let offset = range.startOffset;

	while (node) {
		if (node.nodeType === Node.TEXT_NODE) {
			const textNode = node as Text;
			const len = textNode.length;
			const segStart =
				node === range.startContainer ? offset : 0;
			const segEnd = node === endNode ? endOffset : len;
			if (segStart < segEnd)
				segments.push({ node: textNode, start: segStart, end: segEnd });
			// endContainer を処理したら必ず終了（ここを抜けると下まで塗ってしまう）
			if (node === endNode) break;
			offset = len;
		}
		node = nextNodeInDocumentOrder(node, offset);
		offset = 0;
	}

	for (const { node: textNode, start, end } of segments) {
		// 改行や段落間の空白だけのセグメントはレイアウト崩れの原因になるのでスキップ
		const slice = textNode.data.slice(start, end);
		if (!slice.trim()) continue;
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

/** document order で次のノードへ（子→兄弟→親の兄弟） */
function nextNodeInDocumentOrder(node: Node, offset: number): Node | null {
	if (node.nodeType === Node.TEXT_NODE) {
		const parent = node.parentNode;
		if (!parent) return null;
		const idx = Array.from(parent.childNodes).indexOf(node as ChildNode);
		const next = parent.childNodes[idx + 1];
		if (next) return next;
		return nextNodeInDocumentOrder(parent, idx + 1);
	}
	const el = node as Element;
	const child = el.childNodes[offset];
	if (child) return child;
	const parent = el.parentNode;
	if (!parent) return null;
	const idx = Array.from(parent.childNodes).indexOf(el as ChildNode);
	return nextNodeInDocumentOrder(parent, idx + 1);
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
};

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
	const [markerSaving, setMarkerSaving] = useState(false);
	const [markerMessage, setMarkerMessage] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const popupRef = useRef<HTMLDivElement | null>(null);
	// markersの最新値をeffect内から参照するためのref
	const markersRef = useRef<TextbookMarkerType[]>([]);
	markersRef.current = markers;
	// MathJax描画後のハイライト適用タイマー
	const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") return;
		window.sessionStorage.setItem("currentCourseId", course_id);
		window.sessionStorage.setItem("currentLessonId", lesson_item_id);
	}, [course_id, lesson_item_id]);

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

	useEffect(() => {
		if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
		// MathJaxが非同期でタイプセットを完了するまで待つ
		applyTimerRef.current = setTimeout(applyHighlights, 800);
		return () => {
			if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
		};
	}, [content, applyHighlights]);

	useEffect(() => {
		// markersが変わった時はDOMを再描画しないので即時適用
		applyHighlights();
	}, [markers, applyHighlights]);

	// ----------------------------------------------------------------
	// テキスト選択でポップアップ表示（マウスカーソル付近に出す）
	// ----------------------------------------------------------------
	const handleMouseUp = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
		if (!markerMode) {
			// モードオフ時は何もしない
			return;
		}
		console.log("[marker] handleMouseUp fired");
		const container = containerRef.current;
		if (!container) {
			console.log("[marker] no containerRef");
			return;
		}
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) {
			console.log("[marker] no selection or rangeCount=0");
			return;
		}

		const range = sel.getRangeAt(0);
		const inContainer = container.contains(range.commonAncestorContainer);
		console.log("[marker] range commonAncestor in container?", inContainer);
		if (!inContainer) return;

		const exactText = sel.toString().trim();
		console.log("[marker] selected text:", exactText);
		if (!exactText) {
			setPopup(null);
			return;
		}

		const fullText = container.textContent || "";
		const startOffset = boundaryToTextOffset(
			container,
			range.startContainer,
			range.startOffset,
		);
		const endOffset = boundaryToTextOffset(
			container,
			range.endContainer,
			range.endOffset,
		);
		if (
			typeof startOffset !== "number" ||
			typeof endOffset !== "number" ||
			endOffset <= startOffset
		) {
			setPopup(null);
			return;
		}
		const textPrefix = fullText.slice(
			Math.max(0, startOffset - 20),
			startOffset,
		);
		const textSuffix = fullText.slice(endOffset, endOffset + 20);

		// マウスカーソル位置を基準にポップアップ表示位置を決定
		// ポップアップは position: fixed なので、スクロール量は足さない（client 座標をそのまま使う）
		const cursorX = e.clientX;
		const cursorY = e.clientY;
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
		});
		console.log("[marker] popup set", {
			exactText,
			textPrefix,
			textSuffix,
			startOffset,
			endOffset,
		});
	}, [markerMode]);

	useEffect(() => {
		const onDown = (e: globalThis.MouseEvent) => {
			const targetNode = e.target as Node;
			const inContainer = !!containerRef.current?.contains(targetNode);
			const inPopup = !!popupRef.current?.contains(targetNode);
			// 教科書本文 or ポップアップ内のクリックでは閉じない
			if (!inContainer && !inPopup) {
				setPopup(null);
			}
		};
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, []);

	// ----------------------------------------------------------------
	// マーカー作成 / 削除
	// ----------------------------------------------------------------
	const createMarker = async () => {
		if (!currentPage?.id || !popup) return;
		setMarkerSaving(true);
		setMarkerMessage(null);
		try {
			// 同一テキスト＋前後文脈に既存マーカーがあれば「トグル」として削除扱いにする
			const sameRangeMarker = markersRef.current.find(
				(m) =>
					m.exact_text === popup.exactText &&
					m.text_prefix === popup.textPrefix &&
					m.text_suffix === popup.textSuffix,
			);

			if (sameRangeMarker) {
				console.log(
					"[marker] same range marker found, toggling (delete)",
					sameRangeMarker.id,
				);
				await deleteMarker(sameRangeMarker.id);
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
					  })
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
					color: "yellow",
					note: notePayload,
				},
			) as { data: TextbookMarkerType };

			console.log("[marker] createMarker response", res.data);
			setMarkers((prev) => [...prev, res.data]);
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

	const deleteMarker = async (id: number) => {
		try {
			await axios.delete(`/textbook-markers/${id}`);
			setMarkers((prev) => prev.filter((m) => m.id !== id));
		} catch {
			setMarkerMessage("マーカーの削除に失敗しました。");
		}
	};

	// ----------------------------------------------------------------
	// ハイライト部分をクリックして削除（トグル）
	// ----------------------------------------------------------------
	const handleContainerClick = useCallback(
			(e: ReactMouseEvent<HTMLDivElement>) => {
			if (!markerMode) return;
			const target = e.target as HTMLElement | null;
			if (!target) return;
			const span = target.closest(
				"span[data-textbook-marker]",
			) as HTMLSpanElement | null;
			if (!span) return;

			const idAttr = span.getAttribute("data-marker-id");
			const id = idAttr ? Number(idAttr) : NaN;
			if (!id || Number.isNaN(id)) return;

			e.preventDefault();
			e.stopPropagation();
			void deleteMarker(id);
		},
		[deleteMarker, markerMode],
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
								<p>付いたハイライトをクリックすると削除できます。</p>
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
						className="fixed z-50 flex items-center gap-1 rounded-md border bg-white px-2 py-1 shadow-md"
						style={{ top: popup.top, left: popup.left }}
					>
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
				)}

				{/* 教科書本文 — suppressHydrationWarning でDOM直接操作を許容 */}
				<div
					ref={containerRef}
					onMouseUp={handleMouseUp}
					onClick={handleContainerClick}
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
									style={{ backgroundColor: m.color || "yellow" }}
								/>
								<span className="flex-1 truncate text-muted-foreground">
									{m.exact_text}
								</span>
								<Button
									variant="ghost"
									size="sm"
									className="shrink-0 text-xs"
									onClick={() => deleteMarker(m.id)}
								>
									削除
								</Button>
							</div>
						))}
					</div>
				)}
				<div className="flex mt-4 justify-between items-center">
					{Number(page) !== 1 ? (
						<Button className="default align-middle" onClick={go_previous_page}>
							前のページ
						</Button>
					) : (
						<span />
					)}
					{Number(page) === totalPages ? (
						<Button className="default align-middle" onClick={go_lesson_page}>
							コンテンツ一覧に戻る
						</Button>
					) : (
						<span />
					)}
				</div>
				{Number(page) < totalPages && (
					<Button className="ml-auto mt-8 block" onClick={go_next_page}>
						次のページ
					</Button>
				)}
			</div>
		</div>
	);
};

export default LessonPage;
