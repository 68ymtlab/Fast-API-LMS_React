"use client";

import {
	AlertCircle,
	ArrowLeft,
	BookOpen,
	CheckCircle,
	Clock,
	Eye,
	GraduationCap,
	Play,
	RotateCcw,
	Settings,
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
import { Separator } from "@/components/ui/separator";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";

interface FlowInfo {
	flow_id: number;
	flow_name: string;
	content_name: string;
	week_name: string;
	course_name: string;
	subject_name: string;
}

interface FlowSession {
	flow_session_id: number;
	session_number: number;
	start_time: string;
	end_time: string | null;
	is_completed: boolean;
	accuracy_rate: number | null;
}

interface WelcomePageContent {
	content: string;
}

function TeacherFlowPreviewPage() {
	const { loginUser, isLoadingUser } = useLoginUser();
	const router = useRouter();
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [flowInfo, setFlowInfo] = useState<FlowInfo | null>(null);
	const [welcomeContent, setWelcomeContent] =
		useState<WelcomePageContent | null>(null);

	useEffect(() => {
		if (!isLoadingUser && !loginUser) {
			router.push("/login");
		}
	}, [loginUser, isLoadingUser, router]);

	useEffect(() => {
		if (params.flow_id) {
			fetchFlowData();
		}
	}, [params.flow_id]);

	const fetchFlowData = async () => {
		try {
			setLoading(true);
			setErrorMessage("");

			// Fetch flow basic info (same API as student view)
			const flowResponse = await axios.get(`/get_flow/${params.flow_id}`);
			setFlowInfo(flowResponse.data);

			// Fetch welcome page content (same API as student view)
			const welcomeResponse = await axios.get(
				`/get_flow_welcome_page/${params.flow_id}`,
			);
			setWelcomeContent(welcomeResponse.data);
		} catch (error) {
			console.error("Error fetching flow data:", error);
			setErrorMessage("演習フローの情報取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const startPreviewSession = async () => {
		try {
			setLoading(true);
			setErrorMessage("");

			// Start a preview session (same API as student, but navigate to teacher preview route)
			const response = await axios.post("/start_new_flow_session", {
				flow_id: parseInt(params.flow_id as string),
			});

			const flowSessionId = response.data.flow_session_id;
			router.push(
				`/t/course/${params.course_id}/preview/week/${params.week_id}/flow/${params.flow_id}/session/${flowSessionId}/1`,
			);
		} catch (error) {
			console.error("Error starting preview session:", error);
			setErrorMessage("プレビューセッションの開始に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const returnToCourseManagement = () => {
		router.push(`/t/course/${params.course_id}`);
	};

	const returnToWeekPreview = () => {
		router.push(`/t/course/${params.course_id}/preview/week/${params.week_id}`);
	};

	const goToFlowEdit = () => {
		router.push(
			`/t/course/${params.course_id}/week/${params.week_id}/flow/${params.flow_id}/edit`,
		);
	};

	const previewCompletion = () => {
		// Navigate to completion preview with a mock session ID
		router.push(
			`/t/course/${params.course_id}/preview/week/${params.week_id}/flow/${params.flow_id}/completion/preview`,
		);
	};

	const formatDateTime = (dateString: string) => {
		return new Date(dateString).toLocaleString("ja-JP", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	if (isLoadingUser) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
			</div>
		);
	}

	return (
		<div className="container mx-auto py-8 px-4 max-w-6xl">
			{/* プレビューモード通知 */}
			<Alert className="mb-6 border-blue-200 bg-blue-50">
				<Eye className="h-4 w-4 text-blue-600" />
				<AlertDescription className="text-blue-800">
					<div className="flex items-center gap-2">
						<GraduationCap className="h-4 w-4" />
						<span className="font-medium">教師プレビューモード:</span>
						学生が表示される演習フロー画面をプレビューしています
					</div>
				</AlertDescription>
			</Alert>

			{/* ヘッダー情報 */}
			{flowInfo && (
				<Card className="mb-6">
					<CardHeader>
						<div className="flex items-center justify-between">
							<div>
								<CardTitle className="text-2xl flex items-center gap-2">
									<BookOpen className="h-6 w-6" />
									{flowInfo.flow_name}
								</CardTitle>
								<CardDescription className="mt-2">
									{flowInfo.subject_name} / {flowInfo.course_name} /{" "}
									{flowInfo.week_name} / {flowInfo.content_name}
								</CardDescription>
							</div>
							<div className="flex gap-2">
								<Button
									variant="outline"
									onClick={returnToWeekPreview}
									className="flex items-center gap-2"
								>
									<ArrowLeft className="h-4 w-4" />
									週プレビューに戻る
								</Button>
								<Button
									variant="secondary"
									onClick={goToFlowEdit}
									className="flex items-center gap-2"
								>
									<Settings className="h-4 w-4" />
									編集モード
								</Button>
							</div>
						</div>
					</CardHeader>
				</Card>
			)}

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
				<div className="grid lg:grid-cols-3 gap-6">
					{/* 演習フロー情報 */}
					<div className="lg:col-span-2">
						<Card>
							<CardHeader>
								<CardTitle className="text-lg">演習フロー情報</CardTitle>
								<CardDescription>
									学生に表示される内容のプレビュー
								</CardDescription>
							</CardHeader>
							<CardContent>
								{welcomeContent?.content ? (
									<div
										className="prose prose-sm max-w-none"
										dangerouslySetInnerHTML={{ __html: welcomeContent.content }}
									/>
								) : (
									<p className="text-gray-500">演習フローの説明がありません</p>
								)}

								<Separator className="my-6" />

								<div className="space-y-4">
									<div className="text-center">
										<h4 className="font-medium mb-4 text-blue-700">
											学生向けアクション (プレビュー)
										</h4>
										<Button
											onClick={startPreviewSession}
											disabled={loading}
											size="lg"
											className="flex items-center gap-2"
										>
											<Play className="h-5 w-5" />
											{loading ? "プレビュー開始中..." : "演習問題をプレビュー"}
										</Button>
										<p className="text-xs text-gray-500 mt-2">
											学生が「演習問題を開始」ボタンを押した時の体験をプレビューできます
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* プレビューオプション */}
					<div>
						<Card>
							<CardHeader>
								<CardTitle className="text-lg flex items-center gap-2">
									<Eye className="h-5 w-5" />
									プレビューオプション
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-3">
									<Card className="p-4">
										<h4 className="font-medium mb-2">演習セッション</h4>
										<p className="text-sm text-gray-600 mb-3">
											学生が実際に演習問題を解く体験をプレビューします
										</p>
										<Button
											onClick={startPreviewSession}
											disabled={loading}
											size="sm"
											className="w-full flex items-center gap-2"
										>
											<Play className="h-4 w-4" />
											演習プレビュー開始
										</Button>
									</Card>

									<Card className="p-4">
										<h4 className="font-medium mb-2">完了画面</h4>
										<p className="text-sm text-gray-600 mb-3">
											学生が演習を完了した時に表示される画面をプレビューします
										</p>
										<Button
											onClick={previewCompletion}
											variant="outline"
											size="sm"
											className="w-full flex items-center gap-2"
										>
											<CheckCircle className="h-4 w-4" />
											完了画面プレビュー
										</Button>
									</Card>
								</div>
							</CardContent>
						</Card>

						{/* セッション履歴情報 */}
						<Card className="mt-6">
							<CardHeader>
								<CardTitle className="text-lg flex items-center gap-2">
									<Clock className="h-5 w-5" />
									セッション履歴 (参考)
								</CardTitle>
								<CardDescription>
									学生には実際のセッション履歴が表示されます
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="text-center py-8 text-gray-500">
									プレビューモードでは
									<br />
									セッション履歴は表示されません
								</div>
								<div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
									<strong>学生画面では:</strong>
									<br />• 過去のセッション一覧
									<br />• 開始・終了時刻
									<br />• 完了状況と正答率
									<br />• 再開・再挑戦ボタン
									<br />
									が表示されます
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			)}

			{/* 教師向けアクション */}
			<Card className="mt-6 bg-blue-50 border-blue-200">
				<CardHeader>
					<CardTitle className="text-lg text-blue-700">
						教師向けアクション
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col sm:flex-row gap-4 justify-center">
						<Button
							onClick={returnToCourseManagement}
							variant="default"
							className="flex items-center gap-2"
						>
							<ArrowLeft className="h-5 w-5" />
							コース管理に戻る
						</Button>

						<Button
							onClick={goToFlowEdit}
							variant="outline"
							className="flex items-center gap-2"
						>
							<Settings className="h-5 w-5" />
							演習フローを編集
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

export default TeacherFlowPreviewPage;
