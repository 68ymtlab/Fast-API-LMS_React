"use client";

import {
	BarElement,
	CategoryScale,
	Chart as ChartJS,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Title,
	Tooltip,
} from "chart.js";
import { AlertCircle, BarChart3, Target, TrendingUp } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import TcAccessTime from "@/components/tc_access_time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import axios from "@/lib/axios";

ChartJS.register(
	CategoryScale,
	LinearScale,
	BarElement,
	LineElement,
	PointElement,
	Title,
	Tooltip,
	Legend,
);

interface SessionData {
	flow_session_grade: number;
	finish_date_time: string;
}

interface ScoreData {
	problem: string;
	date: Date;
	grade: number;
}

function ScorePage() {
	const router = useRouter();
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [data, setData] = useState<any[]>([]);
	const [scores, setScores] = useState<number[]>([]);
	const [names, setNames] = useState<string[]>([]);
	const [lineData, setLineData] = useState<ScoreData[]>([]);

	useEffect(() => {
		if (params.course_id) {
			fetchStudentScore();
		}
	}, [params.course_id]);

	const extractGrades = (data: any[]) => {
		const localScores: number[] = [];
		const localNames: string[] = [];

		const findMaxGrades = (obj: any, contextPath = "") => {
			if (Array.isArray(obj)) {
				let maxGrade = -Infinity;
				obj.forEach((subItem) => {
					if (typeof subItem === "object" && subItem !== null) {
						if (Object.hasOwn(subItem, "flow_session_grade")) {
							if (subItem.flow_session_grade > maxGrade) {
								maxGrade = subItem.flow_session_grade;
							}
						} else {
							findMaxGrades(subItem, contextPath);
						}
					}
				});
				if (maxGrade !== -Infinity) {
					localScores.push(parseFloat(maxGrade.toFixed(1)));
					localNames.push(contextPath);
				}
			} else if (typeof obj === "object" && obj !== null) {
				Object.entries(obj).forEach(([key, value]) =>
					findMaxGrades(value, contextPath ? `${contextPath} > ${key}` : key),
				);
			}
		};

		findMaxGrades(data);
		setScores(localScores);
		setNames(localNames);
	};

	const extractLineData = (data: any[]) => {
		const localLineData: ScoreData[] = [];

		if (Array.isArray(data)) {
			data.forEach((content) => {
				if (typeof content === "object" && content !== null) {
					Object.keys(content).forEach((lesson) => {
						if (Array.isArray(content[lesson])) {
							content[lesson].forEach((exercise: any) => {
								if (typeof exercise === "object" && exercise !== null) {
									Object.keys(exercise).forEach((problem) => {
										if (Array.isArray(exercise[problem])) {
											exercise[problem].forEach((session: SessionData) => {
												if (session && session.finish_date_time) {
													const date = new Date(session.finish_date_time);
													const grade = session.flow_session_grade;

													localLineData.push({
														problem: problem,
														date: date,
														grade: parseFloat(grade.toFixed(1)),
													});
												}
											});
										}
									});
								}
							});
						}
					});
				}
			});
		}

		localLineData.sort((a, b) => a.date.getTime() - b.date.getTime());
		setLineData(localLineData);
	};

	const fetchStudentScore = async () => {
		try {
			setLoading(true);
			const response = await axios.get(
				`/get_flow_session_student_score/${params.course_id}`,
			);
			const responseData = response.data;
			setData(responseData);
			extractGrades(responseData);
			extractLineData(responseData);
		} catch (error) {
			console.error("Error fetching student score:", error);
			setErrorMessage("成績データの取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const chartData = {
		labels: names,
		datasets: [
			{
				label: "得点率",
				data: scores,
				backgroundColor: "rgba(59, 130, 246, 0.5)",
				borderColor: "rgb(59, 130, 246)",
				borderWidth: 1,
				hoverBackgroundColor: "rgba(59, 130, 246, 0.7)",
			},
		],
	};

	const chartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		scales: {
			y: {
				suggestedMin: 0,
				suggestedMax: 100,
				title: {
					display: true,
					text: "得点率 (%)",
				},
			},
		},
		plugins: {
			title: {
				display: true,
				text: "演習問題ごとの得点",
				font: {
					size: 16,
					weight: "bold" as const,
				},
				padding: 20,
			},
			legend: {
				display: false,
			},
		},
	};

	const lineChartData = {
		labels: lineData.map((item) => item.date.toISOString().substring(0, 10)),
		datasets: [
			{
				label: "得点率",
				data: lineData.map((item) => item.grade),
				borderColor: "rgb(59, 130, 246)",
				backgroundColor: "rgba(59, 130, 246, 0.1)",
				fill: true,
				pointRadius: 6,
				pointHoverRadius: 8,
				tension: 0.3,
			},
		],
	};

	const lineChartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		scales: {
			y: {
				suggestedMin: 0,
				suggestedMax: 100,
				title: {
					display: true,
					text: "得点率 (%)",
				},
			},
			x: {
				title: {
					display: true,
					text: "日付",
				},
			},
		},
		plugins: {
			tooltip: {
				callbacks: {
					label: (context: any) => {
						const index = context.dataIndex;
						const problem = lineData[index]?.problem || "No problem";
						const grade = context.raw || "0";
						return `${problem}: ${grade}%`;
					},
				},
			},
			title: {
				display: true,
				text: "演習問題得点率の推移",
				font: {
					size: 16,
					weight: "bold" as const,
				},
				padding: 20,
			},
			legend: {
				display: false,
			},
		},
	};

	return (
		<>
			<TcAccessTime page="student_course_score" />
			<div className="container mx-auto py-8 px-4 max-w-7xl">
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl flex items-center gap-2">
							<BarChart3 className="h-6 w-6" />
							詳細成績
						</CardTitle>
						<CardDescription>
							科目別の詳細な成績情報と学習履歴を確認できます
						</CardDescription>
					</CardHeader>
					<CardContent>
						{errorMessage && (
							<Alert variant="destructive" className="mb-6">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{errorMessage}</AlertDescription>
							</Alert>
						)}

						{scores.length === 0 ? (
							<Card>
								<CardContent className="text-center py-8">
									<Target className="mx-auto h-12 w-12 text-gray-400 mb-4" />
									<p className="text-gray-500">成績データがありません</p>
									<p className="text-sm text-gray-400 mt-2">
										演習問題を解いて成績を確認しましょう
									</p>
								</CardContent>
							</Card>
						) : (
							<div className="space-y-8">
								{/* 棒グラフ */}
								<Card>
									<CardHeader>
										<CardTitle className="text-lg flex items-center gap-2">
											<BarChart3 className="h-5 w-5" />
											演習問題ごとの得点
										</CardTitle>
										<CardDescription>
											各演習問題での最高得点を表示しています
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="h-96 w-full">
											<Bar data={chartData} options={chartOptions} />
										</div>
									</CardContent>
								</Card>

								{/* 折れ線グラフ */}
								<Card>
									<CardHeader>
										<CardTitle className="text-lg flex items-center gap-2">
											<TrendingUp className="h-5 w-5" />
											得点率の推移
										</CardTitle>
										<CardDescription>
											時系列での成績の変化を確認できます
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="h-96 w-full">
											<Line data={lineChartData} options={lineChartOptions} />
										</div>
									</CardContent>
								</Card>

								{/* 統計情報 */}
								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									<Card>
										<CardHeader className="pb-2">
											<CardTitle className="text-sm font-medium text-gray-600">
												平均得点率
											</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="text-2xl font-bold text-blue-600">
												{scores.length > 0
													? (
															scores.reduce((a, b) => a + b, 0) / scores.length
														).toFixed(1)
													: 0}
												%
											</div>
										</CardContent>
									</Card>

									<Card>
										<CardHeader className="pb-2">
											<CardTitle className="text-sm font-medium text-gray-600">
												最高得点率
											</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="text-2xl font-bold text-green-600">
												{scores.length > 0 ? Math.max(...scores).toFixed(1) : 0}
												%
											</div>
										</CardContent>
									</Card>

									<Card>
										<CardHeader className="pb-2">
											<CardTitle className="text-sm font-medium text-gray-600">
												完了した演習数
											</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="text-2xl font-bold text-purple-600">
												{scores.length}問
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

export default ScorePage;
