"use client";

import {
	AlertCircle,
	ArrowLeft,
	ArrowRight,
	CheckCircle,
	Edit,
	Plus,
	Save,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	DebouncedMathJax,
	MathJaxContent,
	MathJaxGroup,
} from "@/components/shared/MathJax";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import axios from "@/lib/axios";

interface LessonPage {
	id: number;
	page_number: number;
	title?: string | null;
	raw_content_body?: string | null;
	rendered_content_body?: string | null;
}

interface WeekContentEditorProps {
	courseId: string;
	weekId: string; // 実体は lesson_item_id
}

const pageBody = (page: LessonPage): string =>
	page.rendered_content_body || page.raw_content_body || "";
const isApiError = (
	error: unknown,
): error is { response?: { status?: number; data?: { detail?: string } } } =>
	typeof error === "object" && error !== null && "response" in error;

function WeekContentEditor({
	courseId: _courseId,
	weekId,
}: WeekContentEditorProps) {
	const [loading, setLoading] = useState(false);
	const [pageActionLoading, setPageActionLoading] = useState(false);
	const [initialLoading, setInitialLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState("");
	const [showSuccessDialog, setShowSuccessDialog] = useState(false);
	const [pages, setPages] = useState<LessonPage[]>([]);
	const [currentPageId, setCurrentPageId] = useState<number | null>(null);
	const [draftsByPageId, setDraftsByPageId] = useState<Record<number, string>>(
		{},
	);
	const [baselineByPageId, setBaselineByPageId] = useState<
		Record<number, string>
	>({});
	const [draggingPageId, setDraggingPageId] = useState<number | null>(null);
	const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(
		null,
	);
	const [blockDraft, setBlockDraft] = useState("");
	const [isFullEditMode, setIsFullEditMode] = useState(false);

	const currentPage = useMemo(
		() => pages.find((page) => page.id === currentPageId) ?? null,
		[pages, currentPageId],
	);
	const currentContent =
		currentPageId == null ? "" : (draftsByPageId[currentPageId] ?? "");

	const hasUnsavedChanges = useMemo(
		() =>
			pages.some(
				(page) =>
					(draftsByPageId[page.id] ?? "") !== (baselineByPageId[page.id] ?? ""),
			),
		[pages, draftsByPageId, baselineByPageId],
	);

	const fetchWeekContent = async (
		preferredPageId?: number,
		options?: { showLoading?: boolean },
	) => {
		const showLoading = options?.showLoading ?? true;
		try {
			if (showLoading) {
				setInitialLoading(true);
			}
			const response = await axios.get(`/lesson-items/${weekId}/lesson-pages`);
			const sorted = (response.data as LessonPage[]).sort(
				(a, b) => a.page_number - b.page_number,
			);
			const nextBaseline = Object.fromEntries(
				sorted.map((page) => [page.id, pageBody(page)]),
			) as Record<number, string>;
			setPages(sorted);
			setBaselineByPageId(nextBaseline);
			setDraftsByPageId((prevDrafts) => {
				const nextDrafts: Record<number, string> = {};
				for (const page of sorted) {
					const serverBody = nextBaseline[page.id];
					const previousDraft = prevDrafts[page.id];
					nextDrafts[page.id] =
						previousDraft !== undefined && previousDraft !== serverBody
							? previousDraft
							: serverBody;
				}
				return nextDrafts;
			});

			if (sorted.length > 0) {
				const desired = preferredPageId ?? currentPageId;
				const nextCurrent = sorted.some((page) => page.id === desired)
					? desired
					: sorted[0].id;
				setCurrentPageId(nextCurrent ?? null);
			} else {
				setCurrentPageId(null);
			}
		} catch (error: unknown) {
			if (isApiError(error) && error.response?.status === 404) {
				setPages([]);
				setCurrentPageId(null);
				setDraftsByPageId({});
				setBaselineByPageId({});
				setErrorMessage("");
			} else {
				console.error("Error fetching week content:", error);
				setErrorMessage("週次コンテンツの取得に失敗しました");
			}
		} finally {
			if (showLoading) {
				setInitialLoading(false);
			}
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: 初回と weekId 変更時のみ再取得する
	useEffect(() => {
		void fetchWeekContent();
	}, [weekId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: ページ切替時に編集状態を初期化する
	useEffect(() => {
		setEditingBlockIndex(null);
		setBlockDraft("");
		setIsFullEditMode(false);
	}, [currentPageId]);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!hasUnsavedChanges) return;
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [hasUnsavedChanges]);

	const handleContentChange = (newContent: string) => {
		if (currentPageId == null) return;
		setDraftsByPageId((prev) => ({ ...prev, [currentPageId]: newContent }));
	};

	// HTML構造を考慮したブロック分割関数
	const splitContentBlocks = (rawContent: string): string[] => {
		const normalized = rawContent.replace(/\r\n/g, "\n").trim();
		if (!normalized) return [""];

		const BLOCK_TAGS = [
			"table",
			"thead",
			"tbody",
			"tfoot",
			"tr",
			"td",
			"th",
			"div",
			"ul",
			"ol",
			"li",
			"figure",
			"blockquote",
			"pre",
			"section",
			"article",
			"details",
		];
		const openTagPattern = new RegExp(
			`<(${BLOCK_TAGS.join("|")})(\\s[^>]*)?>`,
			"gi",
		);
		const closeTagPattern = new RegExp(`</(${BLOCK_TAGS.join("|")})>`, "gi");

		const blocks: string[] = [];
		let current = "";
		let depth = 0;

		for (const line of normalized.split("\n")) {
			const opens = (line.match(openTagPattern) ?? []).length;
			const closes = (line.match(closeTagPattern) ?? []).length;
			depth += opens - closes;
			if (depth < 0) depth = 0;

			if (line.trim() === "" && depth === 0) {
				if (current.trim()) {
					blocks.push(current.trim());
					current = "";
				}
			} else {
				if (current !== "") current += "\n";
				current += line;
			}
		}

		if (current.trim()) {
			blocks.push(current.trim());
		}

		return blocks.length ? blocks : [""];
	};

	const blocks = splitContentBlocks(currentContent);

	const currentPageHasUnsaved = useMemo(() => {
		if (currentPageId == null) return false;
		if (
			(draftsByPageId[currentPageId] ?? "") !==
			(baselineByPageId[currentPageId] ?? "")
		) {
			return true;
		}
		if (editingBlockIndex === null) return false;
		return blockDraft !== (blocks[editingBlockIndex] ?? "");
	}, [
		currentPageId,
		draftsByPageId,
		baselineByPageId,
		editingBlockIndex,
		blockDraft,
		blocks,
	]);

	const requestPageChange = (nextPageId: number) => {
		if (currentPageId == null || nextPageId === currentPageId) return;

		if (editingBlockIndex !== null) {
			const mergedBlocks = [...blocks];
			mergedBlocks[editingBlockIndex] = blockDraft;
			const mergedContent = mergedBlocks.join("\n\n");
			const hasBlockChanges =
				mergedContent !== currentContent ||
				mergedContent !== (baselineByPageId[currentPageId] ?? "");
			if (
				hasBlockChanges &&
				!confirm(
					"このページに未保存の変更があります。別のページへ移動しますか？（編集内容はこの画面内で保持されます）",
				)
			) {
				return;
			}
			setDraftsByPageId((prev) => ({
				...prev,
				[currentPageId]: mergedContent,
			}));
			setEditingBlockIndex(null);
			setBlockDraft("");
		} else if (currentPageHasUnsaved) {
			if (
				!confirm(
					"このページに未保存の変更があります。別のページへ移動しますか？（編集内容はこの画面内で保持されます）",
				)
			) {
				return;
			}
		}

		setCurrentPageId(nextPageId);
	};

	const startBlockEdit = (index: number) => {
		setEditingBlockIndex(index);
		setBlockDraft(blocks[index] ?? "");
	};

	const saveBlockEdit = () => {
		if (editingBlockIndex === null) return;
		const newBlocks = [...blocks];
		newBlocks[editingBlockIndex] = blockDraft;
		handleContentChange(newBlocks.join("\n\n"));
		setEditingBlockIndex(null);
		setBlockDraft("");
	};

	const cancelBlockEdit = () => {
		setEditingBlockIndex(null);
		setBlockDraft("");
	};

	const persistPageOrder = async (
		pageIds: number[],
		preferredPageId: number | null = currentPageId,
	) => {
		setPageActionLoading(true);
		setErrorMessage("");
		try {
			await axios.put(`/lesson-items/${weekId}/lesson-pages/reorder`, {
				page_ids: pageIds,
			});
			await fetchWeekContent(preferredPageId ?? undefined, {
				showLoading: false,
			});
		} catch (error) {
			console.error("Error reordering lesson pages:", error);
			setErrorMessage("ページ順の更新に失敗しました");
		} finally {
			setPageActionLoading(false);
		}
	};

	const goToAdjacentPage = (direction: "prev" | "next") => {
		if (currentPageId == null) return;
		const index = pages.findIndex((page) => page.id === currentPageId);
		if (index < 0) return;
		const targetIndex = direction === "prev" ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= pages.length) return;
		requestPageChange(pages[targetIndex].id);
	};

	const handleAddPageAfterCurrent = async () => {
		setPageActionLoading(true);
		setErrorMessage("");
		try {
			const response = await axios.post(
				`/lesson-items/${weekId}/lesson-pages`,
				{
					insert_after_page_number: currentPage?.page_number,
				},
			);
			const created = response.data as LessonPage;
			await fetchWeekContent(created.id, { showLoading: false });
		} catch (error) {
			console.error("Error creating lesson page:", error);
			setErrorMessage("ページの追加に失敗しました");
		} finally {
			setPageActionLoading(false);
		}
	};

	const handleDeleteCurrentPage = async () => {
		if (!currentPage) return;
		if (pages.length <= 1) {
			setErrorMessage("最後の1ページは削除できません");
			return;
		}
		if (!confirm(`ページ ${currentPage.page_number} を削除しますか？`)) return;

		const currentIndex = pages.findIndex((page) => page.id === currentPage.id);
		const fallbackPageId =
			pages[currentIndex + 1]?.id ?? pages[currentIndex - 1]?.id ?? null;
		setPageActionLoading(true);
		setErrorMessage("");
		try {
			await axios.delete(`/lesson-pages/${currentPage.id}`);
			await fetchWeekContent(fallbackPageId ?? undefined, {
				showLoading: false,
			});
		} catch (error: unknown) {
			console.error("Error deleting lesson page:", error);
			setErrorMessage(
				(isApiError(error) && error.response?.data?.detail) ||
					"ページの削除に失敗しました",
			);
		} finally {
			setPageActionLoading(false);
		}
	};

	const handleUpdate = async () => {
		if (!currentPage || currentPageId == null) return;

		setLoading(true);
		setErrorMessage("");
		try {
			let contentToSave = currentContent;
			if (editingBlockIndex !== null) {
				const mergedBlocks = [...blocks];
				mergedBlocks[editingBlockIndex] = blockDraft;
				contentToSave = mergedBlocks.join("\n\n");
				setDraftsByPageId((prev) => ({
					...prev,
					[currentPageId]: contentToSave,
				}));
				setEditingBlockIndex(null);
				setBlockDraft("");
			}

			const response = await axios.put(
				`/lesson-pages/${currentPage.id}/content`,
				{ content: contentToSave },
			);
			const updated = response.data as LessonPage;
			const savedBody = pageBody(updated);

			setPages((prev) =>
				prev.map((page) =>
					page.id === currentPageId ? { ...page, ...updated } : page,
				),
			);
			setBaselineByPageId((prev) => ({
				...prev,
				[currentPageId]: savedBody,
			}));
			setDraftsByPageId((prev) => ({
				...prev,
				[currentPageId]: savedBody,
			}));
			setShowSuccessDialog(true);
			setTimeout(() => {
				setShowSuccessDialog(false);
			}, 2000);
		} catch (error) {
			console.error("Error updating content:", error);
			setErrorMessage("コンテンツの更新に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	if (initialLoading) {
		return (
			<div className="flex items-center justify-center py-8">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
			</div>
		);
	}

	if (pages.length === 0 || currentPageId == null) {
		return (
			<Card>
				<CardContent className="text-center py-8">
					<p className="text-gray-500">編集可能なコンテンツがありません</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			{errorMessage && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{errorMessage}</AlertDescription>
				</Alert>
			)}

			<Card>
				<CardHeader>
					<CardTitle className="text-xl">教科書コンテンツ編集</CardTitle>
				</CardHeader>
				<CardContent>
					<Tabs
						value={currentPageId.toString()}
						onValueChange={(value: string) =>
							requestPageChange(Number.parseInt(value, 10))
						}
						className="w-full"
					>
						<TabsList className="inline-flex h-auto w-auto">
							{pages.map((page) => (
								<TabsTrigger
									key={page.id}
									value={page.id.toString()}
									className="px-4 py-2"
									draggable
									onDragStart={() => setDraggingPageId(page.id)}
									onDragOver={(event) => event.preventDefault()}
									onDrop={(event) => {
										event.preventDefault();
										if (draggingPageId == null || draggingPageId === page.id)
											return;
										const orderedIds = pages.map((p) => p.id);
										const fromIndex = orderedIds.indexOf(draggingPageId);
										const toIndex = orderedIds.indexOf(page.id);
										if (fromIndex < 0 || toIndex < 0) return;
										const [moved] = orderedIds.splice(fromIndex, 1);
										orderedIds.splice(toIndex, 0, moved);
										void persistPageOrder(orderedIds, currentPageId);
										setDraggingPageId(null);
									}}
									onDragEnd={() => setDraggingPageId(null)}
								>
									ページ {page.page_number}
								</TabsTrigger>
							))}
						</TabsList>
						<p className="mt-2 text-xs text-muted-foreground">
							ページタブをドラッグすると、ページの並び順を入れ替えられます。
						</p>

						{pages.map((page) => (
							<TabsContent
								key={page.id}
								value={page.id.toString()}
								className="mt-6"
							>
								{currentPageId !== page.id ? null : (
								<>
								<div className="mb-4 space-y-3">
									<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
										<Button
											variant="outline"
											size="sm"
											onClick={() => {
												setIsFullEditMode((prev) => !prev);
												setEditingBlockIndex(null);
												setBlockDraft("");
											}}
										>
											{isFullEditMode
												? "レンダリング表示に戻す"
												: "全文編集モード"}
										</Button>
										<div className="flex flex-wrap items-center gap-3">
											<div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1.5">
												<span className="text-xs text-muted-foreground px-1">
													表示
												</span>
												<Button
													variant="outline"
													size="sm"
													onClick={() => goToAdjacentPage("prev")}
													disabled={pages[0]?.id === currentPageId}
												>
													<ArrowLeft className="h-4 w-4 mr-1" />
													前へ
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => goToAdjacentPage("next")}
													disabled={
														pages[pages.length - 1]?.id === currentPageId
													}
												>
													次へ
													<ArrowRight className="h-4 w-4 ml-1" />
												</Button>
											</div>
											<div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1.5">
												<span className="text-xs text-muted-foreground px-1">
													ページ
												</span>
												<Button
													variant="outline"
													size="sm"
													onClick={() => void handleAddPageAfterCurrent()}
													disabled={pageActionLoading}
												>
													<Plus className="h-4 w-4 mr-1" />
													追加
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => void handleDeleteCurrentPage()}
													disabled={pageActionLoading}
												>
													<Trash2 className="h-4 w-4 mr-1" />
													削除
												</Button>
											</div>
										</div>
										<Button
											onClick={handleUpdate}
											disabled={loading}
											size="sm"
											className="w-full sm:w-auto"
										>
											<Save className="h-4 w-4 mr-1" />
											{loading ? "更新中..." : "更新"}
										</Button>
									</div>
								</div>
								{currentPageHasUnsaved && (
									<p className="mb-4 text-xs text-amber-600 text-center">
										このページに未保存の変更があります（更新ボタンで保存してください）
									</p>
								)}
								{hasUnsavedChanges && !currentPageHasUnsaved && (
									<p className="mb-4 text-xs text-amber-600 text-center">
										他のページに未保存の変更があります
									</p>
								)}

								{isFullEditMode ? (
									<div className="space-y-2">
										<h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
											<Edit className="h-4 w-4" />
											全文編集
										</h3>
										<Textarea
											value={currentContent}
											onChange={(e) => handleContentChange(e.target.value)}
											className="min-h-[600px] font-mono text-sm"
											placeholder="コンテンツを入力してください..."
										/>
									</div>
								) : (
									<div className="space-y-4">
										<p className="text-sm text-gray-600">
											レンダリング表示です。編集したい段落を選ぶと、その部分だけ編集できます。
										</p>
										{editingBlockIndex === null ? (
											<MathJaxGroup>
												{blocks.map((block, index) => (
													<button
														key={`${page.id}-${index}`}
														type="button"
														onClick={() => startBlockEdit(index)}
														className="w-full text-left p-4 hover:bg-gray-50 transition-colors rounded-lg border border-transparent hover:border-gray-200"
													>
														<MathJaxContent text={block} />
													</button>
												))}
											</MathJaxGroup>
										) : (
											<div className="border border-gray-200 rounded-lg bg-white p-4 space-y-3">
												<div className="space-y-2">
													<p className="text-xs text-gray-500">プレビュー</p>
													<div className="min-h-[180px] rounded-md border border-gray-200 bg-gray-50 p-3 overflow-auto">
														<DebouncedMathJax text={blockDraft} />
													</div>
												</div>
												<div className="space-y-2">
													<p className="text-xs text-gray-500">編集</p>
													<Textarea
														value={blockDraft}
														onChange={(e) => setBlockDraft(e.target.value)}
														className="min-h-[220px] font-mono text-sm"
													/>
												</div>
												<div className="flex justify-end gap-2">
													<Button variant="outline" onClick={cancelBlockEdit}>
														キャンセル
													</Button>
													<Button onClick={saveBlockEdit}>
														この部分を適用
													</Button>
												</div>
											</div>
										)}
									</div>
								)}
								</>
								)}
							</TabsContent>
						))}
					</Tabs>
				</CardContent>
			</Card>

			<Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader className="text-center">
						<div className="mx-auto mb-4">
							<CheckCircle className="h-16 w-16 text-green-500" />
						</div>
						<DialogTitle className="text-xl">更新完了</DialogTitle>
						<DialogDescription>
							コンテンツが正常に更新されました
						</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default WeekContentEditor;
