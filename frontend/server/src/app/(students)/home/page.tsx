"use client";

import {
	ArrowRight,
	BarChart,
	BookOpen,
	BookText,
	Loader2,
	Play,
	Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import TcAccessTime from "@/components/tc_access_time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import apiClient from "@/lib/api/apiClient";
import OnboardingDialog from "./onboarding/00_OnboardingDialog";

interface CourseApi {
	id?: number;
	course_id?: number;
	course_name?: string;
	subject_name?: string;
	subject?: { subject_name?: string; semester?: { name?: string } };
	period?: string;
}

interface SubjectCard {
	id: number;
	title: string;
	course: string;
	term: string;
}

interface UserMeResponse {
	id?: number | string;
	username?: string;
	display_name?: string;
	email?: string;
}

interface StudentResumeSnapshot {
	courseId: number;
	lessonItemId: number;
	page: number;
	href: string;
	savedAt: string;
}

const STUDENT_RESUME_KEY = "student-last-learning-v1";
const RESUME_EXPIRY_DAYS = 30;

const StudentHome = () => {
	const router = useRouter();
	const [openDialog, setOpenDialog] = useState(false);
	const [onboardingStorageKey, setOnboardingStorageKey] = useState<string | null>(
		null,
	);
	const [loadingButtons, setLoadingButtons] = useState<{
		[key: string]: boolean;
	}>({});
	const [subjects, setSubjects] = useState<SubjectCard[]>([]);
	const [username, setUsername] = useState("");
	const [isCoursesLoading, setIsCoursesLoading] = useState(true);
	const [resumeSnapshot, setResumeSnapshot] =
		useState<StudentResumeSnapshot | null>(null);
	const [greetingMessage, setGreetingMessage] = useState("こんにちは");

	const firstSubject = subjects[0];
	const resumeCourse = useMemo(
		() =>
			resumeSnapshot
				? subjects.find((subject) => subject.id === resumeSnapshot.courseId) ?? null
				: null,
		[resumeSnapshot, subjects],
	);
	const resumeFeedback = useMemo(() => {
		if (!resumeSnapshot) {
			return "続きの履歴がないため、先頭科目から開始します。";
		}

		const subjectTitle = resumeCourse?.title ?? "科目不明";
		return `前回は「${subjectTitle}」の第${resumeSnapshot.lessonItemId}回・${resumeSnapshot.page}ページ目まで学習しました。`;
	}, [resumeCourse, resumeSnapshot]);
	const canResumeLearning = Boolean(resumeSnapshot?.href || firstSubject);
	const resumeButtonClassName =
		"h-10 px-4 text-sm font-semibold text-white shadow-sm bg-blue-700 hover:bg-blue-800";

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
		const hour = new Date().getHours();
		if (hour < 12) {
			setGreetingMessage("おはようございます");
			return;
		}
		if (hour < 18) {
			setGreetingMessage("こんにちは");
			return;
		}
		setGreetingMessage("こんばんは");
	}, []);

	useEffect(() => {
		let active = true;

		const fetchInitialData = async () => {
			setIsCoursesLoading(true);

			const [coursesResult, userResult] =
				await Promise.allSettled([
					apiClient.get<CourseApi[]>("/courses/me/enrolled"),
					apiClient.get<UserMeResponse>("/users/me"),
				]);

			if (!active) return;

			if (coursesResult.status === "fulfilled" && coursesResult.value.status === 200) {
				const courses = coursesResult.value.data;
				const formattedSubjects: SubjectCard[] = courses
					.filter((course) => (course.id ?? course.course_id) != null)
					.map((course) => ({
						id: (course.id ?? course.course_id) as number,
						title: course.subject?.subject_name ?? course.subject_name ?? "科目",
						course: course.course_name ?? "コース未設定",
						term: course.subject?.semester?.name ?? course.period ?? "",
					}));
				setSubjects(formattedSubjects);
			} else {
				console.error("コースの取得に失敗しました:", coursesResult);
				setSubjects([]);
			}

			if (userResult.status === "fulfilled" && userResult.value.status === 200) {
				const user = userResult.value.data;
				setUsername(user.display_name ?? user.username ?? user.email ?? "");

				const onboardingId = user.id ?? user.username ?? user.email;
				if (onboardingId != null) {
					const key = `student_onboarding_seen_${onboardingId}`;
					setOnboardingStorageKey(key);

					if (typeof window !== "undefined") {
						const hasSeenOnboarding = window.localStorage.getItem(key) === "1";
						if (!hasSeenOnboarding) {
							setOpenDialog(true);
						}
					}
				}
			} else {
				console.error("ユーザー情報の取得に失敗しました:", userResult);
			}

			setIsCoursesLoading(false);
		};

		fetchInitialData();

		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		if (typeof window === "undefined" || isCoursesLoading) return;
		if (subjects.length === 0) {
			setResumeSnapshot(null);
			return;
		}

		const rawSnapshot = window.localStorage.getItem(STUDENT_RESUME_KEY);
		if (!rawSnapshot) {
			setResumeSnapshot(null);
			return;
		}

		try {
			const parsed = JSON.parse(rawSnapshot) as Partial<StudentResumeSnapshot>;
			const courseId = Number(parsed.courseId);
			const lessonItemId = Number(parsed.lessonItemId);
			const pageNumber = Number(parsed.page);
			const savedAt = new Date(parsed.savedAt ?? "");
			const isExpired =
				Number.isNaN(savedAt.getTime()) ||
				Date.now() - savedAt.getTime() >
					RESUME_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

			if (
				Number.isNaN(courseId) ||
				Number.isNaN(lessonItemId) ||
				Number.isNaN(pageNumber) ||
				courseId <= 0 ||
				lessonItemId <= 0 ||
				pageNumber <= 0 ||
				isExpired
			) {
				window.localStorage.removeItem(STUDENT_RESUME_KEY);
				setResumeSnapshot(null);
				return;
			}

			const hasEnrolledCourse = subjects.some((subject) => subject.id === courseId);
			if (!hasEnrolledCourse) {
				setResumeSnapshot(null);
				return;
			}

			setResumeSnapshot({
				courseId,
				lessonItemId,
				page: pageNumber,
				href: `/lesson/${courseId}/${lessonItemId}/${pageNumber}`,
				savedAt: savedAt.toISOString(),
			});
		} catch (error) {
			console.error("続きから学ぶ情報の読み込みに失敗しました:", error);
			setResumeSnapshot(null);
		}
	}, [isCoursesLoading, subjects]);

	const handleOnboardingOpenChange = (open: boolean) => {
		setOpenDialog(open);
		if (!open && onboardingStorageKey && typeof window !== "undefined") {
			window.localStorage.setItem(onboardingStorageKey, "1");
		}
	};

	return (
		<>
			<TcAccessTime page="student_home" />
			<main className="min-h-screen bg-slate-100 pb-12 pt-16">
				<div className="mx-auto w-full max-w-7xl space-y-4 px-4 sm:px-6 lg:px-8">
					<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm animate-in fade-in-0 duration-400">
						<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
							<div className="min-w-0">
								<p className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
									<Sparkles className="h-3.5 w-3.5 text-sky-600" />
									学習の再開
								</p>
								<p className="mt-1 text-sm font-semibold text-slate-800">
									{greetingMessage}
									{username ? `、${username}さん` : ""}
								</p>
								<p className="mt-1 text-xs text-slate-500 sm:text-sm">
									{resumeFeedback}
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Button
									className={resumeButtonClassName}
									onClick={() =>
										handleButtonClick("resume-learning", () => {
											if (resumeSnapshot?.href) {
												router.push(resumeSnapshot.href);
												return;
											}
											if (firstSubject) {
												router.push(`/course/${firstSubject.id}`);
											}
										})
									}
									disabled={!canResumeLearning || loadingButtons["resume-learning"]}
								>
									<Play className="h-4 w-4" />
									{loadingButtons["resume-learning"] ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										resumeSnapshot ? "続きから学ぶ" : "学習を始める"
									)}
									<ArrowRight className="h-4 w-4" />
								</Button>
							</div>
						</div>
					</section>

					<section className="space-y-4">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
							<div>
								<h2 className="text-xl font-semibold text-slate-800 sm:text-2xl">学習科目</h2>
								<p className="text-sm text-slate-600">
									学習開始・進捗確認・シラバス確認ができます。
								</p>
							</div>
						</div>

						{isCoursesLoading ? (
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4">
								{Array.from({ length: 4 }).map((_, index) => (
									<Card
										key={`subject-skeleton-${index + 1}`}
										className="w-full border-slate-200/80 bg-white/80 md:max-w-[520px] md:justify-self-center"
									>
										<CardHeader className="space-y-2 pt-4">
											<div className="h-7 w-28 animate-pulse rounded bg-slate-200" />
											<div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
											<div className="h-5 w-3/4 animate-pulse rounded bg-slate-200" />
										</CardHeader>
										<CardFooter className="flex justify-end pt-1">
											<div className="h-9 w-32 animate-pulse rounded bg-slate-200" />
										</CardFooter>
									</Card>
								))}
							</div>
						) : subjects.length === 0 ? (
							<Card className="border-dashed border-slate-300 bg-white/80">
								<CardContent className="flex flex-col items-center gap-3 py-14 text-center">
									<BookText className="h-8 w-8 text-slate-400" />
									<h3 className="text-lg font-semibold text-slate-700">
										受講中の科目が見つかりません
									</h3>
									<p className="max-w-md text-sm text-slate-500">
										科目が追加されると、ここからすぐに学習を始められます。しばらく待ってから再読み込みしてください。
									</p>
									<Button
										variant="outline"
										onClick={() => router.refresh()}
										className="mt-2"
									>
										再読み込み
									</Button>
								</CardContent>
							</Card>
						) : (
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4">
								{subjects.map((subject, index) => (
									<Card
										key={subject.id}
										className="group relative w-full overflow-hidden border-slate-200/90 bg-gradient-to-br from-white to-slate-50/70 shadow-sm ring-1 ring-white/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)] animate-in fade-in-0 slide-in-from-bottom-2 md:max-w-[520px] md:justify-self-center"
										style={{ animationDelay: `${index * 70}ms` }}
									>
										<div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-sky-100/60 blur-xl" />
										<CardHeader className="space-y-1.5 pt-4 pb-2">
											<div className="flex items-start justify-between gap-3">
												<div className="flex min-w-0 items-center gap-3">
													<div className="rounded-xl bg-gradient-to-br from-sky-100 to-cyan-50 p-2 text-sky-700 ring-1 ring-sky-200/70">
														<BookOpen className="h-5 w-5" />
													</div>
													<div className="min-w-0">
														<CardTitle className="truncate text-base text-slate-800">
															{subject.title}
														</CardTitle>
														<CardDescription className="mt-1 truncate text-sm text-slate-500">
															{subject.course}
														</CardDescription>
													</div>
												</div>
												{subject.term ? (
													<span className="inline-flex h-6 items-center rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600">
														{subject.term}
													</span>
												) : null}
											</div>
										</CardHeader>
										<CardFooter className="flex items-end justify-between gap-2 pt-1">
											<div className="flex items-center gap-1.5">
												<Button
													type="button"
													variant="outline"
													className="h-8 rounded-md px-2.5 text-xs text-slate-600"
													onClick={() => router.push(`/coursescore/${subject.id}`)}
												>
													<BarChart className="h-3.5 w-3.5" />
													成績照会
												</Button>
												<Button
													type="button"
													variant="outline"
													className="h-8 rounded-md px-2.5 text-xs text-slate-600"
													onClick={() => router.push(`/course/${subject.id}/syllabus`)}
												>
													<BookText className="h-3.5 w-3.5" />
													シラバス照会
												</Button>
											</div>
											<Button
												className="h-9 rounded-lg px-3.5 text-sm font-semibold shadow-sm bg-sky-600 text-white hover:bg-sky-700"
												onClick={() =>
													handleButtonClick(`course-${subject.id}`, () =>
														router.push(`/course/${subject.id}`),
													)
												}
												disabled={loadingButtons[`course-${subject.id}`]}
											>
												<Play className="h-4 w-4" />
												{loadingButtons[`course-${subject.id}`] ? (
													<Loader2 className="h-4 w-4 animate-spin" />
												) : (
													"学習を始める"
												)}
											</Button>
										</CardFooter>
									</Card>
								))}
							</div>
						)}
					</section>
				</div>
			</main>

			<OnboardingDialog
				open_dialog={openDialog}
				setOpenDialog={handleOnboardingOpenChange}
			/>
		</>
	);
};

export default StudentHome;
