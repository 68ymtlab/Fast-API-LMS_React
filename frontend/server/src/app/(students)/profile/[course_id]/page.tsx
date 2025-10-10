"use client";

import {
	AlertCircle,
	Calendar,
	ChevronDown,
	ChevronRight,
	Target,
} from "lucide-react";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { MathJax } from "@/components/shared/MathJax";
import TcAccessTime from "@/components/tc_access_time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import axios from "@/lib/axios";

interface FlowPage {
	id: number;
	content: string;
}

interface FlowSession {
	flow_session_id: number;
	finish_date_time: string;
	flow_session_grade: number;
	flow_page: FlowPage[];
}

interface FlowSessionHistory {
	[weekKey: string]: {
		[flowKey: string]: FlowSession[];
	}[];
}

const ProfilePage = () => {
	const params = useParams();
	const course_id = params.course_id as string;
	const [flowSessionHistory, setFlowSessionHistory] = useState<
		FlowSessionHistory[]
	>([]);
	const [expanded, setExpanded] = useState<{ [key: string]: boolean }>({});

	useEffect(() => {
		axios.get(`/get_flow_session_history/${course_id}`).then((res) => {
			console.log("API Response:", res.data);
			setFlowSessionHistory(res.data);
		});
	}, [course_id]);

	const toggle = (key: string) =>
		setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

	const processDate = (date: string) =>
		date ? new Date(date).toLocaleString("ja-JP") : "未完了";

	const getGradeColor = (grade: number) => {
		if (grade >= 80) return "text-green-600";
		if (grade >= 60) return "text-yellow-600";
		return "text-red-600";
	};

	const getGradeBadgeVariant = (grade: number) => {
		if (grade >= 80) return "default";
		if (grade >= 60) return "secondary";
		return "destructive";
	};

	return (
		<>
			<TcAccessTime page="student_profile_detail" />
			<div className="min-h-screen bg-white p-4">
				<div className="max-w-4xl mx-auto">
					<div className="mb-8">
						<h1 className="text-3xl font-bold text-gray-900 mb-2">演習履歴</h1>
						<p className="text-gray-600">
							コースの学習進捗と成績を確認できます
						</p>
					</div>

					{flowSessionHistory.length === 0 && (
						<Card>
							<CardContent className="flex items-center justify-center py-12">
								<div className="text-center">
									<AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
									<p className="text-gray-500 text-lg">履歴がありません</p>
								</div>
							</CardContent>
						</Card>
					)}

					{flowSessionHistory.map((weekData, weekIdx) =>
						Object.entries(weekData).map(([weekKey, weekContent]) => {
							const weekKeyId = `week-${weekKey}`;
							return (
								<Card key={weekKeyId} className="mb-6 shadow-lg border-0">
									<CardHeader
										className="cursor-pointer hover:bg-gray-50 transition-colors"
										onClick={() => toggle(weekKeyId)}
									>
										<div className="flex items-center justify-between">
											<CardTitle className="text-xl text-gray-800 flex items-center gap-3">
												<div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
													<span className="text-blue-600 font-semibold text-sm">
														{weekIdx + 1}
													</span>
												</div>
												{weekKey}
											</CardTitle>
											<Button variant="ghost" size="sm" className="p-2">
												{expanded[weekKeyId] ? (
													<ChevronDown className="h-5 w-5" />
												) : (
													<ChevronRight className="h-5 w-5" />
												)}
											</Button>
										</div>
									</CardHeader>

									{expanded[weekKeyId] && (
										<CardContent className="pt-0">
											{weekContent.length === 0 ? (
												<div className="text-center py-8 text-gray-500">
													演習がありません
												</div>
											) : (
												<div className="space-y-4">
													{weekContent.map((flowData, flowIdx) =>
														Object.entries(flowData).map(
															([flowKey, flowContent]) => {
																const flowKeyId = `${weekKeyId}-flow-${flowKey}`;
																return (
																	<Card
																		key={flowKeyId}
																		className="border border-gray-200"
																	>
																		<CardHeader
																			className="cursor-pointer hover:bg-gray-50 transition-colors py-4"
																			onClick={() => toggle(flowKeyId)}
																		>
																			<div className="flex items-center justify-between">
																				<CardTitle className="text-lg text-gray-700 flex items-center gap-2">
																					<Target className="h-5 w-5 text-blue-500" />
																					{flowKey}
																				</CardTitle>
																				<Button
																					variant="ghost"
																					size="sm"
																					className="p-2"
																				>
																					{expanded[flowKeyId] ? (
																						<ChevronDown className="h-4 w-4" />
																					) : (
																						<ChevronRight className="h-4 w-4" />
																					)}
																				</Button>
																			</div>
																		</CardHeader>

																		{expanded[flowKeyId] && (
																			<CardContent className="pt-0">
																				<div className="space-y-3">
																					{flowContent.map(
																						(flowSession, sessionIdx) => {
																							const sessionKey = `${flowKeyId}-session-${sessionIdx}`;
																							const isCompleted =
																								flowSession.flow_session_grade ===
																								100;
																							return (
																								<Card
																									key={sessionKey}
																									className={`border ${isCompleted ? "border-green-200 bg-green-50" : "border-gray-200"}`}
																								>
																									<CardHeader
																										className={`cursor-pointer transition-colors py-3 ${isCompleted ? "hover:bg-green-100" : "hover:bg-gray-50"}`}
																										onClick={() =>
																											!isCompleted &&
																											toggle(sessionKey)
																										}
																									>
																										<div className="flex items-center justify-between">
																											<div className="flex items-center gap-3">
																												<Calendar className="h-4 w-4 text-gray-500" />
																												<span className="text-sm text-gray-600">
																													{processDate(
																														flowSession.finish_date_time,
																													)}
																												</span>
																											</div>
																											<div className="flex items-center gap-3">
																												<Badge
																													variant={getGradeBadgeVariant(
																														flowSession.flow_session_grade,
																													)}
																												>
																													{Math.ceil(
																														flowSession.flow_session_grade,
																													)}
																													%
																												</Badge>
																												<Button
																													variant="ghost"
																													size="sm"
																													className="p-2"
																													disabled={isCompleted}
																												>
																													{expanded[
																														sessionKey
																													] ? (
																														<ChevronDown className="h-4 w-4" />
																													) : (
																														<ChevronRight className="h-4 w-4" />
																													)}
																												</Button>
																											</div>
																										</div>

																										<div className="mt-3">
																											<div className="flex items-center gap-2 mb-2">
																												<span className="text-sm text-gray-600">
																													進捗
																												</span>
																												<span
																													className={`text-sm font-medium ${getGradeColor(flowSession.flow_session_grade)}`}
																												>
																													{Math.ceil(
																														flowSession.flow_session_grade,
																													)}
																													%
																												</span>
																											</div>
																											<Progress
																												value={
																													flowSession.flow_session_grade
																												}
																												className="h-2"
																											/>
																										</div>
																									</CardHeader>

																									{expanded[sessionKey] &&
																										!isCompleted && (
																											<CardContent className="pt-0">
																												<div className="bg-white rounded-lg border border-gray-200 p-4">
																													<h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
																														<AlertCircle className="h-4 w-4 text-orange-500" />
																														間違えた問題
																													</h4>
																													{flowSession.flow_page
																														.length === 0 ? (
																														<p className="text-gray-500 text-sm">
																															間違えた問題はありません
																														</p>
																													) : (
																														<div className="space-y-3">
																															{flowSession.flow_page.map(
																																(
																																	flowPage,
																																	idx,
																																) => (
																																	<Card
																																		key={idx}
																																		className="border border-orange-200 bg-orange-50"
																																	>
																																		<CardContent className="p-3">
																																			<div className="flex items-start gap-2">
																																				<span className="text-orange-600 font-medium text-sm">
																																					Q
																																					{idx +
																																						1}
																																				</span>
																																				<div className="flex-1">
																																					<MathJax
																																						text={
																																							flowPage.content
																																						}
																																					/>
																																				</div>
																																			</div>
																																		</CardContent>
																																	</Card>
																																),
																															)}
																														</div>
																													)}
																												</div>
																											</CardContent>
																										)}
																								</Card>
																							);
																						},
																					)}
																				</div>
																			</CardContent>
																		)}
																	</Card>
																);
															},
														),
													)}
												</div>
											)}
										</CardContent>
									)}
								</Card>
							);
						}),
					)}
				</div>
			</div>
		</>
	);
};

export default ProfilePage;
