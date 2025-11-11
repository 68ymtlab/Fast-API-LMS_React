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
				axios.get(`/get_course_info/${params.course_id}`),
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

			<Card>
				<CardHeader>
					<CardTitle className="text-2xl flex items-center gap-2">
						<Eye className="h-6 w-6" />
						コースプレビュー
					</CardTitle>
					<CardDescription>
						学生から見たコースの表示を確認できます
					</CardDescription>
				</CardHeader>
				<CardContent>
					{errorMessage && (
						<Alert variant="destructive" className="mb-6">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{errorMessage}</AlertDescription>
						</Alert>
					)}

					{courseInfo && (
						<div className="space-y-8">
							{/* コース基本情報 */}
							<Card>
								<CardHeader>
									<CardTitle className="text-lg flex items-center gap-2">
										<BookOpen className="h-5 w-5" />
										{courseInfo.course_name}
									</CardTitle>
									<div className="flex flex-wrap gap-2">
										<Badge variant="outline">{courseInfo.subject_class}</Badge>
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
											<h4 className="font-semibold mb-2">科目名</h4>
											<p className="text-gray-700">{courseInfo.subject_name}</p>
										</div>
										<div>
											<h4 className="font-semibold mb-2">コースの詳細</h4>
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
							<Card>
								<CardHeader>
									<CardTitle className="text-lg">週次コンテンツ一覧</CardTitle>
									<CardDescription>
										全{weeks.length}週のコンテンツが登録されています
									</CardDescription>
								</CardHeader>
								<CardContent>
									{weeks.length === 0 ? (
										<div className="text-center py-8">
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
													className="border-l-4 border-l-blue-500"
												>
													<CardContent className="p-4">
														<div className="flex items-start justify-between">
															<div className="flex-1">
																<div className="flex items-center gap-3 mb-2">
																	<Badge variant="outline">
																		第{week.week_num}週
																	</Badge>
																	<h4 className="font-semibold text-lg">
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
															<div className="flex flex-col gap-2 ml-4">
																<Link
																	href={`/t/course/${params.course_id}/preview/week/${week.week_id}/1`}
																>
																	<Button
																		size="sm"
																		variant="outline"
																		className="flex items-center gap-2"
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
																		className="flex items-center gap-2"
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
							<div className="flex justify-center gap-4">
								<Link href={`/t/course/${params.course_id}/create-week`}>
									<Button className="flex items-center gap-2">
										<Play className="h-4 w-4" />
										新しい週を追加
									</Button>
								</Link>
								<Link href={`/course/${params.course_id}`}>
									<Button variant="outline" className="flex items-center gap-2">
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
	);
}

export default CoursePreviewPage;
