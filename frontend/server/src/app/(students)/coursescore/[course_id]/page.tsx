"use client";
import type { ChartDataset, TooltipItem } from "chart.js";
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
import {
	AlertCircle,
	BarChart3,
	Gauge,
	LineChart as LineChartIcon,
	Target,
	TrendingUp,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
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
import axios from "@/lib/axios";

ChartJS.register(
	Title,
	Tooltip,
	Legend,
	BarElement,
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
);

const ascTimeSort = (a: Date, b: Date) => (a > b ? 1 : -1);

// 型定義
// セッション情報
interface Session {
	finish_date_time?: string;
	flow_session_grade?: number;
}
// 問題ごとの配列
interface Exercise {
	[problem: string]: Session[];
}
// レッスンごとの配列
interface Lesson {
	[lesson: string]: Exercise[];
}
// コースデータ配列
export type ScoreResponse = Lesson[];

const extractGrades = (data: ScoreResponse) => {
	const localScores: string[] = [];
	const localNames: string[] = [];

	const findMaxGrades = (obj: unknown, contextPath = "") => {
		if (Array.isArray(obj)) {
			let maxGrade = Number.NEGATIVE_INFINITY;
			for (const subItem of obj) {
				if (typeof subItem === "object" && subItem !== null) {
					if ("flow_session_grade" in subItem) {
						const s = subItem as Session;
						if (
							s.flow_session_grade !== undefined &&
							s.flow_session_grade > maxGrade
						) {
							maxGrade = s.flow_session_grade;
						}
					} else {
						findMaxGrades(subItem, contextPath);
					}
				}
			}
			if (maxGrade !== Number.NEGATIVE_INFINITY) {
				localScores.push(maxGrade.toFixed(1));
				localNames.push(contextPath);
			}
		} else if (typeof obj === "object" && obj !== null) {
			for (const [key, value] of Object.entries(obj)) {
				findMaxGrades(value, contextPath ? `${contextPath} > ${key}` : key);
			}
		}
	};

	findMaxGrades(data);
	return { scores: localScores, names: localNames };
};

const lineExtractGrades = (data: ScoreResponse) => {
	const localline_data: { problem: string; date: Date; grade: string }[] = [];

	if (Array.isArray(data)) {
		for (const content of data) {
			if (typeof content === "object" && content !== null) {
				for (const lesson of Object.keys(content)) {
					const exercises = content?.[lesson];
					if (Array.isArray(exercises)) {
						for (const exercise of exercises) {
							if (typeof exercise === "object" && exercise !== null) {
								for (const problem of Object.keys(exercise)) {
									const sessions = exercise?.[problem];
									if (Array.isArray(sessions)) {
										for (const session of sessions) {
											if (
												session?.finish_date_time &&
												typeof session.flow_session_grade === "number"
											) {
												const date = new Date(session.finish_date_time);
												const grade = session.flow_session_grade;
												localline_data.push({
													problem: problem,
													date: date,
													grade: grade.toFixed(1),
												});
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}
	localline_data.sort((a, b) => ascTimeSort(a.date, b.date));
	return localline_data;
};

// CSS変数から色を取得する関数
const getCssVar = (name: string) =>
	typeof window !== "undefined"
		? getComputedStyle(document.documentElement).getPropertyValue(name).trim()
		: "";

type LineChartMeta = { problem: string; date: Date; grade: string };
interface CustomLineDataset extends ChartDataset<"line", (number | null)[]> {
	meta?: LineChartMeta[];
}

const toNumber = (value: unknown) => {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : 0;
	}
	const converted = Number(value);
	return Number.isFinite(converted) ? converted : 0;
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const formatDateShort = (date: Date) =>
	date.toLocaleDateString("ja-JP", {
		month: "2-digit",
		day: "2-digit",
	});

const Page = () => {
	const params = useParams();
	const courseId = String(params?.course_id ?? "");
	const [data, setData] = useState<ScoreResponse>([]);
	const [scores, setScores] = useState<string[]>([]);
	const [names, setNames] = useState<string[]>([]);
	const [lineData, setLineData] = useState<
		{ problem: string; date: Date; grade: string }[]
	>([]);
	const [loading, setLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState("");
	// primary/secondaryカラーをstateで管理
	const [primaryColor, setPrimaryColor] = useState("#1976d2");
	const [secondaryColor, setSecondaryColor] = useState("#ff9800");

	useEffect(() => {
		setPrimaryColor(getCssVar("--primary") || "#1976d2");
		setSecondaryColor(getCssVar("--secondary") || "#ff9800");
	}, []);

	useEffect(() => {
		const getStudentScore = async () => {
			try {
				setLoading(true);
				setErrorMessage("");
				const response = await axios.get<ScoreResponse>(
					`/get_flow_session_student_score/${courseId}`,
				);
				if (response.data) {
					setData(response.data);
					const { scores, names } = extractGrades(response.data);
					setScores(scores);
					setNames(names);
					setLineData(lineExtractGrades(response.data));
				} else {
					setData([]);
					setScores([]);
					setNames([]);
					setLineData([]);
				}
			} catch (error) {
				console.error("Error fetching student score:", error);
				setErrorMessage("成績データの取得に失敗しました");
			} finally {
				setLoading(false);
			}
		};
		if (courseId) {
			getStudentScore();
		}
	}, [courseId]);

	const scoreValues = useMemo(
		() =>
			scores
				.map((value) => Number.parseFloat(value))
				.filter((value) => Number.isFinite(value)),
		[scores],
	);

	const barLabels = useMemo(
		() =>
			names.map((name) => {
				const segments = name
					.split(" > ")
					.map((segment) => segment.trim())
					.filter(Boolean);
				return segments.at(-1) ?? name;
			}),
		[names],
	);

	const bestScore = useMemo(
		() => (scoreValues.length > 0 ? Math.max(...scoreValues) : null),
		[scoreValues],
	);

	const averageScore = useMemo(() => {
		if (scoreValues.length === 0) {
			return null;
		}
		const sum = scoreValues.reduce((acc, value) => acc + value, 0);
		return sum / scoreValues.length;
	}, [scoreValues]);

	const latestAttempt = lineData.at(-1);
	const latestScore = latestAttempt ? Number.parseFloat(latestAttempt.grade) : null;
	const hasBarData = barLabels.length > 0 && scoreValues.length > 0;
	const hasTrendData = lineData.length > 0;

	const chartData = useMemo(
		() => ({
			labels: barLabels,
			datasets: [
				{
					label: "得点率",
					data: scoreValues,
					backgroundColor: scoreValues.map((grade) => {
						if (grade >= 80) return "rgba(14, 165, 233, 0.86)";
						if (grade >= 60) return "rgba(56, 189, 248, 0.68)";
						return "rgba(248, 113, 113, 0.7)";
					}),
					hoverBackgroundColor: scoreValues.map((grade) => {
						if (grade >= 80) return "rgba(2, 132, 199, 0.95)";
						if (grade >= 60) return "rgba(14, 165, 233, 0.82)";
						return "rgba(239, 68, 68, 0.82)";
					}),
					borderColor: "rgba(12, 74, 110, 0.35)",
					borderWidth: 1,
					borderRadius: 8,
					maxBarThickness: 36,
				},
			],
		}),
		[barLabels, scoreValues],
	);

	const chartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		scales: {
			y: {
				min: 0,
				max: 100,
				ticks: {
					callback: (value: string | number) => `${value}%`,
				},
				grid: {
					color: "rgba(148, 163, 184, 0.24)",
				},
			},
			x: {
				ticks: {
					maxRotation: 0,
					autoSkip: true,
				},
				grid: {
					display: false,
				},
			},
		},
		plugins: {
			legend: {
				display: false,
			},
			tooltip: {
				callbacks: {
					title: (items: TooltipItem<"bar">[]) => {
						const item = items[0];
						if (!item) return "";
						return names[item.dataIndex] ?? "";
					},
					label: (context: TooltipItem<"bar">) => {
						return `得点率: ${formatPercent(toNumber(context.raw))}`;
					},
				},
			},
			title: {
				display: true,
				text: "演習問題ごとの得点",
				color: "#0f172a",
				position: "top" as const,
				align: "center" as const,
				font: {
					weight: "bold" as const,
					size: 18,
				},
				padding: 14,
				fullSize: true,
			},
		},
	};

	const lineChartData = useMemo(
		() => ({
			labels: lineData.map((item) => formatDateShort(item.date)),
			datasets: [
				{
					label: "得点率",
					data: lineData.map((item) => Number(item.grade)),
					borderColor: primaryColor,
					backgroundColor: "rgba(56, 189, 248, 0.2)",
					pointBackgroundColor: primaryColor,
					pointBorderColor: secondaryColor,
					pointHoverRadius: 6,
					fill: true,
					meta: lineData,
					pointRadius: 4,
					tension: 0.28,
				} as CustomLineDataset,
			],
		}),
		[lineData, primaryColor, secondaryColor],
	);

	const lineChartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		scales: {
			y: {
				min: 0,
				max: 100,
				ticks: {
					callback: (value: string | number) => `${value}%`,
				},
				grid: {
					color: "rgba(148, 163, 184, 0.24)",
				},
			},
			x: {
				grid: {
					display: false,
				},
			},
		},
		plugins: {
			legend: {
				display: false,
			},
			tooltip: {
				callbacks: {
					label: (context: TooltipItem<"line">) => {
						const dataset = lineChartData.datasets[0] as CustomLineDataset;
						const meta = dataset.meta;
						const problem = meta?.[context.dataIndex]?.problem || "No problem";
						const date = meta?.[context.dataIndex]?.date;
						const dateLabel = date ? formatDateShort(date) : "";
						const grade = toNumber(context.raw);
						return `${problem} (${dateLabel}): ${formatPercent(grade)}`;
					},
				},
			},
			title: {
				display: true,
				text: "演習問題得点率の推移",
				color: "#0f172a",
				position: "top" as const,
				align: "center" as const,
				font: {
					weight: "bold" as const,
					size: 18,
				},
				padding: 14,
				fullSize: true,
			},
		},
	};

	return (
		<>
			<TcAccessTime page="student_coursescore" />
			<div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50/40">
				<main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 sm:px-6">
					<Card className="border-slate-200/80 bg-white/95 shadow-sm">
						<CardHeader className="space-y-2">
							<CardTitle className="flex items-center gap-2 text-2xl text-slate-900">
								<BarChart3 className="h-6 w-6 text-sky-600" />
								成績照会
							</CardTitle>
							<CardDescription className="text-sm text-slate-600">
								演習ごとの得点と推移を見やすく整理して表示します。
							</CardDescription>
						</CardHeader>
						<CardContent className="pt-0">
							<div className="flex flex-wrap items-center gap-2">
								<Badge
									variant="outline"
									className="border-slate-300 bg-white text-slate-700"
								>
									問題数 {scoreValues.length}
								</Badge>
								<Badge
									variant="outline"
									className="border-slate-300 bg-white text-slate-700"
								>
									試行回数 {lineData.length}
								</Badge>
							</div>
						</CardContent>
					</Card>

					{errorMessage ? (
						<Alert variant="destructive" className="mt-5">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{errorMessage}</AlertDescription>
						</Alert>
					) : null}

					{loading ? (
						<Card className="mt-5 border-slate-200">
							<CardContent className="py-12 text-center text-sm text-slate-500">
								成績データを読み込み中です...
							</CardContent>
						</Card>
					) : !hasBarData && !hasTrendData ? (
						<Card className="mt-5 border-slate-200 bg-white/90">
							<CardContent className="py-12 text-center">
								<Target className="mx-auto mb-3 h-10 w-10 text-slate-400" />
								<p className="text-base font-medium text-slate-700">
									成績データがありません
								</p>
								<p className="mt-1 text-sm text-slate-500">
									演習を解くとここに得点の推移が表示されます。
								</p>
							</CardContent>
						</Card>
					) : (
						<div className="mt-5 space-y-5">
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
								<Card className="border-slate-200 bg-white/90">
									<CardHeader className="pb-2">
										<CardDescription className="flex items-center gap-2 text-slate-600">
											<Gauge className="h-4 w-4" />
											最高得点
										</CardDescription>
									</CardHeader>
									<CardContent>
										<p className="text-2xl font-semibold text-slate-900">
											{bestScore !== null ? formatPercent(bestScore) : "-"}
										</p>
									</CardContent>
								</Card>
								<Card className="border-slate-200 bg-white/90">
									<CardHeader className="pb-2">
										<CardDescription className="flex items-center gap-2 text-slate-600">
											<TrendingUp className="h-4 w-4" />
											平均得点
										</CardDescription>
									</CardHeader>
									<CardContent>
										<p className="text-2xl font-semibold text-slate-900">
											{averageScore !== null ? formatPercent(averageScore) : "-"}
										</p>
									</CardContent>
								</Card>
								<Card className="border-slate-200 bg-white/90">
									<CardHeader className="pb-2">
										<CardDescription className="flex items-center gap-2 text-slate-600">
											<BarChart3 className="h-4 w-4" />
											最新得点
										</CardDescription>
									</CardHeader>
									<CardContent>
										<p className="text-2xl font-semibold text-slate-900">
											{latestScore !== null ? formatPercent(latestScore) : "-"}
										</p>
									</CardContent>
								</Card>
								<Card className="border-slate-200 bg-white/90">
									<CardHeader className="pb-2">
										<CardDescription className="flex items-center gap-2 text-slate-600">
											<LineChartIcon className="h-4 w-4" />
											試行回数
										</CardDescription>
									</CardHeader>
									<CardContent>
										<p className="text-2xl font-semibold text-slate-900">
											{lineData.length}
										</p>
									</CardContent>
								</Card>
							</div>

							{hasBarData ? (
								<Card className="border-slate-200 bg-white/95 shadow-sm">
									<CardHeader>
										<CardTitle className="text-lg text-slate-900">
											演習問題ごとの得点
										</CardTitle>
										<CardDescription className="text-slate-600">
											問題ごとの最高得点を比較できます。
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="h-[340px] w-full sm:h-[380px]">
											<Bar data={chartData} options={chartOptions} />
										</div>
									</CardContent>
								</Card>
							) : null}

							{hasTrendData ? (
								<Card className="border-slate-200 bg-white/95 shadow-sm">
									<CardHeader>
										<CardTitle className="text-lg text-slate-900">
											得点率の推移
										</CardTitle>
										<CardDescription className="text-slate-600">
											時系列で得点の変化を確認できます。
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="h-[360px] w-full sm:h-[420px]">
											<Line data={lineChartData} options={lineChartOptions} />
										</div>
									</CardContent>
								</Card>
							) : null}
						</div>
					)}
				</main>
			</div>
		</>
	);
};

export default Page;
