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
import { useParams } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import axios from "@/lib/axios";

ChartJS.register(
	CategoryScale,
	LinearScale,
	BarElement,
	Title,
	Tooltip,
	Legend,
);

interface ExerciseSessionSummary {
	session_id: number;
	exercise_set_id: number;
	exercise_set_title: string;
	score: number | null;
	started_at: string;
	completed_at: string | null;
}

interface ExerciseSessionStudentInfo {
	user_id: number;
	username: string | null;
	display_name: string | null;
	email: string;
	grade: number | null;
	department: string | null;
	student_number: string | null;
	class_number: string | null;
	class_roster_number: string | null;
}

interface StudentExerciseSessions {
	student: ExerciseSessionStudentInfo;
	sessions: ExerciseSessionSummary[];
}

interface CourseExerciseSet {
	id: number;
	title: string;
	description?: string | null;
	course_id: number;
	question_ids: number[];
	due_date?: string | null;
}

interface CourseEnrolledStudent {
	user_id: number;
	username: string | null;
	display_name: string | null;
	email: string | null;
	grade: number | null;
	department: string | null;
	student_number: string | null;
	class_number: string | null;
	class_roster_number: string | null;
	enrolled_at: string;
}

interface Statistics {
	average: number;
	max: number;
	min: number;
	median: number;
	count: number;
}

