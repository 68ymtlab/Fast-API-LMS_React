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
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import TcAccessTime from "@/components/tc_access_time";
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

const Page = () => {
	const params = useParams();
	const course_id = params?.course_id;
	const [data, setData] = useState<ScoreResponse>([]);
	const [scores, setScores] = useState<string[]>([]);
	const [names, setNames] = useState<string[]>([]);
	const [lineData, setLineData] = useState<
		{ problem: string; date: Date; grade: string }[]
	>([]);
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
				const response = await axios.get<ScoreResponse>(
					`/get_flow_session_student_score/${course_id}`,
				);
				if (response.data) {
					setData(response.data);
					const { scores, names } = extractGrades(response.data);
					setScores(scores);
					setNames(names);
					setLineData(lineExtractGrades(response.data));
				}
			} catch (error) {
				console.error("Error fetching student score:", error);
			}
		};
		if (course_id) getStudentScore();
	}, [course_id]);

	const chartData = useMemo(
		() => ({
			labels: names,
			datasets: [
				{
					label: "得点率",
					data: scores,
					backgroundColor: [primaryColor],
					hoverBackgroundColor: [secondaryColor],
					borderColor: [primaryColor],
				},
			],
		}),
		[names, scores, primaryColor, secondaryColor],
	);

	const chartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		scales: {
			y: {
				suggestedMin: 0,
				suggestedMax: 100,
			},
		},
		plugins: {
			title: {
				display: true,
				text: "演習問題ごとの得点",
				color: "black",
				position: "top" as const,
				align: "center" as const,
				font: {
					weight: "bold" as const,
					size: 25,
				},
				padding: 8,
				fullSize: true,
			},
		},
	};

	const lineChartData = useMemo(
		() => ({
			labels: lineData.map((item) => item.date.toISOString().substring(0, 10)),
			datasets: [
				{
					label: "得点率",
					data: lineData.map((item) => Number(item.grade)),
					borderColor: [primaryColor],
					backgroundColor: [secondaryColor],
					pointBackgroundColor: [primaryColor],
					pointBorderColor: [secondaryColor],
					fill: false,
					meta: lineData,
					pointRadius: 4,
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
				suggestedMin: 0,
				suggestedMax: 100,
			},
		},
		plugins: {
			tooltip: {
				callbacks: {
					label: (context: TooltipItem<"line">) => {
						const dataset = lineChartData.datasets[0] as CustomLineDataset;
						const meta = dataset.meta;
						const problem = meta?.[context.dataIndex]?.problem || "No problem";
						const grade = context.raw || "0";
						return `${problem}: ${grade}%`;
					},
				},
			},
			title: {
				display: true,
				text: "演習問題得点率の推移",
				color: "black",
				position: "top" as const,
				align: "center" as const,
				font: {
					weight: "bold" as const,
					size: 25,
				},
				padding: 8,
				fullSize: true,
			},
		},
	};

	return (
		<>
			<TcAccessTime page="student_coursescore" />
			<div
				style={{
					width: "100%",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					margin: "32px 0 0 0",
					padding: "0 16px",
				}}
			>
				<div style={{ textAlign: "center", marginBottom: 40 }}>
					<h1
						style={{
							fontSize: "2.8rem",
							fontWeight: 800,
							color: primaryColor,
							letterSpacing: "0.08em",
							margin: 0,
							textShadow: "0 2px 16px rgba(0,0,0,0.08)",
							lineHeight: 1.15,
						}}
					>
						学生スコア表示
					</h1>
					<div
						style={{
							color: secondaryColor,
							fontSize: "1.15rem",
							marginTop: 12,
							fontWeight: 500,
							letterSpacing: "0.03em",
							textShadow: "0 1px 6px rgba(0,0,0,0.06)",
						}}
					>
						あなたの演習問題ごとの得点と推移をグラフで確認できます
					</div>
				</div>
				<div
					className="bar"
					style={{
						width: "100%",
						maxWidth: 1000,
						margin: "20px auto 0 auto",
						padding: 24,
						borderRadius: 18,
						backgroundColor: "#f9f9f9",
						boxShadow: "0 6px 24px rgba(0,0,0,0.10)",
						display: "flex",
						justifyContent: "center",
						height: "420px",
						marginBottom: 40,
					}}
				>
					<div style={{ width: "100%", maxWidth: 1000 }}>
						<Bar data={chartData} options={chartOptions} height={350} />
					</div>
				</div>
				<div
					className="line"
					style={{
						width: "100%",
						maxWidth: 1000,
						margin: "30px auto 0 auto",
						padding: 24,
						borderRadius: 18,
						backgroundColor: "#f9f9f9",
						boxShadow: "0 6px 24px rgba(0,0,0,0.10)",
						display: "flex",
						justifyContent: "center",
						height: "500px",
						marginBottom: 40,
					}}
				>
					<div style={{ width: "100%", maxWidth: 1000 }}>
						<Line
							data={lineChartData}
							options={lineChartOptions}
							height={400}
						/>
					</div>
				</div>
			</div>
		</>
	);
};

export default Page;
