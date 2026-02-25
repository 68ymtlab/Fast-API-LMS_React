"use client";

import {
	BarChart,
	BarChart2,
	Book,
	BookOpen,
	Crown,
	FileText,
	List,
	Loader2,
	Medal,
	Play,
	Star,
	Trophy,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TcAccessTime from "@/components/tc_access_time";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import apiClient from "@/lib/api/apiClient";
import OnboardingDialog from "./onboarding/00_OnboardingDialog";

interface Course {
	id?: number;
	course_id?: number;
	course_name: string;
	subject_name?: string;
	subject?: { subject_name?: string; semester?: { name?: string } };
	period?: string;
}

interface HighPointer {
	student_id: string;
	point: number;
}

interface Subject {
	id: number;
	title: string;
	course: string;
	term: string;
	completedLessons: number;
	totalLessons: number;
}

const StudentHome = () => {
	const router = useRouter();
	const [point, setPoint] = useState("0");
	const [progress, setProgress] = useState(0);
	const [point_list_dialog, setPointListDialog] = useState(false);
	const [ranking_dialog, setRankingDialog] = useState(false);
	const [open_dialog, setOpenDialog] = useState(true);
	const [_highPointers, setHighPointers] = useState<HighPointer[]>([]);
	const [userRank, setUserRank] = useState<number>(0);
	const [loadingButtons, setLoadingButtons] = useState<{
		[key: string]: boolean;
	}>({});
	const [subjects, setSubjects] = useState<Subject[]>([]);
	const [user_stats_dialog, setUserStatsDialog] = useState(false);
	const [username, setUsername] = useState("");

	const pointItems = [
		{
			id: 1,
			title: "ログイン",
			points: 1,
			icon: <BookOpen className="w-5 h-5 text-secondary" />,
		},
		{
			id: 2,
			title: "演習問題を解く",
			points: 10,
			icon: <BookOpen className="w-5 h-5 text-secondary" />,
		},
		{
			id: 3,
			title: "累計10日ログイン",
			points: 10,
			icon: <BookOpen className="w-5 h-5 text-secondary" />,
		},
	];

	const handleButtonClick = async (
		buttonId: string,
		callback: () => Promise<void> | void,
	) => {
		setLoadingButtons((prev) => ({ ...prev, [buttonId]: true }));
		try {
			await callback();
		} finally {
			setTimeout(() => {
				setLoadingButtons((prev) => ({ ...prev, [buttonId]: false }));
			}, 500);
		}
	};

	useEffect(() => {
		apiClient
			.get("/courses/me/enrolled")
			.then((res) => {
				if (res.status === 200) {
					const courses: Course[] = res.data;
					const formattedSubjects: Subject[] = courses
						.filter((c) => (c.id ?? c.course_id) != null)
						.map((course) => ({
							id: (course.id ?? course.course_id) as number,
							title: course.subject?.subject_name ?? course.subject_name ?? "",
							course: course.course_name ?? "",
							term: course.subject?.semester?.name ?? course.period ?? "",
							completedLessons: 0,
							totalLessons: 15,
						}));
					setSubjects(formattedSubjects);
				}
			})
			.catch((error) => {
				console.error("コースの取得に失敗しました:", error);
			});

		apiClient
			.get("/progress/points")
			.then((res) => {
				if (res.status === 200) {
					setPoint(res.data?.toString());
				}
			})
			.catch((error) => {
				console.error("ポイントの取得に失敗しました:", error);
			});

		apiClient
			.get("/users/me")
			.then((res) => {
				if (res.status === 200) {
					setUsername(
						res.data.username ?? res.data.display_name ?? res.data.email ?? "",
					);
				}
			})
			.catch((error) => {
				console.error("ユーザー名の取得に失敗しました:", error);
			});

		// get_progress エンドポイントは現状実装されていないため、0固定
		setProgress(0);
	}, []);

	// username取得後にランキング取得
	useEffect(() => {
		if (!username) return;
		apiClient
			.get("/progress/points/ranking")
			.then((res) => {
				if (res.status === 200) {
					const pointers: HighPointer[] = res.data;
					setHighPointers(pointers);
					const rank = pointers.findIndex((p) => p.student_id === username) + 1;
					setUserRank(rank);
				}
			})
			.catch((error) => {
				console.error("ハイスコアの取得に失敗しました:", error);
			});
	}, [username]);

	return (
		<>
			<TcAccessTime page="student_home" />
			<main>
				<div className="flex flex-col items-start justify-start min-h-screen bg-gray-100 pt-8">
					<div className="container mx-auto px-8 py-8 max-w-7xl">
						{/* 学習科目一覧（メインコンテンツ） */}
						<div>
							<h2 className="text-2xl font-bold mb-6">学習科目一覧</h2>
							<div className="grid grid-cols-2 gap-6">
								{subjects.map((subject) => (
									<Card key={subject.id}>
										<CardHeader>
											<div className="flex items-center gap-4">
												<Book className="w-10 h-10 text-secondary" />
												<div>
													<CardTitle className="text-xl">
														{subject.title}
													</CardTitle>
													<div className="text-sm text-gray-500 mt-2">
														<span className="text-base">{subject.course}</span>
														<span className="mx-2">|</span>
														<span className="text-base">{subject.term}</span>
													</div>
												</div>
											</div>
										</CardHeader>
										<CardFooter className="flex gap-3">
											<Button
												className="flex-1 h-11 text-base font-semibold"
												variant="default"
												onClick={() =>
													handleButtonClick(`course-${subject.id}`, () =>
														router.push(`/course/${subject.id}`),
													)
												}
												disabled={loadingButtons[`course-${subject.id}`]}
											>
												<Play className="w-5 h-5 mr-2" />
												{loadingButtons[`course-${subject.id}`] ? (
													<Loader2 className="w-4 h-4 animate-spin" />
												) : (
													"学習を始める"
												)}
											</Button>
											<Button
												className="flex-1 h-11 text-base font-semibold"
												variant="outline"
												onClick={() =>
													router.push(`/coursescore/${subject.id}`)
												}
											>
												<BarChart className="w-5 h-5 mr-2" />
												学習状況照会
											</Button>
											<Button
												className="flex-1 h-11 text-base font-semibold"
												variant="outline"
												onClick={() =>
													router.push(`/course/${subject.id}/syllabus`)
												}
											>
												<FileText className="w-5 h-5 mr-2" />
												シラバス情報
											</Button>
										</CardFooter>
									</Card>
								))}
							</div>
						</div>
					</div>
				</div>
			</main>

			{/* ポイントリストダイアログ */}
			<Dialog open={point_list_dialog} onOpenChange={setPointListDialog}>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle className="text-xl font-bold flex items-center gap-2">
							<Star className="w-5 h-5 text-secondary" />
							ポイントリスト
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-3">
							{pointItems.map((item) => (
								<div
									key={`point-item-${item.id}`}
									className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-all duration-200"
								>
									<div className="flex items-center gap-3">
										<div className="p-2 bg-secondary/10 rounded-lg ring-1 ring-secondary/20">
											{item.icon}
										</div>
										<div className="flex flex-col">
											<span className="font-medium text-gray-800">{item.title}</span>
											<span className="text-xs text-gray-500">獲得可能なポイント</span>
										</div>
									</div>
									<div className="flex items-center gap-1">
										<span className="text-lg font-bold text-secondary">+{item.points}</span>
										<span className="text-sm text-secondary">pt</span>
									</div>
								</div>
							))}
						</div>
						<div className="pt-4 border-t border-gray-200">
							<div className="flex items-center justify-between p-3 bg-secondary/5 rounded-lg">
								<div className="flex items-center gap-2">
									<Trophy className="w-5 h-5 text-secondary" />
									<span className="font-medium text-gray-800">現在のポイント</span>
								</div>
								<div className="flex items-center gap-1">
									<span className="text-lg font-bold text-secondary">{point}</span>
									<span className="text-sm text-secondary">pt</span>
								</div>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setPointListDialog(false)}>
							閉じる
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ランキングダイアログ */}
			<Dialog open={ranking_dialog} onOpenChange={setRankingDialog}>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle className="text-2xl font-bold flex items-center gap-2">
							<Crown className="w-6 h-6 text-secondary" />
							ポイントランキング
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-6 py-4">
						<div className="flex flex-col items-center gap-4 p-6 bg-secondary/5 rounded-lg">
							<div className="flex items-center gap-3">
								<div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
									<Crown className="w-6 h-6 text-secondary" />
								</div>
								<div className="flex flex-col">
									<div className="text-lg font-medium text-gray-600">あなたの順位</div>
									<div className="text-3xl font-bold text-secondary">#{userRank}</div>
								</div>
							</div>
							<div className="flex items-center gap-3">
								<div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
									<Star className="w-6 h-6 text-secondary" />
								</div>
								<div className="flex flex-col">
									<div className="text-lg font-medium text-gray-600">獲得ポイント</div>
									<div className="text-3xl font-bold text-secondary">{point}pt</div>
								</div>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRankingDialog(false)}>
							閉じる
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* 学習進捗ダイアログ */}
			<Dialog open={user_stats_dialog} onOpenChange={setUserStatsDialog}>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle className="text-2xl font-bold flex items-center gap-2">
							<BarChart2 className="w-6 h-6 text-secondary" />
							学習進捗
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-6 py-4">
						<div className="flex flex-col items-center gap-2 p-4 bg-secondary/5 rounded-lg">
							<div className="flex items-center gap-2">
								<BookOpen className="w-5 h-5 text-secondary" />
								<span className="font-medium text-gray-600">学習進捗率</span>
							</div>
							<div className="w-full h-4 bg-gray-200 rounded-full mt-2">
								<div
									className="h-full rounded-full bg-secondary"
									style={{ width: `${progress}%` }}
								/>
							</div>
							<span className="text-sm font-medium text-secondary">{progress}%</span>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setUserStatsDialog(false)}>
							閉じる
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ポイントリスト・ランキング・学習進捗ボタン（将来的にヘッダーへ移動予定） */}
			<div className="fixed bottom-6 right-6 flex gap-2">
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="h-10 w-10 bg-white shadow-md hover:shadow-lg"
								onClick={() => setPointListDialog(true)}
							>
								<List className="w-5 h-5 text-secondary" />
							</Button>
						</TooltipTrigger>
						<TooltipContent><p>ポイントリスト</p></TooltipContent>
					</Tooltip>
				</TooltipProvider>
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="h-10 w-10 bg-white shadow-md hover:shadow-lg"
								onClick={() => setRankingDialog(true)}
							>
								<Medal className="w-5 h-5 text-secondary" />
							</Button>
						</TooltipTrigger>
						<TooltipContent><p>ポイントランキング</p></TooltipContent>
					</Tooltip>
				</TooltipProvider>
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="h-10 w-10 bg-white shadow-md hover:shadow-lg"
								onClick={() => setUserStatsDialog(true)}
							>
								<BarChart2 className="w-5 h-5 text-secondary" />
							</Button>
						</TooltipTrigger>
						<TooltipContent><p>学習進捗</p></TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>

			<OnboardingDialog
				open_dialog={open_dialog}
				setOpenDialog={setOpenDialog}
			/>
		</>
	);
};

export default StudentHome;
