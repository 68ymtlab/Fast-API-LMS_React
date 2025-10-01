"use client";

import {
	AlertCircle,
	ArrowLeft,
	CheckCircle,
	Clock,
	Eye,
	Play,
	Target,
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
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";

interface FlowInfo {
	flow_id: number;
	flow_name: string;
	flow_detail: string;
	flow_order: number;
	session_count: number;
	estimated_time: number;
	week_id: number;
	week_name: string;
}

interface FlowSession {
	flow_session_id: number;
	session_name: string;
	session_order: number;
	session_type: string;
	page_count: number;
}

function FlowPreviewPage() {
	const { loginUser, isLoadingUser } = useLoginUser();
	const router = useRouter();
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [flowInfo, setFlowInfo] = useState<FlowInfo | null>(null);
	const [flowSessions, setFlowSessions] = useState<FlowSession[]>([]);

	useEffect(() => {
		if (!isLoadingUser && !loginUser) {
			router.push("/login");
		}
	}, [loginUser, isLoadingUser, router]);

	useEffect(() => {
		if (params.course_id && params.flow_id) {
			fetchFlowData();
		}
	}, [params.course_id, params.flow_id]);

	const fetchFlowData = async () => {
		try {
			setLoading(true);

			const [flowResponse, sessionsResponse] = await Promise.all([
				axios.get(`/get_flow_info/${params.flow_id}`),
				axios.get(`/get_flow_sessions/${params.flow_id}`),
			]);

			setFlowInfo(flowResponse.data);
			setFlowSessions(sessionsResponse.data);
		} catch (error) {
			console.error("Error fetching flow data:", error);
			setErrorMessage("演習問題の取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const getSessionTypeIcon = (type: string) => {
		switch (type) {
			case "lecture":
				return <Play className="h-4 w-4" />;
			case "practice":
				return <Target className="h-4 w-4" />;
			case "test":
				return <CheckCircle className="h-4 w-4" />;
			default:
				return <Play className="h-4 w-4" />;
		}
	};

	const getSessionTypeName = (type: string) => {
		switch (type) {
			case "lecture":
				return "講義";
			case "practice":
				return "演習";
			case "test":
				return "テスト";
			default:
				return "その他";
		}
	};

	const getSessionTypeColor = (type: string) => {
		switch (type) {
			case "lecture":
				return "bg-blue-500";
			case "practice":
				return "bg-green-500";
			case "test":
				return "bg-red-500";
			default:
				return "bg-gray-500";
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
		<div className="container mx-auto py-8 px-4 max-w-6xl">
			{/* ナビゲーション */}
			<div className="mb-6">
				<Link
					href={`/t/course/${params.course_id}/preview`}
					className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
				>
					<ArrowLeft className="h-4 w-4" />
					コースプレビューに戻る
				</Link>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-2xl flex items-center gap-2">
						<Eye className="h-6 w-6" />
						演習問題プレビュー
					</CardTitle>
					<CardDescription>
						学生から見た演習問題の表示を確認できます
					</CardDescription>
				</CardHeader>
				<CardContent>
					{errorMessage && (
						<Alert variant="destructive" className="mb-6">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{errorMessage}</AlertDescription>
						</Alert>
					)}

					{flowInfo && (
						<div className="space-y-8">
							{/* 演習問題基本情報 */}
							<Card>
								<CardHeader>
									<div className="flex items-center justify-between">
										<div>
											<CardTitle className="text-lg flex items-center gap-2">
												<Play className="h-5 w-5" />
												{flowInfo.flow_name}
											</CardTitle>
											<div className="flex items-center gap-2 mt-2">
												<Badge variant="outline">
													問題 {flowInfo.flow_order}
												</Badge>
												<Badge
													variant="secondary"
													className="flex items-center gap-1"
												>
													<Clock className="h-3 w-3" />約
													{flowInfo.estimated_time}分
												</Badge>
												<Badge>{flowInfo.session_count}個のセッション</Badge>
											</div>
										</div>
										<div className="flex items-center gap-2">
											<Link
												href={`/t/course/${params.course_id}/week/${flowInfo.week_id}/edit`}
											>
												<Button variant="outline" size="sm">
													編集
												</Button>
											</Link>
										</div>
									</div>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										<div>
											<h4 className="font-semibold mb-2">所属週</h4>
											<p className="text-gray-700">{flowInfo.week_name}</p>
										</div>
										<div>
											<h4 className="font-semibold mb-2">演習問題の説明</h4>
											<p className="text-gray-700 whitespace-pre-wrap">
												{flowInfo.flow_detail}
											</p>
										</div>
									</div>
								</CardContent>
							</Card>

							{/* セッション一覧 */}
							<Card>
								<CardHeader>
									<CardTitle className="text-lg">セッション一覧</CardTitle>
									<CardDescription>
										この演習問題に含まれるセッション ({flowSessions.length}個)
									</CardDescription>
								</CardHeader>
								<CardContent>
									{flowSessions.length === 0 ? (
										<div className="text-center py-8">
											<Target className="mx-auto h-12 w-12 text-gray-400 mb-4" />
											<p className="text-gray-500">
												セッションが登録されていません
											</p>
										</div>
									) : (
										<div className="grid gap-4">
											{flowSessions.map((session) => (
												<Card
													key={session.flow_session_id}
													className={`border-l-4 border-l-blue-500`}
												>
													<CardContent className="p-4">
														<div className="flex items-start justify-between">
															<div className="flex-1">
																<div className="flex items-center gap-3 mb-2">
																	<Badge variant="outline">
																		セッション {session.session_order}
																	</Badge>
																	<div
																		className={`flex items-center gap-1 px-2 py-1 rounded text-xs text-white ${getSessionTypeColor(session.session_type)}`}
																	>
																		{getSessionTypeIcon(session.session_type)}
																		{getSessionTypeName(session.session_type)}
																	</div>
																	<h4 className="font-semibold">
																		{session.session_name}
																	</h4>
																</div>
																<div className="flex items-center gap-4 text-sm text-gray-500">
																	<div className="flex items-center gap-1">
																		<Play className="h-4 w-4" />
																		{session.page_count}ページ
																	</div>
																</div>
															</div>
															<div className="flex flex-col gap-2 ml-4">
																<Link
																	href={`/t/course/${params.course_id}/preview/flow/${params.flow_id}/session/${session.flow_session_id}/1`}
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
								<Link
									href={`/course/${params.course_id}/flow/${params.flow_id}`}
								>
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

export default FlowPreviewPage;
