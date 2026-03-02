"use client";

import {
	AlertCircle,
	ArrowLeft,
	BookOpen,
	Calendar,
	Clock,
	Eye,
	Play,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import axios from "@/lib/axios";

interface CourseInfo {
	course_id: number;
	course_name: string;
	course_detail: string;
	subject_name: string;
	subject_class: string;
	subject_credit: number;
	subject_period: string;
}

interface WeekInfo {
	week_id: number;
	week_name: string;
	week_detail: string;
	week_num: number;
	flow_count: number;
}

function CoursePreviewPage() {
	const router = useRouter();
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
	const [weeks, setWeeks] = useState<WeekInfo[]>([]);

	useEffect(() => {
		if (params.course_id) {
			fetchCourseData();
		}
	}, [params.course_id]);

	const fetchCourseData = async () => {
		try {
			setLoading(true);
			setErrorMessage("");

			console.log("Fetching course data for course_id:", params.course_id);

			// コース情報と週情報を並行取得
			const [courseResponse, weeksResponse] = await Promise.all([
				axios.get(`/courses/${params.course_id}`),
				axios.get(`/get_week_list/${params.course_id}`),
			]);

			console.log("Course info response:", courseResponse.data);
			console.log("Weeks response:", weeksResponse.data);

			setCourseInfo(courseResponse.data);
			setWeeks(weeksResponse.data);
		} catch (error) {
			console.error("Error fetching course data:", error);
			setErrorMessage("コース情報の取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	return (
		<main>
			<div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
				<div className="container mx-auto py-8 px-4 max-w-6xl">
					{/* ナビゲーション */}
					<div className="mb-6">
						<Link
							href={`/t/course/${params.course_id}`}
							className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
						>
							<ArrowLeft className="h-4 w-4" />
							コース管理に戻る
						</Link>
					</div>

					<Card className="bg-white/80 backdrop-blur border border-slate-200 shadow-lg rounded-2xl">
						<CardHeader className="border-b border-slate-100 pb-4">
							<CardTitle className="text-2xl flex items-center gap-2">
								<Eye className="h-6 w-6 text-blue-600" />
								<span>コースプレビュー</span>
							</CardTitle>
							<CardDescription className="text-slate-600">
								学生から見たコースの表示を、一覧で確認できます
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-6">
							{errorMessage && (
								<Alert variant="destructive" className="mb-6">
									<AlertCircle className="h-4 w-4" />
									<AlertDescription>{errorMessage}</AlertDescription>
								</Alert>
							)}

							{courseInfo && (
								<div className="space-y-8">
									{/* コース基本情報 */}
									<Card className="bg-white/90 shadow-sm border border-slate-200">
										<CardHeader>
											<CardTitle className="text-xl flex items-center gap-2">
												<BookOpen className="h-5 w-5 text-blue-600" />
												<span>{courseInfo.course_name}</span>
											</CardTitle>
											<div className="flex flex-wrap gap-2 mt-2">
												<Badge variant="outline">
													{courseInfo.subject_class}
												</Badge>
												<Badge>{courseInfo.subject_credit}単位</Badge>
												<Badge
													variant="secondary"
													className="flex items-center gap-1"
												>
													<Calendar className="h-3 w-3" />
													{courseInfo.subject_period}
												</Badge>
											</div>
										</CardHeader>
										<CardContent>
											<div className="space-y-4">
												<div>
													<h4 className="font-semibold mb-1 text-slate-800">
														科目名
													</h4>
													<p className="text-gray-700">
														{courseInfo.subject_name}
													</p>
												</div>
												<div>
													<h4 className="font-semibold mb-1 text-slate-800">
														コースの詳細
													</h4>
													<div className="prose prose-sm max-w-none">
														<p className="text-gray-700 whitespace-pre-wrap">
															{courseInfo.course_detail}
														</p>
													</div>
												</div>
											</div>
										</CardContent>
									</Card>

									{/* 週次コンテンツ一覧 */}
									<Card className="bg-white/90 shadow-sm border border-slate-200">
										<CardHeader>
											<CardTitle className="text-lg">
												週次コンテンツ一覧
											</CardTitle>
											<CardDescription>
												全{weeks.length}週のコンテンツ構成を確認できます
											</CardDescription>
										</CardHeader>
										<CardContent>
											{weeks.length === 0 ? (
												<div className="text-center py-10">
													<Clock className="mx-auto h-12 w-12 text-gray-400 mb-4" />
													<p className="text-gray-500">
														まだ週次コンテンツが登録されていません
													</p>
												</div>
											) : (
												<div className="grid gap-4">
													{weeks.map((week) => (
														<Card
															key={week.week_id}
															className="border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50 to-white"
														>
															<CardContent className="p-4">
																<div className="flex items-start justify-between gap-4">
																	<div className="flex-1">
																		<div className="flex items-center gap-3 mb-2">
																			<Badge variant="outline">
																				第{week.week_num}週
																			</Badge>
																			<h4 className="font-semibold text-lg text-slate-900">
																				{week.week_name}
																			</h4>
																		</div>
																		<p className="text-gray-600 mb-3 whitespace-pre-wrap">
																			{week.week_detail}
																		</p>
																		<div className="flex items-center gap-4 text-sm text-gray-500">
																			<div className="flex items-center gap-1">
																				<Play className="h-4 w-4" />
																				{week.flow_count}個の演習問題
																			</div>
																		</div>
																	</div>
																	<div className="flex flex-col gap-2 shrink-0">
																		<Link
																			href={`/t/course/${params.course_id}/preview/week/${week.week_id}/1`}
																		>
																			<Button
																				size="sm"
																				variant="outline"
																				className="flex items-center gap-2 rounded-full"
																			>
																				<Eye className="h-4 w-4" />
																				プレビュー
																			</Button>
																		</Link>
																		<Link
																			href={`/t/course/${params.course_id}/week/${week.week_id}/edit`}
																		>
																			<Button
																				size="sm"
																				variant="secondary"
																				className="flex items-center gap-2 rounded-full"
																			>
																				編集
																			</Button>
																		</Link>
																	</div>
																</div>
															</CardContent>
														</Card>
													))}
												</div>
											)}
										</CardContent>
									</Card>

									{/* アクション */}
									<div className="flex flex-wrap justify-center gap-4 pt-2">
										<Link href={`/t/course/${params.course_id}/create-week`}>
											<Button className="flex items-center gap-2 rounded-full px-6">
												<Play className="h-4 w-4" />
												新しい週を追加
											</Button>
										</Link>
										<Link href={`/course/${params.course_id}`}>
											<Button
												variant="outline"
												className="flex items-center gap-2 rounded-full px-6"
											>
												<Eye className="h-4 w-4" />
												学生画面で表示
											</Button>
										</Link>
									</div>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</main>
	);
}

export default CoursePreviewPage;
