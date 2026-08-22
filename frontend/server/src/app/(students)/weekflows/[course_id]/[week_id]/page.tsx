"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TcAccessTime from "@/components/tc_access_time";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import axios from "@/lib/axios";

// markdown.js の関数は別途用意されていると仮定
// import { markdownToHtml, reloadMathJax } from '@/components/methods/markdown';

interface Week {
	id: number;
	title: string;
	lesson_number: number;
}

interface ExerciseSet {
	id: number;
	title: string;
	description?: string | null;
	question_ids: number[];
	due_date?: string | null;
}

const WeekFlowsPage = () => {
	const params = useParams();
	const router = useRouter();
	const course_id = params.course_id as string;
	const week_id = params.week_id as string;

	const [week, setWeek] = useState<Week | null>(null);
	const [exerciseSets, setExerciseSets] = useState<ExerciseSet[]>([]);
	const [sessionError, setSessionError] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		// course_id と week_id が取得できてからAPIコールを実行
		if (!course_id || !week_id) {
			setLoading(false);
			return;
		}

		const getWeek = () => {
			axios
				.get(`/courses/${course_id}/lessons`)
				.then((response) => {
					const lessons = response.data as Week[];
					const current = lessons.find(
						(lesson) => lesson.id === Number(week_id),
					);
					if (current) setWeek(current);
				})
				.catch((error) => {
					if (error.response?.status === 401) {
						setSessionError(true);
					} else {
						console.error("週情報の取得に失敗しました:", error);
					}
				});
		};

		const getExerciseSets = () => {
			axios
				.get(`/courses/${course_id}/exercise-sets`)
				.then((response) => {
					setExerciseSets(response.data);
				})
				.catch((error) => {
					console.error("演習セットの取得に失敗しました:", error);
				})
				.finally(() => {
					setLoading(false);
				});
		};

		getWeek();
		getExerciseSets();
	}, [course_id, week_id]);

	const handleStartSet = (setId: number) => {
		router.push(`/weekflows/${course_id}/${week_id}/set/${setId}`);
	};

	if (sessionError) {
		return (
			<>
				<main>
					<div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
						<div className="container mx-auto px-4 py-8">
							<h2 className="text-2xl font-bold text-red-600 mb-4">
								セッションエラー
							</h2>
							<p>ログインが必要です。</p>
						</div>
					</div>
				</main>
			</>
		);
	}

	if (loading) {
		return (
			<>
				<main>
					<div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
						<div className="container mx-auto px-4 py-8">
							<p>読み込み中...</p>
						</div>
					</div>
				</main>
			</>
		);
	}

	return (
		<>
			<TcAccessTime 
				page="student_weekflows" 
				details={JSON.stringify({ course_id, week_id })}
			/>
			<main>
				<div className="min-h-screen bg-gray-100">
					<div className="container mx-auto px-4 py-8">
						{/* 週情報のヘッダー */}
						<div className="mb-8">
							<h1 className="text-2xl sm:text-3xl font-bold mb-2">
								{week
									? `第${week.lesson_number}回　${week.title}の演習問題一覧`
									: "演習問題一覧"}
							</h1>
						</div>

						{/* 演習問題一覧 */}
						<div className="space-y-6">
							{exerciseSets.length > 0 ? (
								exerciseSets.map((set, index) => (
									<Card key={set.id} className="w-full">
										<CardHeader>
											<CardTitle>演習セット{index + 1}</CardTitle>
											<CardDescription>
												{set.description || "演習セットの説明がありません"}
											</CardDescription>
										</CardHeader>
										<CardContent>
											<div className="flex flex-col gap-2 mb-4">
												<p className="text-sm text-gray-500">
													問題数: {set.question_ids?.length ?? 0}
												</p>
												{set.due_date && (
													<p className="text-sm font-medium text-red-500">
														回答期限: {new Date(set.due_date).toLocaleString("ja-JP")}
														{new Date(set.due_date) < new Date() && " (期限切れ)"}
													</p>
												)}
											</div>
											<Button
												onClick={() => handleStartSet(set.id)}
												disabled={!!set.due_date && new Date(set.due_date) < new Date()}
												className="w-auto"
											>
												{!!set.due_date && new Date(set.due_date) < new Date() ? "解答期限切れ" : "このセットを解く"}
											</Button>
										</CardContent>
									</Card>
								))
							) : (
								<Card className="w-full">
									<CardContent className="pt-6">
										<p className="text-center text-gray-500">
											この週には演習問題がありません。
										</p>
									</CardContent>
								</Card>
							)}
						</div>
					</div>
				</div>
			</main>
		</>
	);
};

export default WeekFlowsPage;
