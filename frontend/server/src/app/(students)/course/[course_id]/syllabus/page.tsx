"use client";

import {
	AlertCircle,
	Award,
	BookOpen,
	Calendar,
	Hash,
	Target,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TcAccessTime from "@/components/tc_access_time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import withAuth from "@/hocs/withAuth";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";

interface SyllabusInfo {
	subject_class: string;
	subject_name: string;
	subject_credit: number;
	subject_code: string;
	subject_period: string;
	subject_keyword: string;
	subject_goals: string;
}

function SyllabusPage() {
	const { loginUser, isLoadingUser } = useLoginUser();
	const router = useRouter();
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [syllabusInfo, setSyllabusInfo] = useState<SyllabusInfo | null>(null);

	useEffect(() => {
		if (!isLoadingUser && !loginUser) {
			router.push("/login");
		}
	}, [loginUser, isLoadingUser, router]);

	useEffect(() => {
		if (params.course_id) {
			fetchSyllabusInfo();
		}
	}, [params.course_id]);

	const fetchSyllabusInfo = async () => {
		try {
			setLoading(true);
			const response = await axios.get(
				`/get_syllabus_info/${params.course_id}`,
			);
			setSyllabusInfo(response.data);
		} catch (error) {
			console.error("Error fetching syllabus info:", error);
			setErrorMessage("シラバス情報の取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	if (isLoadingUser || loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
			</div>
		);
	}

	return (
		<>
			<TcAccessTime page="student_course_syllabus" />
			<div className="container mx-auto py-8 px-4 max-w-6xl">
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl flex items-center gap-2">
							<BookOpen className="h-6 w-6" />
							シラバス情報
						</CardTitle>
						<CardDescription>
							科目の詳細情報と学習目標を確認できます
						</CardDescription>
					</CardHeader>
					<CardContent>
						{errorMessage && (
							<Alert variant="destructive" className="mb-6">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{errorMessage}</AlertDescription>
							</Alert>
						)}

						{!syllabusInfo ? (
							<Card>
								<CardContent className="text-center py-8">
									<BookOpen className="mx-auto h-12 w-12 text-gray-400 mb-4" />
									<p className="text-gray-500">シラバス情報がありません</p>
								</CardContent>
							</Card>
						) : (
							<div className="space-y-8">
								{/* 基本情報 */}
								<Card>
									<CardHeader>
										<CardTitle className="text-lg flex items-center gap-2">
											<Award className="h-5 w-5" />
											授業科目基本情報
										</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="overflow-x-auto">
											<table className="w-full border-collapse border border-gray-300">
												<thead>
													<tr className="bg-primary text-white">
														<th className="border border-gray-300 px-4 py-3 text-center">
															授業科目区分
														</th>
														<th className="border border-gray-300 px-4 py-3 text-center">
															科目名
														</th>
														<th className="border border-gray-300 px-4 py-3 text-center">
															単位数
														</th>
														<th className="border border-gray-300 px-4 py-3 text-center">
															科目コード
														</th>
														<th className="border border-gray-300 px-4 py-3 text-center">
															開講時期
														</th>
													</tr>
												</thead>
												<tbody>
													<tr className="bg-white">
														<td className="border border-gray-300 px-4 py-3 text-center">
															<Badge variant="outline">
																{syllabusInfo.subject_class}
															</Badge>
														</td>
														<td className="border border-gray-300 px-4 py-3 text-center font-semibold">
															{syllabusInfo.subject_name}
														</td>
														<td className="border border-gray-300 px-4 py-3 text-center">
															<Badge>{syllabusInfo.subject_credit}単位</Badge>
														</td>
														<td className="border border-gray-300 px-4 py-3 text-center font-mono">
															{syllabusInfo.subject_code}
														</td>
														<td className="border border-gray-300 px-4 py-3 text-center">
															<div className="flex items-center justify-center gap-1">
																<Calendar className="h-4 w-4" />
																{syllabusInfo.subject_period}
															</div>
														</td>
													</tr>
												</tbody>
											</table>
										</div>
									</CardContent>
								</Card>

								{/* 学習・教育目標 */}
								<Card>
									<CardHeader>
										<CardTitle className="text-lg flex items-center gap-2">
											<Target className="h-5 w-5" />
											授業科目の学習・教育目標
										</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="overflow-x-auto">
											<table className="w-full border-collapse border border-gray-300">
												<thead>
													<tr className="bg-primary text-white">
														<th
															colSpan={2}
															className="border border-gray-300 px-4 py-3 text-center"
														>
															授業科目の学習・教育目標
														</th>
													</tr>
													<tr className="bg-primary text-white">
														<th className="border border-gray-300 px-4 py-3 text-center w-1/3">
															<div className="flex items-center justify-center gap-2">
																<Hash className="h-4 w-4" />
																キーワード
															</div>
														</th>
														<th className="border border-gray-300 px-4 py-3 text-center">
															<div className="flex items-center justify-center gap-2">
																<Target className="h-4 w-4" />
																学習・教育目標
															</div>
														</th>
													</tr>
												</thead>
												<tbody>
													<tr className="bg-white">
														<td className="border border-gray-300 px-4 py-6 align-top">
															<div className="space-y-2">
																{syllabusInfo.subject_keyword
																	.split(",")
																	.map((keyword, index) => (
																		<div
																			key={index}
																			className="flex items-start gap-2"
																		>
																			<span className="text-sm text-gray-600 min-w-[1.5rem]">
																				{index + 1}.
																			</span>
																			<Badge
																				variant="secondary"
																				className="text-sm"
																			>
																				{keyword.trim()}
																			</Badge>
																		</div>
																	))}
															</div>
														</td>
														<td className="border border-gray-300 px-4 py-6 align-top">
															<div className="text-sm leading-relaxed whitespace-pre-wrap">
																{syllabusInfo.subject_goals}
															</div>
														</td>
													</tr>
												</tbody>
											</table>
										</div>
									</CardContent>
								</Card>

								{/* 追加情報カード */}
								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									<Card className="border-l-4 border-l-blue-500">
										<CardHeader className="pb-2">
											<CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
												<Award className="h-4 w-4" />
												授業形態
											</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="text-lg font-semibold text-blue-600">
												{syllabusInfo.subject_class}
											</div>
										</CardContent>
									</Card>

									<Card className="border-l-4 border-l-green-500">
										<CardHeader className="pb-2">
											<CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
												<Hash className="h-4 w-4" />
												キーワード数
											</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="text-lg font-semibold text-green-600">
												{syllabusInfo.subject_keyword.split(",").length}個
											</div>
										</CardContent>
									</Card>

									<Card className="border-l-4 border-l-purple-500">
										<CardHeader className="pb-2">
											<CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
												<Calendar className="h-4 w-4" />
												開講時期
											</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="text-lg font-semibold text-purple-600">
												{syllabusInfo.subject_period}
											</div>
										</CardContent>
									</Card>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}

export default withAuth(SyllabusPage, ["student"]);
