"use client";

import {
	AlertCircle,
	ArrowLeft,
	CheckCircle,
	Eye,
	GraduationCap,
	RotateCcw,
	Trophy,
} from "lucide-react";
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
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";

interface CompletionData {
	content?: string;
	accuracy_rate?: number;
	total_questions?: number;
	correct_answers?: number;
	session_number?: number;
}

function TeacherFlowCompletionPreviewPage() {
	const { loginUser, isLoadingUser } = useLoginUser();
	const router = useRouter();
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [completionData, setCompletionData] = useState<CompletionData | null>(
		null,
	);

	useEffect(() => {
		if (!isLoadingUser && !loginUser) {
			router.push("/login");
		}
	}, [loginUser, isLoadingUser, router]);

	useEffect(() => {
		if (params.flow_id && params.session_id) {
			fetchCompletionData();
		}
	}, [params.flow_id, params.session_id]);

	const fetchCompletionData = async () => {
		try {
			setLoading(true);
			setErrorMessage("");

			// Fetch completion page content (same API as student view)
			const response = await axios.get(
				`/get_flow_completion_page/${params.flow_id}`,
			);
			setCompletionData(response.data);
		} catch (error) {
			console.error("Error fetching completion data:", error);
			setErrorMessage("完了情報の取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const returnToTeacherFlow = () => {
		router.push(
			`/t/course/${params.course_id}/preview/week/${params.week_id}/flow/${params.flow_id}`,
		);
	};

	const returnToCourseManagement = () => {
		router.push(`/t/course/${params.course_id}`);
	};

	const previewNewSession = () => {
		router.push(
			`/t/course/${params.course_id}/preview/week/${params.week_id}/flow/${params.flow_id}`,
		);
	};

	const getAccuracyBadgeVariant = (accuracy: number) => {
		if (accuracy >= 90) return "default";
		if (accuracy >= 70) return "secondary";
		return "destructive";
	};

	const getPerformanceMessage = (accuracy?: number) => {
		if (!accuracy) return "";

		if (accuracy >= 90) return "素晴らしい結果です！";
		if (accuracy >= 70) return "良い結果です！";
		if (accuracy >= 50) return "もう少し頑張りましょう";
		return "復習して再挑戦してみましょう";
	};

	if (isLoadingUser) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
			</div>
		);
	}

	return (
		<div className="container mx-auto py-8 px-4 max-w-4xl">
			{/* プレビューモード通知 */}
			<Alert className="mb-6 border-blue-200 bg-blue-50">
				<Eye className="h-4 w-4 text-blue-600" />
				<AlertDescription className="text-blue-800">
					<div className="flex items-center gap-2">
						<GraduationCap className="h-4 w-4" />
						<span className="font-medium">教師プレビューモード:</span>
						学生が演習完了時に表示される画面をプレビューしています
					</div>
				</AlertDescription>
			</Alert>

			{errorMessage && (
				<Alert variant="destructive" className="mb-6">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{errorMessage}</AlertDescription>
				</Alert>
			)}

			{loading ? (
				<div className="flex items-center justify-center py-16">
					<div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
				</div>
			) : (
				<div className="space-y-6">
					{/* 完了メッセージ */}
					<Card className="text-center">
						<CardHeader className="pb-6">
							<div className="flex justify-center mb-4">
								<div className="rounded-full bg-green-100 p-4">
									<CheckCircle className="h-16 w-16 text-green-600" />
								</div>
							</div>
							<CardTitle className="text-2xl text-green-700">
								演習完了！
							</CardTitle>
							<CardDescription className="text-lg">
								お疲れ様でした。演習セッションが完了しました。
							</CardDescription>
						</CardHeader>
					</Card>

					{/* 成績表示（プレビューデータ） */}
					<Card>
						<CardHeader>
							<CardTitle className="text-xl flex items-center gap-2">
								<Trophy className="h-6 w-6" />
								成績結果 (プレビューデータ)
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid md:grid-cols-2 gap-6">
								<div className="space-y-4">
									<div className="text-center">
										<div className="text-4xl font-bold text-primary mb-2">
											{completionData?.accuracy_rate?.toFixed(1) || "85.0"}%
										</div>
										<Badge
											variant={getAccuracyBadgeVariant(
												completionData?.accuracy_rate || 85,
											)}
											className="text-sm"
										>
											正答率
										</Badge>
									</div>

									<div className="text-center text-sm text-gray-600">
										{completionData?.correct_answers || 8} /{" "}
										{completionData?.total_questions || 10} 問正解
									</div>
								</div>

								<div className="space-y-3">
									<div className="bg-gray-50 p-4 rounded-lg">
										<h4 className="font-medium mb-2">評価</h4>
										<p className="text-sm text-gray-700">
											{getPerformanceMessage(
												completionData?.accuracy_rate || 85,
											)}
										</p>
									</div>

									<div className="bg-blue-50 p-4 rounded-lg">
										<h4 className="font-medium mb-2">セッション情報</h4>
										<p className="text-sm text-gray-700">
											セッション #{completionData?.session_number || 1}{" "}
											(プレビュー)
										</p>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* 完了コンテンツ */}
					{completionData?.content && (
						<Card>
							<CardHeader>
								<CardTitle className="text-lg">メッセージ</CardTitle>
							</CardHeader>
							<CardContent>
								<div
									className="prose prose-sm max-w-none"
									dangerouslySetInnerHTML={{ __html: completionData.content }}
								/>
							</CardContent>
						</Card>
					)}

					{/* 学生向けアクションボタン（プレビュー） */}
					<Card>
						<CardHeader>
							<CardTitle className="text-lg text-blue-700">
								学生向けアクション (プレビュー)
							</CardTitle>
							<CardDescription>
								実際の学生画面では以下のボタンが表示されます
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex flex-col sm:flex-row gap-4 justify-center">
								<Button
									disabled
									variant="default"
									size="lg"
									className="flex items-center gap-2 opacity-60"
								>
									<ArrowLeft className="h-5 w-5" />
									演習フローに戻る
								</Button>

								<Button
									disabled
									variant="outline"
									size="lg"
									className="flex items-center gap-2 opacity-60"
								>
									<RotateCcw className="h-5 w-5" />
									再度挑戦する
								</Button>
							</div>
							<p className="text-xs text-gray-500 text-center mt-2">
								※ プレビューモードでは実際の操作はできません
							</p>
						</CardContent>
					</Card>

					{/* 教師向けアクション */}
					<Card className="bg-blue-50 border-blue-200">
						<CardHeader>
							<CardTitle className="text-lg text-blue-700">
								教師向けアクション
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex flex-col sm:flex-row gap-4 justify-center">
								<Button
									onClick={returnToTeacherFlow}
									variant="default"
									size="lg"
									className="flex items-center gap-2"
								>
									<ArrowLeft className="h-5 w-5" />
									演習フロープレビューに戻る
								</Button>

								<Button
									onClick={previewNewSession}
									variant="outline"
									size="lg"
									className="flex items-center gap-2"
								>
									<RotateCcw className="h-5 w-5" />
									演習を最初からプレビュー
								</Button>

								<Button
									onClick={returnToCourseManagement}
									variant="secondary"
									size="lg"
									className="flex items-center gap-2"
								>
									<ArrowLeft className="h-5 w-5" />
									コース管理に戻る
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* プレビュー情報 */}
					<Card className="bg-gray-50 border-gray-200">
						<CardContent className="pt-6">
							<div className="text-center">
								<h3 className="font-medium mb-2 text-gray-700">
									プレビュー情報
								</h3>
								<p className="text-sm text-gray-600 mb-4">
									この画面は学生が演習を完了した際に表示されるものと同じ内容です。
									<br />
									実際の成績データは学生のセッション結果に基づいて表示されます。
								</p>
								<div className="text-xs text-gray-500 bg-white p-3 rounded border">
									<strong>注意:</strong>{" "}
									プレビューモードでは実際のセッションデータではなく、
									<br />
									サンプルデータ（85%正答率、8/10問正解）が表示されています。
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}

export default TeacherFlowCompletionPreviewPage;
