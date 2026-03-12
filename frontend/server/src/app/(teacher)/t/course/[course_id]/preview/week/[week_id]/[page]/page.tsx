"use client";

import {
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MathJax, MathJaxSetup } from "@/components/shared/MathJax";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
	const goBackToList = () => {
		router.push(`/t/course/${params.course_id}`);
	};

	return (
		<MathJaxSetup>
			<div className="min-h-screen bg-gray-100">
				<div className="w-full flex justify-center mb-6 pt-4">
					{totalPages > 0 && (
						<Tabs value={String(currentPage)} className="smart-tabs-bar">
							<TabsList className="flex underline-tabs-bar">
								{pages.map((_, i) => (
									<TabsTrigger
										key={i + 1}
										value={(i + 1).toString()}
										className="smart-tab-btn"
										onClick={() => goToPage(i + 1)}
									>
										{i + 1}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>
					)}
				</div>

				<div className="container textbook max-md:px-4">
					<h1>{lessonItem?.title || `第${currentPage}ページ`}</h1>

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
						<>
							<div>
								{processedContent ? (
									<MathJax text={processedContent} />
								) : (
									<div className="text-gray-500 italic">コンテンツがありません</div>
								)}
							</div>

							<div className="mt-8 flex items-center justify-between gap-3">
								{currentPage !== 1 ? (
									<Button
										variant="outline"
										className="flex items-center gap-2"
										onClick={() => goToPage(currentPage - 1)}
									>
										<ChevronLeft className="h-4 w-4" />
										前のページ
									</Button>
								) : (
									<div />
								)}

								{currentPage === totalPages ? (
									<Button variant="outline" onClick={goBackToList}>
										コンテンツ一覧に戻る
									</Button>
								) : (
									<Button
										variant="outline"
										className="flex items-center gap-2"
										onClick={() => goToPage(currentPage + 1)}
									>
										次のページ
										<ChevronRight className="h-4 w-4" />
									</Button>
								)}
							</div>
						</>
					)}
				</div>
			</div>
		</MathJaxSetup>
	);
}

export default WeekPreviewPage;
