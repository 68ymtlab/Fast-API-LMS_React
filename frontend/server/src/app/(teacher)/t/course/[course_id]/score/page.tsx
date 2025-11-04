"use client";

import {
	BarElement,
	CategoryScale,
	Chart as ChartJS,
	Legend,
	LinearScale,
	Title,
	Tooltip,
} from "chart.js";
import {
	AlertCircle,
	BarChart3,
	Download,
	Filter,
	TrendingUp,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";

ChartJS.register(
	CategoryScale,
	LinearScale,
	BarElement,
	Title,
	Tooltip,
	Legend,
);

interface ExerciseGrade {
	flow_session_grade: number;
	[key: string]: any;
}

interface ExerciseData {
	[exerciseName: string]: ExerciseGrade[];
}

interface ContentData {
	[key: string]: ExerciseData[];
}

interface Statistics {
	average: number;
	max: number;
	min: number;
	median: number;
	count: number;
}

const colors = [
	"#0000dd", // 青
	"#dddd00", // 黄色
	"#aa0000", // 赤
	"#008000", // 緑
	"#ffa500", // オレンジ
	"#800080", // 紫
	"#aa00aa", // ピンク
	"#00ffff", // シアン
	"#98d98e", // 若草
	"#a59aca", // すみれ
	"#762f07", // 栗色
	"#bce2e8", // 水色
	"#928c36", // 鶯色
	"#f8b500", // 山吹
	"#f6bfbc",
];

const ranges = [
	{ min: 0, max: 15, label: "0〜15" },
	{ min: 15, max: 30, label: "15〜30" },
	{ min: 30, max: 45, label: "30〜45" },
	{ min: 45, max: 60, label: "45〜60" },
	{ min: 60, max: 75, label: "60〜75" },
	{ min: 75, max: 90, label: "75〜90" },
	{ min: 90, max: 101, label: "90〜100" },
];

function CourseScorePage() {
	const { loginUser, isLoadingUser } = useLoginUser();
	const router = useRouter();
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [apiResponseData, setApiResponseData] = useState<ContentData[]>([]);
	const [exerciseList, setExerciseList] = useState<string[]>([]);
	const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
	const [showFilterDialog, setShowFilterDialog] = useState(false);

	useEffect(() => {
		if (!isLoadingUser && !loginUser) {
			router.push("/login");
		}
	}, [loginUser, isLoadingUser, router]);

	useEffect(() => {
		if (params.course_id) {
			fetchScoreData();
		}
	}, [params.course_id]);

	const fetchScoreData = async () => {
		try {
			setLoading(true);
			setErrorMessage("");
			const response = await axios.get(
				`/get_flow_session_teacher_score/${params.course_id}`,
			);
			setApiResponseData(response.data);
		} catch (error) {
			console.error("Error fetching score data:", error);
			setErrorMessage("成績データの取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const extractGradesByExercise = (
		data: ContentData[],
	): { [exerciseName: string]: number[] } => {
		const gradesByExercise: { [exerciseName: string]: number[] } = {};

		data.forEach((content) => {
			Object.values(content).forEach((exercises) => {
				exercises.forEach((exercise) => {
					Object.keys(exercise).forEach((exerciseName) => {
						const grades = exercise[exerciseName].map(
							(item) => item.flow_session_grade,
						);
						gradesByExercise[exerciseName] = grades;
					});
				});
			});
		});

		return gradesByExercise;
	};

	const calculateStatistics = (grades: number[]): Statistics => {
		if (!grades || grades.length === 0) {
			return {
				average: 0,
				max: 0,
				min: 0,
				median: 0,
				count: 0,
			};
		}

		const average = grades.reduce((acc, curr) => acc + curr, 0) / grades.length;
		const max = Math.max(...grades);
		const min = Math.min(...grades);
		const sortedGrades = [...grades].sort((a, b) => a - b);
		const middle = Math.floor(sortedGrades.length / 2);
		const median =
			sortedGrades.length % 2 === 0
				? (sortedGrades[middle - 1] + sortedGrades[middle]) / 2
				: sortedGrades[middle];
		const count = grades.length;

		return { average, max, min, median, count };
	};

	const calculateRangeCounts = (grades: number[]): number[] => {
		return ranges.map((range) => {
			return grades.filter((value) => value >= range.min && value < range.max)
				.length;
		});
	};

	const exerciseStatistics = useMemo(() => {
		const gradesByExercise = extractGradesByExercise(apiResponseData);
		const stats: { [exerciseName: string]: Statistics } = {};

		Object.keys(gradesByExercise).forEach((exerciseName) => {
			stats[exerciseName] = calculateStatistics(gradesByExercise[exerciseName]);
		});

		// Update exercise list
		const currentExerciseList = Object.keys(gradesByExercise);
		if (JSON.stringify(currentExerciseList) !== JSON.stringify(exerciseList)) {
			setExerciseList(currentExerciseList);
		}

		return stats;
	}, [apiResponseData, exerciseList]);

	const chartData = useMemo(() => {
		const gradesByExercise = extractGradesByExercise(apiResponseData);

		const datasets = Object.keys(gradesByExercise).map(
			(exerciseName, index) => ({
				label: exerciseName,
				data: calculateRangeCounts(gradesByExercise[exerciseName]),
				backgroundColor: colors[index % colors.length],
				hoverBackgroundColor: colors[index % colors.length],
			}),
		);

		const filteredDatasets =
			selectedExercises.length > 0
				? datasets.filter((dataset) =>
						selectedExercises.includes(dataset.label),
					)
				: datasets;

		return {
			labels: ranges.map((range) => range.label),
			datasets: filteredDatasets,
		};
	}, [apiResponseData, selectedExercises]);

	const chartOptions = {
		responsive: true,
		scales: {
			y: {
				suggestedMin: 0,
				suggestedMax: 30,
				beginAtZero: true,
			},
		},
		plugins: {
			title: {
				display: true,
				text: "演習問題 成績分布",
				color: "black",
				position: "top" as const,
				align: "center" as const,
				font: {
					weight: "bold" as const,
					size: 20,
				},
				padding: 20,
			},
			legend: {
				display: true,
				position: "bottom" as const,
			},
			tooltip: {
				callbacks: {
					label: (context: any) =>
						`${context.dataset.label}: ${context.parsed.y}人`,
				},
			},
		},
	};

	const handleExerciseSelection = (exerciseName: string, checked: boolean) => {
		if (checked) {
			setSelectedExercises((prev) => [...prev, exerciseName]);
		} else {
			setSelectedExercises((prev) =>
				prev.filter((name) => name !== exerciseName),
			);
		}
	};

	const selectAllExercises = () => {
		setSelectedExercises(exerciseList);
	};

	const clearAllExercises = () => {
		setSelectedExercises([]);
	};

	const exportData = () => {
		const csvContent = [
			["演習問題", "平均値", "最大値", "最小値", "中央値", "データ数"],
			...Object.entries(exerciseStatistics).map(([exerciseName, stats]) => [
				exerciseName,
				stats.average.toFixed(1),
				stats.max.toFixed(1),
				stats.min.toFixed(1),
				stats.median.toFixed(1),
				stats.count.toString(),
			]),
		]
			.map((row) => row.join(","))
			.join("\n");

		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
		const link = document.createElement("a");
		const url = URL.createObjectURL(blob);
		link.setAttribute("href", url);
		link.setAttribute("download", `course_${params.course_id}_scores.csv`);
		link.style.visibility = "hidden";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
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
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="text-2xl flex items-center gap-2">
								<BarChart3 className="h-6 w-6" />
								成績管理
							</CardTitle>
							<CardDescription>
								コース全体の学生成績を分析・管理できます
							</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								onClick={() => setShowFilterDialog(true)}
								className="flex items-center gap-2"
							>
								<Filter className="h-4 w-4" />
								フィルター
							</Button>
							<Button
								variant="outline"
								onClick={exportData}
								disabled={Object.keys(exerciseStatistics).length === 0}
								className="flex items-center gap-2"
							>
								<Download className="h-4 w-4" />
								CSVエクスポート
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent>
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
						<div className="space-y-8">
							{/* フィルター状態表示 */}
							{selectedExercises.length > 0 && (
								<Card className="bg-blue-50 border-blue-200">
									<CardContent className="p-4">
										<div className="flex items-center gap-2 flex-wrap">
											<span className="text-sm font-medium text-blue-800">
												選択中の演習問題:
											</span>
											{selectedExercises.map((exercise) => (
												<Badge
													key={exercise}
													variant="secondary"
													className="bg-blue-100 text-blue-800"
												>
													{exercise}
												</Badge>
											))}
											<Button
												variant="ghost"
												size="sm"
												onClick={clearAllExercises}
												className="text-blue-600 hover:text-blue-800"
											>
												クリア
											</Button>
										</div>
									</CardContent>
								</Card>
							)}

							{/* グラフ */}
							{Object.keys(exerciseStatistics).length > 0 ? (
								<Card>
									<CardContent className="p-6 flex justify-center">
										<div className="relative h-96 w-full max-w-4xl">
											<Bar data={chartData} options={chartOptions} />
										</div>
									</CardContent>
								</Card>
							) : (
								<Card>
									<CardContent className="p-8 text-center">
										<TrendingUp className="mx-auto h-12 w-12 text-gray-400 mb-4" />
										<p className="text-gray-500">成績データがありません</p>
									</CardContent>
								</Card>
							)}

							{/* 統計テーブル */}
							{Object.keys(exerciseStatistics).length > 0 && (
								<Card>
									<CardHeader>
										<CardTitle className="text-lg">統計情報</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="overflow-x-auto">
											<table className="w-full border-collapse border border-gray-300">
												<thead>
													<tr className="bg-blue-600 text-white">
														<th className="border border-gray-300 p-3 text-left font-bold">
															演習問題
														</th>
														<th className="border border-gray-300 p-3 text-center font-bold">
															平均値
														</th>
														<th className="border border-gray-300 p-3 text-center font-bold">
															最大値
														</th>
														<th className="border border-gray-300 p-3 text-center font-bold">
															最小値
														</th>
														<th className="border border-gray-300 p-3 text-center font-bold">
															中央値
														</th>
														<th className="border border-gray-300 p-3 text-center font-bold">
															データ数
														</th>
													</tr>
												</thead>
												<tbody>
													{Object.entries(exerciseStatistics).map(
														([exerciseName, stats], index) => (
															<tr
																key={exerciseName}
																className={`${index % 2 === 0 ? "bg-gray-50" : "bg-white"} hover:bg-gray-100 transition-colors`}
															>
																<td className="border border-gray-300 p-3 font-medium">
																	{exerciseName}
																</td>
																<td className="border border-gray-300 p-3 text-center">
																	{stats.count > 0
																		? `${stats.average.toFixed(1)}%`
																		: "-"}
																</td>
																<td className="border border-gray-300 p-3 text-center">
																	{stats.count > 0
																		? `${stats.max.toFixed(1)}%`
																		: "-"}
																</td>
																<td className="border border-gray-300 p-3 text-center">
																	{stats.count > 0
																		? `${stats.min.toFixed(1)}%`
																		: "-"}
																</td>
																<td className="border border-gray-300 p-3 text-center">
																	{stats.count > 0
																		? `${stats.median.toFixed(1)}%`
																		: "-"}
																</td>
																<td className="border border-gray-300 p-3 text-center">
																	{stats.count}
																</td>
															</tr>
														),
													)}
												</tbody>
											</table>
										</div>
									</CardContent>
								</Card>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			{/* フィルターダイアログ */}
			<Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
				<DialogContent className="sm:max-w-[600px]">
					<DialogHeader>
						<DialogTitle>演習問題フィルター</DialogTitle>
						<DialogDescription>
							表示する演習問題を選択してください
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="flex items-center gap-2">
							<Button variant="outline" size="sm" onClick={selectAllExercises}>
								全て選択
							</Button>
							<Button variant="outline" size="sm" onClick={clearAllExercises}>
								全て解除
							</Button>
						</div>
						<div className="grid grid-cols-2 gap-4 max-h-64 overflow-y-auto">
							{exerciseList.map((exercise) => (
								<div key={exercise} className="flex items-center space-x-2">
									<Checkbox
										checked={selectedExercises.includes(exercise)}
										onCheckedChange={(checked) =>
											handleExerciseSelection(exercise, checked as boolean)
										}
									/>
									<label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
										{exercise}
									</label>
								</div>
							))}
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowFilterDialog(false)}
						>
							閉じる
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default CourseScorePage;
