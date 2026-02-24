"use client";

import { AlertCircle, CheckCircle, Edit, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { MathJax, MathJaxSetup } from "@/components/shared/MathJax";
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

function WeekContentEditor({ courseId: _courseId, weekId }: WeekContentEditorProps) {
	const [loading, setLoading] = useState(false);
	const [initialLoading, setInitialLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState("");
	const [showSuccessDialog, setShowSuccessDialog] = useState(false);
	const [pages, setPages] = useState<LessonPage[]>([]);
	const [currentPage, setCurrentPage] = useState(1);
	const [content, setContent] = useState("");
	const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);
	const [blockDraft, setBlockDraft] = useState("");
	const [isFullEditMode, setIsFullEditMode] = useState(false);

	useEffect(() => {
		fetchWeekContent();
	}, [weekId]);

	useEffect(() => {
		const pageContent = pages.find((page) => page.page_number === currentPage);
		if (pageContent) {
			const body =
				pageContent.rendered_content_body || pageContent.raw_content_body || "";
			setContent(body);
			setEditingBlockIndex(null);
			setBlockDraft("");
			setIsFullEditMode(false);
		}
	}, [currentPage, pages]);

	const fetchWeekContent = async () => {
		try {
			setInitialLoading(true);
			const response = await axios.get(`/lesson-items/${weekId}/lesson-pages`);
			const sorted = (response.data as LessonPage[]).sort(
				(a, b) => a.page_number - b.page_number,
			);
			setPages(sorted);

			if (sorted.length > 0) {
				setCurrentPage(sorted[0].page_number);
				const body = sorted[0].rendered_content_body || sorted[0].raw_content_body || "";
				setContent(body);
			}
		} catch (error) {
			console.error("Error fetching week content:", error);
			setErrorMessage("週次コンテンツの取得に失敗しました");
		} finally {
			setInitialLoading(false);
		}
	};

	const handleContentChange = (newContent: string) => {
		setContent(newContent);
	};

	const splitContentBlocks = (rawContent: string): string[] => {
		const normalized = rawContent.replace(/\r\n/g, "\n").trim();
		if (!normalized) return [""];
		return normalized.split(/\n{2,}/);
	};

	const blocks = splitContentBlocks(content);

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

	const handleUpdate = async () => {
		const current = pages.find((page) => page.page_number === currentPage);
		if (!current) return;

		setLoading(true);
		setErrorMessage("");

		try {
			await axios.put(`/lesson-pages/${current.id}/content`, {
				content: content,
			});
			setShowSuccessDialog(true);
			await fetchWeekContent();
			setTimeout(() => {
				setShowSuccessDialog(false);
			}, 2000);
		} catch (error: any) {
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

	if (pages.length === 0) {
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
						value={currentPage.toString()}
						onValueChange={(value: string) => setCurrentPage(parseInt(value))}
						className="w-full"
					>
						<TabsList className="inline-flex h-auto w-auto">
							{pages.map((page) => (
								<TabsTrigger
									key={page.id}
									value={page.page_number.toString()}
									className="px-4 py-2"
								>
									ページ {page.page_number}
								</TabsTrigger>
							))}
						</TabsList>

						{pages.map((page) => (
							<TabsContent
								key={page.id}
								value={page.page_number.toString()}
								className="mt-6"
							>
								<div className="flex justify-center gap-3 mb-4">
									<Button
										variant="outline"
										onClick={() => {
											setIsFullEditMode((prev) => !prev);
											setEditingBlockIndex(null);
											setBlockDraft("");
										}}
									>
										{isFullEditMode ? "レンダリング表示に戻す" : "全文編集モード"}
									</Button>
									<Button
										onClick={handleUpdate}
										disabled={loading}
										className="flex items-center gap-2"
									>
										<Save className="h-4 w-4" />
										{loading ? "更新中..." : "更新"}
									</Button>
								</div>

								{isFullEditMode ? (
									<div className="space-y-2">
										<h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
											<Edit className="h-4 w-4" />
											全文編集
										</h3>
										<Textarea
											value={content}
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
										<MathJaxSetup>
											{blocks.map((block, index) => (
												<div
													key={`${page.id}-${index}`}
													className={
														editingBlockIndex === index
															? "border border-gray-200 rounded-lg bg-white"
															: "rounded-lg bg-white"
													}
												>
													{editingBlockIndex === index ? (
														<div className="p-4 space-y-3">
															<div className="space-y-2">
																<p className="text-xs text-gray-500">
																	プレビュー（リアルタイム）
																</p>
																<div className="min-h-[180px] rounded-md border border-gray-200 bg-gray-50 p-3 overflow-auto">
																	<MathJax text={blockDraft} />
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
																<Button onClick={saveBlockEdit}>この部分を適用</Button>
															</div>
														</div>
													) : (
														<button
															type="button"
															onClick={() => startBlockEdit(index)}
															className="w-full text-left p-4 hover:bg-gray-50 transition-colors rounded-lg"
														>
															<MathJax text={block} />
														</button>
													)}
												</div>
											))}
										</MathJaxSetup>
									</div>
								)}
							</TabsContent>
						))}
					</Tabs>
				</CardContent>
			</Card>

			{/* 成功ダイアログ */}
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
