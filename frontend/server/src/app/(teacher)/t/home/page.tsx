"use client";

import {
	BookOpen,
	Calendar,
	Loader2,
	Megaphone,
	User,
	Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import axios from "@/lib/axios";

type Semester = {
	id: number;
	name: string;
	sort_order: number | null;
};

type Subject = {
	id: number;
	subject_name: string;
	academic_year: number;
	semester_id: number;
	is_active: boolean;
	created_at: string;
	updated_at: string;
	updated_by_user_id: number | null;
	semester: Semester;
};

function TeacherHome() {
	console.log("[TeacherHome] Component rendered");
	const router = useRouter();
	const [duringSubjects, setDuringSubjects] = useState<Subject[]>([]);
	const [outsideSubjects, setOutsideSubjects] = useState<Subject[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [userName, setUserName] = useState<string>("");
	const [loadingButtons, setLoadingButtons] = useState<{
		[key: string]: boolean;
	}>({});

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
		const fetchSubjects = async () => {
			setIsLoading(true);
			setError(null);
			try {
				const response = await axios.get<Subject[]>("/subjects");
				if (response.status === 200) {
					const subjects = response.data;
					// is_active で開講中・過去に分割
					setDuringSubjects(subjects.filter((s) => s.is_active));
					setOutsideSubjects(subjects.filter((s) => !s.is_active));
				} else {
					setError("科目情報の取得に失敗しました");
				}
			} catch (_error) {
				console.error("科目情報の取得に失敗:", _error);
				setError("科目情報の取得に失敗しました");
			} finally {
				setIsLoading(false);
			}
		};

		fetchSubjects();
	}, []);

	return (
		<>
			<main>
				<div className="flex flex-col min-h-screen bg-gray-100">
					<div className="container mx-auto px-8 py-12 max-w-7xl">
						<div className="flex items-center justify-between mb-12">
							<h2 className="text-3xl font-bold text-gray-800">科目一覧</h2>
							<div className="flex items-center gap-3 bg-white/80 px-4 py-2 rounded-xl shadow-sm">
								<ThemeSwitcher />
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => router.push("/t/announcements")}
											>
												<Megaphone className="h-5 w-5 text-primary" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>
											<p>お知らせを作成</p>
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
								<div className="bg-primary/10 p-2 rounded-lg">
									<User className="h-5 w-5 text-primary" />
								</div>
								<div>
									<p className="text-sm font-medium text-gray-800">
										{userName}
									</p>
								</div>
							</div>
						</div>
						{isLoading ? (
							<div className="text-center py-8">読み込み中...</div>
						) : error ? (
							<div className="text-center py-8 text-red-500">{error}</div>
						) : (
							<>
								{duringSubjects.length > 0 && (
									<div className="mb-12">
										<div className="flex items-center gap-3 mb-6">
											<h3 className="text-2xl font-semibold text-gray-800">
												開講中の科目
											</h3>
											<span className="bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full">
												アクティブ
											</span>
										</div>
										<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
											{duringSubjects.map((item) => (
												<Card
													key={item.id}
													className="hover:shadow-2xl transition-all duration-300 rounded-2xl overflow-hidden group shadow-lg hover:shadow-primary/10"
												>
													<CardHeader className="p-4 rounded-t-xl border-b border-primary/10 relative">
														<div className="absolute top-1/2 right-8 -translate-y-1/2 opacity-10 text-secondary/50 transform scale-[2.5] pointer-events-none">
															<BookOpen className="w-10 h-10" />
														</div>
														<div className="flex items-start justify-between">
															<div className="pl-2">
																<p className="text-xs text-gray-500 mb-0.5">
																	科目名
																</p>
																<h3 className="text-xl font-semibold text-gray-800">
																	{item.subject_name}
																</h3>
															</div>
														</div>
													</CardHeader>
													<CardContent className="p-4 space-y-3">
														<div className="flex items-center gap-3 bg-white/80 rounded-xl p-3 shadow-inner">
															<Calendar className="text-primary w-4 h-4" />
															<span className="text-sm text-neutral-700 font-medium">
																開講年: {item.academic_year}年
															</span>
														</div>
														<div className="flex items-center gap-3 bg-white/80 rounded-xl p-3 shadow-inner">
															<BookOpen className="text-primary w-4 h-4" />
															<span className="text-sm text-neutral-700 font-medium">
																学期: {item.semester.name}
															</span>
														</div>
													</CardContent>
													<CardFooter className="p-4 pt-0">
														<Button
															onClick={() =>
																handleButtonClick(`course-${item.id}`, () =>
																	router.push(`/t/subject/${item.id}`),
																)
															}
															className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-medium py-2 rounded-xl transition-all text-sm relative"
															disabled={loadingButtons[`course-${item.id}`]}
														>
															{loadingButtons[`course-${item.id}`] ? (
																<Loader2 className="w-4 h-4 animate-spin" />
															) : (
																"コース情報"
															)}
														</Button>
													</CardFooter>
												</Card>
											))}
										</div>
									</div>
								)}
								{outsideSubjects.length > 0 && (
									<div>
										<div className="flex items-center gap-3 mb-6">
											<h3 className="text-2xl font-semibold text-gray-800">
												過去の科目
											</h3>
											<span className="bg-gray-100 text-gray-800 text-sm font-medium px-3 py-1 rounded-full">
												終了
											</span>
										</div>
										<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
											{outsideSubjects.map((item) => (
												<Card
													key={item.id}
													className="hover:shadow-2xl transition-all duration-300 rounded-2xl overflow-hidden group shadow-lg hover:shadow-primary/10"
												>
													<CardHeader className="p-4 rounded-t-xl border-b border-primary/10 relative">
														<div className="absolute top-1/2 right-8 -translate-y-1/2 opacity-10 text-secondary/50 transform scale-[2.5] pointer-events-none">
															<BookOpen className="w-10 h-10" />
														</div>
														<div className="flex items-start justify-between">
															<div className="pl-2">
																<p className="text-xs text-gray-500 mb-0.5">
																	科目名
																</p>
																<h3 className="text-xl font-semibold text-gray-800">
																	{item.subject_name}
																</h3>
															</div>
														</div>
													</CardHeader>
													<CardContent className="p-4 space-y-3">
														<div className="flex items-center gap-3 bg-white/80 rounded-xl p-3 shadow-inner">
															<Calendar className="text-primary w-4 h-4" />
															<span className="text-sm text-neutral-700 font-medium">
																開講年: {item.academic_year}年
															</span>
														</div>
														<div className="flex items-center gap-3 bg-white/80 rounded-xl p-3 shadow-inner">
															<BookOpen className="text-primary w-4 h-4" />
															<span className="text-sm text-neutral-700 font-medium">
																学期: {item.semester.name}
															</span>
														</div>
													</CardContent>
													<CardFooter className="p-4 pt-0">
														<Button
															onClick={() =>
																handleButtonClick(`course-${item.id}`, () =>
																	router.push(`/t/subject/${item.id}`),
																)
															}
															className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-medium py-2 rounded-xl transition-all text-sm relative"
															disabled={loadingButtons[`course-${item.id}`]}
														>
															{loadingButtons[`course-${item.id}`] ? (
																<Loader2 className="w-4 h-4 animate-spin" />
															) : (
																"コース情報"
															)}
														</Button>
													</CardFooter>
												</Card>
											))}
										</div>
									</div>
								)}
							</>
						)}
					</div>
				</div>
			</main>
		</>
	);
}

export default TeacherHome;
