"use client";

import {
	ArrowLeft,
	BookOpen,
	ChevronLeft,
	ChevronRight,
	Eye,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MathJax, MathJaxSetup } from "@/components/shared/MathJax";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import axios from "@/lib/axios";

// --- 型定義 -----------------------------------------

interface LessonItemInfo {
	id: number;
	lesson_id: number;
	title: string;
	item_content_type: string;
	display_order: number;
}

interface LessonPageType {
	id: number;
	lesson_id: number;
	page_number: number;
	title: string | null;
	raw_content_id: number | null;
	rendered_content_id: number | null;
	is_active: boolean;
	raw_content_body: string | null;
	rendered_content_body: string | null;
}

// ----------------------------------------------------------

function WeekPreviewPage() {
	const router = useRouter();
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [lessonItem, setLessonItem] = useState<LessonItemInfo | null>(null);
	const [pages, setPages] = useState<LessonPageType[]>([]);
	const [processedContent, setProcessedContent] = useState("");

	const currentPage = Number.parseInt(params.page as string) || 1;
	const lessonItemId = params.week_id as string; // URL上は week_id だが実際は lesson_item_id

	// --- データ取得 ---
	useEffect(() => {
		if (params.course_id && params.week_id && params.page) {
			fetchLessonData();
		}
	}, [params.course_id, params.week_id, params.page]);

	const fetchLessonData = async () => {
		try {
			setLoading(true);
			setErrorMessage("");
			setProcessedContent("");

			// レッスン項目情報を取得
			const itemRes = await axios.get(`/lesson-item/${lessonItemId}`);
			setLessonItem(itemRes.data);

			// ページ一覧を取得
			const pagesRes = await axios.get(
				`/lesson-items/${lessonItemId}/lesson-pages`,
			);
			const sortedPages = (pagesRes.data as LessonPageType[]).sort(
				(a, b) => a.page_number - b.page_number,
			);
			setPages(sortedPages);

			// 現在のページのコンテンツを設定
			const pageIndex = currentPage - 1;
			if (pageIndex >= 0 && pageIndex < sortedPages.length) {
				const selectedPage = sortedPages[pageIndex];
				setProcessedContent(
					selectedPage.rendered_content_body ||
						selectedPage.raw_content_body ||
						"",
				);
			}
		} catch (error) {
			console.error("Error fetching lesson data:", error);
			setErrorMessage("コンテンツの取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const goToPage = (page: number) => {
		router.push(
			`/t/course/${params.course_id}/preview/week/${params.week_id}/${page}`,
		);
	};

	const totalPages = pages.length;

	return (
		<MathJaxSetup>
			<div className="container mx-auto py-8 px-4 max-w-6xl">
				<div className="mb-6">
					<Link
						href={`/t/course/${params.course_id}`}
						className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
					>
						<ArrowLeft className="h-4 w-4" />
						コースに戻る
					</Link>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-2xl flex items-center gap-2">
							<Eye className="h-6 w-6" />
							コンテンツプレビュー
						</CardTitle>
						<CardDescription>
							学生から見たコンテンツの表示を確認できます
						</CardDescription>
					</CardHeader>
					<CardContent>
						{errorMessage && (
							<Alert variant="destructive" className="mb-6">
								<AlertDescription>{errorMessage}</AlertDescription>
							</Alert>
						)}

						{loading ? (
							<div className="text-center py-8">
								<p className="text-gray-500">読み込み中...</p>
							</div>
						) : (
							totalPages > 0 && (
								<div className="space-y-8">
									<Card>
										<CardHeader>
											<div className="flex items-center justify-between">
												<div>
													<CardTitle className="text-lg flex items-center gap-2">
														<BookOpen className="h-5 w-5" />
														{lessonItem?.title || `第${currentPage}ページ`}
													</CardTitle>
													<div className="flex items-center gap-2 mt-2">
														<Badge variant="secondary">
															{currentPage} / {totalPages} ページ
														</Badge>
													</div>
												</div>
											</div>
										</CardHeader>
										<CardContent>
											<div className="space-y-4">
												<h4 className="font-semibold mb-2">学習内容</h4>
												<div className="border border-gray-200 rounded-lg bg-white overflow-auto min-h-[600px]">
													<div className="p-4">
														{processedContent ? (
															<MathJax text={processedContent} />
														) : (
															<div className="text-gray-500 italic">
																コンテンツがありません
															</div>
														)}
													</div>
												</div>
											</div>
										</CardContent>
										{totalPages > 1 && (
											<CardFooter className="flex justify-between items-center border-t pt-4">
												<Button
													onClick={() => goToPage(currentPage - 1)}
													disabled={currentPage <= 1}
													variant="outline"
													className="w-40"
												>
													<ChevronLeft className="h-4 w-4 mr-2" />
													前のページ
												</Button>
												<div className="text-sm font-medium">
													{currentPage} / {totalPages}
												</div>
												<Button
													onClick={() => goToPage(currentPage + 1)}
													disabled={currentPage >= totalPages}
													variant="outline"
													className="w-40"
												>
													次のページ
													<ChevronRight className="h-4 w-4 ml-2" />
												</Button>
											</CardFooter>
										)}
									</Card>
								</div>
							)
						)}
					</CardContent>
				</Card>
			</div>
		</MathJaxSetup>
	);
}

export default WeekPreviewPage;