const colors = [
	"#0000dd",
	"#dddd00",
	"#aa0000",
	"#008000",
	"#ffa500",
	"#800080",
	"#aa00aa",
	"#00ffff",
	"#98d98e",
	"#a59aca",
	"#762f07",
	"#bce2e8",
	"#928c36",
	"#f8b500",
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
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [apiResponseData, setApiResponseData] = useState<StudentExerciseSessions[]>(
		[],
	);
	const [exerciseSets, setExerciseSets] = useState<CourseExerciseSet[]>([]);
	const [enrolledStudents, setEnrolledStudents] = useState<
		CourseEnrolledStudent[]
	>([]);
	const [exerciseList, setExerciseList] = useState<string[]>([]);
	const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
	const [selectedReachabilitySetIds, setSelectedReachabilitySetIds] = useState<
		number[]
	>([]);
	const [reachabilityStudentFilter, setReachabilityStudentFilter] = useState<
		"all" | "unsolved_any" | "unsolved_all" | "solved_all"
	>("all");
	const [reachabilityKeyword, setReachabilityKeyword] = useState("");
	const [reachabilityTargetSetId, setReachabilityTargetSetId] = useState<
		number | "all"
	>("all");
	const [reachabilityTargetSetStatus, setReachabilityTargetSetStatus] = useState<
		"all" | "attempted" | "unattempted"
	>("all");
	const [showFilterDialog, setShowFilterDialog] = useState(false);

	useEffect(() => {
		if (params.course_id) {
			void fetchScoreData();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [params.course_id]);

	const fetchScoreData = async () => {
		try {
			setLoading(true);
			setErrorMessage("");
			const courseId = params.course_id as string;

			const [sessionsRes, setsRes, enrollRes] = await Promise.all([
				axios.get<StudentExerciseSessions[]>(
					`/courses/${courseId}/exercise-sessions/teacher`,
				),
				axios.get<CourseExerciseSet[]>(`/courses/${courseId}/exercise-sets`),
				axios.get<CourseEnrolledStudent[]>(
					`/courses/${courseId}/enrollments`,
				),
			]);

			setApiResponseData(sessionsRes.data ?? []);
			setExerciseSets(setsRes.data ?? []);
			setEnrolledStudents(enrollRes.data ?? []);
		} catch (error) {
			console.error("Error fetching score data:", error);
			setErrorMessage("成績データの取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const extractGradesByExercise = (
		data: StudentExerciseSessions[],
	): { [exerciseName: string]: number[] } => {
		const gradesByExercise: { [exerciseName: string]: number[] } = {};

		data.forEach((entry) => {
			entry.sessions.forEach((session) => {
				if (session.score == null) return;
				const exerciseName =
					session.exercise_set_title || `演習セット #${session.exercise_set_id}`;
				if (!gradesByExercise[exerciseName]) {
					gradesByExercise[exerciseName] = [];
				}
				gradesByExercise[exerciseName].push(session.score);
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
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

	const toggleReachabilitySetSelection = (setId: number, checked: boolean) => {
		if (checked) {
			setSelectedReachabilitySetIds((prev) =>
				prev.includes(setId) ? prev : [...prev, setId],
			);
		} else {
			setSelectedReachabilitySetIds((prev) => prev.filter((id) => id !== setId));
		}
	};

	const selectAllReachabilitySets = () => {
		setSelectedReachabilitySetIds(exerciseSets.map((set) => set.id));
	};

	const clearAllReachabilitySets = () => {
		setSelectedReachabilitySetIds([]);
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
		link.setAttribute(
			"download",
			`course_${params.course_id as string}_scores.csv`,
		);
		link.style.visibility = "hidden";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const flattenedSessions = useMemo(() => {
		return apiResponseData.flatMap((entry) =>
			entry.sessions.map((session) => ({
				student: entry.student,
				session,
			})),
		);
	}, [apiResponseData]);

	const sessionMap = useMemo(() => {
		const map = new Map<string, ExerciseSessionSummary[]>();
		for (const entry of apiResponseData) {
			for (const session of entry.sessions) {
				const key = `${entry.student.user_id}-${session.exercise_set_id}`;
				const list = map.get(key) ?? [];
				list.push(session);
				map.set(key, list);
			}
		}
		return map;
	}, [apiResponseData]);

	const filteredReachabilitySets = useMemo(() => {
		if (selectedReachabilitySetIds.length === 0) {
			return exerciseSets;
		}
		return exerciseSets.filter((set) => selectedReachabilitySetIds.includes(set.id));
	}, [exerciseSets, selectedReachabilitySetIds]);

	const reachabilityTargetSetOptions = useMemo(() => {
		return filteredReachabilitySets.length > 0
			? filteredReachabilitySets
			: exerciseSets;
	}, [filteredReachabilitySets, exerciseSets]);

	useEffect(() => {
		if (
			reachabilityTargetSetId !== "all" &&
			!reachabilityTargetSetOptions.some((set) => set.id === reachabilityTargetSetId)
		) {
			setReachabilityTargetSetId("all");
		}
	}, [reachabilityTargetSetId, reachabilityTargetSetOptions]);

	const filteredReachabilityStudents = useMemo(() => {
		if (filteredReachabilitySets.length === 0) {
			return enrolledStudents;
		}

		return enrolledStudents.filter((student) => {
			const keyword = reachabilityKeyword.trim().toLowerCase();
			const searchable = [
				student.display_name ?? "",
				student.username ?? "",
				student.email ?? "",
				student.student_number ?? "",
				student.department ?? "",
				student.class_number ?? "",
				student.class_roster_number ?? "",
			]
				.join(" ")
				.toLowerCase();
			const matchesKeyword = keyword ? searchable.includes(keyword) : true;
			if (!matchesKeyword) return false;

			const attemptedCount = filteredReachabilitySets.filter((set) => {
				const key = `${student.user_id}-${set.id}`;
				return (sessionMap.get(key) ?? []).length > 0;
			}).length;
			const total = filteredReachabilitySets.length;

			let matchesOverall = true;
			switch (reachabilityStudentFilter) {
				case "unsolved_any":
					matchesOverall = attemptedCount < total;
					break;
				case "unsolved_all":
					matchesOverall = attemptedCount === 0;
					break;
				case "solved_all":
					matchesOverall = attemptedCount === total;
					break;
				case "all":
				default:
					matchesOverall = true;
					break;
			}

			if (!matchesOverall) return false;

			if (
				reachabilityTargetSetId !== "all" &&
				reachabilityTargetSetStatus !== "all"
			) {
				const key = `${student.user_id}-${reachabilityTargetSetId}`;
				const attempted = (sessionMap.get(key) ?? []).length > 0;
				return reachabilityTargetSetStatus === "attempted"
					? attempted
					: !attempted;
			}

			return true;
		});
	}, [
		enrolledStudents,
		filteredReachabilitySets,
		reachabilityStudentFilter,
		reachabilityKeyword,
		reachabilityTargetSetId,
		reachabilityTargetSetStatus,
		sessionMap,
	]);

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
								コース全体の学生成績と、各学生が解いた演習の状況を確認できます
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
							<div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary" />
						</div>
					) : (
						<div className="space-y-8">
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
																className={`${
																	index % 2 === 0 ? "bg-gray-50" : "bg-white"
																} hover:bg-gray-100 transition-colors`}
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

							{exerciseSets.length > 0 && enrolledStudents.length > 0 && (
								<Card>
									<CardHeader>
										<CardTitle className="text-lg">
											演習セット別の到達状況
										</CardTitle>
										<CardDescription>
											コースを履修している全学生が、どの演習セットに挑戦したかを一覧で確認できます
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="mb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
											<Input
												value={reachabilityKeyword}
												onChange={(e) => setReachabilityKeyword(e.target.value)}
												placeholder="氏名 / メール / 学籍番号で検索"
											/>
											<select
												className="h-10 rounded-md border bg-background px-3 text-sm"
												value={reachabilityStudentFilter}
												onChange={(e) =>
													setReachabilityStudentFilter(
														e.target.value as typeof reachabilityStudentFilter,
													)
												}
											>
												<option value="all">全員表示</option>
												<option value="unsolved_any">未実施がある学生</option>
												<option value="unsolved_all">
													すべて未実施の学生
												</option>
												<option value="solved_all">すべて実施済みの学生</option>
											</select>
											<select
												className="h-10 rounded-md border bg-background px-3 text-sm"
												value={String(reachabilityTargetSetId)}
												onChange={(e) =>
													setReachabilityTargetSetId(
														e.target.value === "all"
															? "all"
															: Number(e.target.value),
													)
												}
											>
												<option value="all">対象演習セット: すべて</option>
												{reachabilityTargetSetOptions.map((set) => (
													<option key={set.id} value={String(set.id)}>
														{set.title || `セット #${set.id}`}
													</option>
												))}
											</select>
											<select
												className="h-10 rounded-md border bg-background px-3 text-sm"
												value={reachabilityTargetSetStatus}
												onChange={(e) =>
													setReachabilityTargetSetStatus(
														e.target.value as typeof reachabilityTargetSetStatus,
													)
												}
												disabled={reachabilityTargetSetId === "all"}
											>
												<option value="all">対象セット条件: 指定なし</option>
												<option value="unattempted">対象セットが未実施</option>
												<option value="attempted">対象セットが実施済み</option>
											</select>
										</div>
										<div className="mb-3 text-xs text-gray-500">
											表示学生: {filteredReachabilityStudents.length} /{" "}
											{enrolledStudents.length}
										</div>
										<div className="overflow-x-auto">
											<table className="w-full border-collapse border border-gray-300 text-xs md:text-sm">
												<thead>
													<tr className="bg-gray-100">
														<th className="border border-gray-300 p-2 text-left">
															学生
														</th>
														<th className="border border-gray-300 p-2 text-left">
															学籍情報
														</th>
														{filteredReachabilitySets.map((set) => (
															<th
																key={set.id}
																className="border border-gray-300 p-2 text-center"
															>
																{set.title || `セット #${set.id}`}
															</th>
														))}
													</tr>
												</thead>
												<tbody>
													{filteredReachabilityStudents.map((student) => {
														const label =
															student.display_name ||
															student.username ||
															student.email ||
															`ID: ${student.user_id}`;

														const metaParts: string[] = [];
														if (student.grade != null) {
															metaParts.push(`${student.grade}年`);
														}
														if (student.department) {
															metaParts.push(student.department);
														}
														if (student.class_number) {
															metaParts.push(student.class_number);
														}
														if (student.student_number) {
															metaParts.push(
																`学籍番号: ${student.student_number}`,
															);
														}

														return (
															<tr key={student.user_id}>
																<td className="border border-gray-300 p-2 align-top">
																	<div className="flex flex-col">
																		<span className="font-medium">
																			{label}
																		</span>
																		{student.email && (
																			<span className="text-[10px] text-gray-500">
																				{student.email}
																			</span>
																		)}
																	</div>
																</td>
																<td className="border border-gray-300 p-2 align-top">
																	{metaParts.length > 0 ? (
																		<div className="flex flex-col gap-0.5">
																			{metaParts.map((part) => (
																				<span
																					key={`${student.user_id}-${part}`}
																					className="text-[10px] text-gray-600"
																				>
																					{part}
																				</span>
																			))}
																		</div>
																	) : (
																		<span className="text-[10px] text-gray-400">
																			情報なし
																		</span>
																	)}
																</td>
																{filteredReachabilitySets.map((set) => {
																	const key = `${student.user_id}-${set.id}`;
																	const sessionsForCell =
																		sessionMap.get(key) ?? [];

																	if (sessionsForCell.length === 0) {
																		return (
																			<td
																				key={key}
																				className="border border-gray-300 p-2 text-center align-top"
																			>
																				<span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
																					未実施
																				</span>
																			</td>
																		);
																	}

																	const scores = sessionsForCell
																		.map((s) => s.score)
																		.filter(
																			(
																				s,
																			): s is number => s !== null,
																		);
																	const bestScore =
																		scores.length > 0
																			? Math.max(...scores)
																			: null;
																	const attempts =
																		sessionsForCell.length;

																	const lastStarted = sessionsForCell
																		.map((s) => new Date(s.started_at).getTime())
																		.reduce(
																			(a, b) => Math.max(a, b),
																			0,
																		);

																	return (
																		<td
																			key={key}
																			className="border border-gray-300 p-2 text-center align-top"
																		>
																			<div className="flex flex-col items-center gap-0.5">
																				<span className="text-[11px] font-semibold text-gray-900">
																					{bestScore != null
																						? `${bestScore.toFixed(1)}%`
																						: "-"}
																				</span>
																				<span className="text-[10px] text-gray-500">
																					{attempts}回
																				</span>
																				{lastStarted > 0 && (
																					<span className="text-[9px] text-gray-400">
																						最終:
																						{" "}
																						{new Date(
																							lastStarted,
																						).toLocaleDateString("ja-JP")}
																					</span>
																				)}
																			</div>
																		</td>
																	);
																})}
															</tr>
														);
													})}
												</tbody>
											</table>
											{filteredReachabilityStudents.length === 0 && (
												<p className="text-sm text-gray-500 text-center py-4">
													条件に一致する学生はいません。
												</p>
											)}
											{filteredReachabilitySets.length === 0 && (
												<p className="text-sm text-gray-500 text-center py-4">
													表示対象の演習セットが選択されていません。
												</p>
											)}
										</div>
									</CardContent>
								</Card>
							)}

							<Card>
								<CardHeader>
									<CardTitle className="text-lg">
										学生ごとの演習セッション一覧
									</CardTitle>
									<CardDescription>
										どの学生がどの演習セットをいつ受験し、スコアがどうだったかを確認できます
									</CardDescription>
								</CardHeader>
								<CardContent>
									{flattenedSessions.length === 0 ? (
										<p className="text-sm text-gray-500 text-center py-4">
											演習セッションのデータがありません。
										</p>
									) : (
										<div className="overflow-x-auto">
											<table className="w-full border-collapse border border-gray-300 text-sm">
												<thead>
													<tr className="bg-gray-100">
														<th className="border border-gray-300 p-2 text-left">
															学生
														</th>
														<th className="border border-gray-300 p-2 text-left">
															学籍情報
														</th>
														<th className="border border-gray-300 p-2 text-left">
															演習セット
														</th>
														<th className="border border-gray-300 p-2 text-center">
															スコア
														</th>
														<th className="border border-gray-300 p-2 text-left">
															開始時刻
														</th>
														<th className="border border-gray-300 p-2 text-left">
															完了時刻
														</th>
													</tr>
												</thead>
												<tbody>
													{flattenedSessions.map(({ student, session }) => {
														const exerciseName =
															session.exercise_set_title ||
															`演習セット #${session.exercise_set_id}`;
														const started = new Date(
															session.started_at,
														).toLocaleString("ja-JP");
														const completed = session.completed_at
															? new Date(
																	session.completed_at,
																).toLocaleString("ja-JP")
															: "-";

														const studentLabel =
															student.display_name ||
															student.username ||
															student.email;

														const metaParts: string[] = [];
														if (student.grade != null) {
															metaParts.push(`${student.grade}年`);
														}
														if (student.department) {
															metaParts.push(student.department);
														}
														if (student.class_number) {
															metaParts.push(student.class_number);
														}
														if (student.student_number) {
															metaParts.push(
																`学籍番号: ${student.student_number}`,
															);
														}

														return (
															<tr key={`${student.user_id}-${session.session_id}`}>
																<td className="border border-gray-300 p-2">
																	<div className="flex flex-col">
																		<span className="font-medium">
																			{studentLabel}
																		</span>
																		<span className="text-xs text-gray-500">
																			{student.email}
																		</span>
																	</div>
																</td>
																<td className="border border-gray-300 p-2">
																	{metaParts.length > 0 ? (
																		<div className="flex flex-col gap-0.5">
																			{metaParts.map((part) => (
																				<span
																					key={`${student.user_id}-${part}`}
																					className="text-xs text-gray-600"
																				>
																					{part}
																				</span>
																			))}
																		</div>
																	) : (
																		<span className="text-xs text-gray-400">
																			情報なし
																		</span>
																	)}
																</td>
																<td className="border border-gray-300 p-2">
																	{exerciseName}
																</td>
																<td className="border border-gray-300 p-2 text-center">
																	{session.score != null
																		? `${session.score.toFixed(1)}%`
																		: "-"}
																</td>
																<td className="border border-gray-300 p-2">
																	{started}
																</td>
																<td className="border border-gray-300 p-2">
																	{completed}
																</td>
															</tr>
														);
													})}
												</tbody>
											</table>
										</div>
									)}
								</CardContent>
							</Card>
						</div>
					)}
				</CardContent>
			</Card>

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
						<div className="border-t pt-4">
							<div className="flex items-center justify-between mb-2">
								<p className="text-sm font-medium">到達状況（演習セット別）</p>
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={selectAllReachabilitySets}
									>
										全て選択
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={clearAllReachabilitySets}
									>
										全て解除
									</Button>
								</div>
							</div>
							<div className="grid grid-cols-2 gap-4 max-h-64 overflow-y-auto">
								{exerciseSets.map((set) => (
									<div key={set.id} className="flex items-center space-x-2">
										<Checkbox
											checked={selectedReachabilitySetIds.includes(set.id)}
											onCheckedChange={(checked) =>
												toggleReachabilitySetSelection(
													set.id,
													checked as boolean,
												)
											}
										/>
										<label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
											{set.title || `セット #${set.id}`}
										</label>
									</div>
								))}
							</div>
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
