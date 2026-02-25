"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MathJax, MathJaxSetup } from "@/components/shared/MathJax";
import TcAccessTime from "@/components/tc_access_time";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import axios from "@/lib/axios";

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
			<div className="w-full flex justify-center mb-6 pt-4">
				{totalPages > 0 && (
					<Tabs
						value={page}
						className="smart-tabs-bar"
					>
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
				<MathJaxSetup>
					<MathJax text={content} />
				</MathJaxSetup>
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
