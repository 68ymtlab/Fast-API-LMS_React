"use client";
import { FileText, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import TcAccessTime from "@/components/tc_access_time";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import axios from "@/lib/axios";

interface UserInfo {
	id: number;
	name: string;
	email: string;
	username: string;
	kind_name: string;
}

interface Course {
	course_id: number;
	subject_name: string;
	course_name: string;
	period: string;
	course_description?: string;
	year: string;
	semester: string;
	subject_category_name?: string | null;
}

// バックエンドのLessonスキーマに合わせて修正
interface Lesson {
	id: number; // week_id -> id
	title: string; // week_name -> title
	lesson_number: number; // week_num -> lesson_number
	display_order: number; // order -> display_order
}

interface LessonItem {
    id: number;
    lesson_id: number;
    title: string;
    display_order: number;
}

interface Content {
	content_id: number;
	content_name: string;
	lesson_id: number; // week_id -> lesson_id
	order: number;
}

// カスタムスイッチコンポーネント
const CustomSwitch = ({
	checked,
	onCheckedChange,
}: {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) => (
	<label className="relative inline-flex items-center cursor-pointer">
		<input
			type="checkbox"
			checked={checked}
			onChange={(e) => onCheckedChange(e.target.checked)}
			className="sr-only"
		/>
		<div
			className={`w-11 h-6 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-gray-300"}`}
		>
			<div
				className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
					checked ? "translate-x-5" : "translate-x-0"
				} mt-0.5 ml-0.5`}
			/>
		</div>
	</label>
);

// レッスン選択カードコンポーネント
const LessonSelectCard = ({
	lesson,
	contents,
	onMoveLesson,
	onMoveFlow,
	loadingState,
	setLoadingState,
}: {
	lesson: Lesson;
	contents: Content[];
	onMoveLesson: (id: number, isContentId?: boolean) => void;
	onMoveFlow: (lessonId: number) => void;
	loadingState: { [key: string]: boolean };
	setLoadingState: React.Dispatch<
		React.SetStateAction<{ [key: string]: boolean }>
	>;
}) => (
	<Card className="h-full">
		<CardContent className="p-6">
			<h3 className="text-lg font-semibold mb-2">第{lesson.lesson_number}回</h3>
			<p className="text-gray-600 mb-4 text-sm">{lesson.title}</p>


			<div className="flex space-x-2 mt-4">
				<Button
					variant="default"
					className="flex-1"
					disabled={loadingState[`lesson-${lesson.id}`]}
					onClick={async () => {
						setLoadingState((prev) => ({
							...prev,
							[`lesson-${lesson.id}`]: true,
						}));
						try {
							await onMoveLesson(lesson.id);
						} finally {
							setLoadingState((prev) => ({
								...prev,
								[`lesson-${lesson.id}`]: false,
							}));
						}
					}}
				>
					{loadingState[`lesson-${lesson.id}`] ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : (
						"学習を始める"
					)}
				</Button>
				<Button
					variant="default"
					className="flex-1"
					disabled={loadingState[`flow-${lesson.id}`]}
					onClick={async () => {
						setLoadingState((prev) => ({
							...prev,
							[`flow-${lesson.id}`]: true,
						}));
						try {
							await onMoveFlow(lesson.id);
						} finally {
							setLoadingState((prev) => ({
								...prev,
								[`flow-${lesson.id}`]: false,
							}));
						}
					}}
				>
					{loadingState[`flow-${lesson.id}`] ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : (
						"演習問題"
					)}
				</Button>
			</div>
		</CardContent>
	</Card>
);

// レッスン選択テーブルコンポーネント
const LessonSelectTable = ({
	groupedLessons,
	contentsMap,
	expandedLessonNumbers,
	onToggleLessonNumber,
	onMoveLesson,
	onMoveFlow,
	loadingState,
	setLoadingState,
}: {
	groupedLessons: { [key: number]: Lesson[] };
	contentsMap: { [lessonId: number]: Content[] };
	expandedLessonNumbers: Set<number>;
	onToggleLessonNumber: (lessonNum: number) => void;
	onMoveLesson: (id: number, isContentId?: boolean) => void;
	onMoveFlow: (lessonId: number) => void;
	loadingState: { [key: string]: boolean };
	setLoadingState: React.Dispatch<
		React.SetStateAction<{ [key: string]: boolean }>
	>;
}) => (
	<div className="bg-white rounded-lg shadow-sm border">
		<div className="overflow-x-auto">
			<table className="w-full table-layout-fixed">
				<colgroup>
					<col className="w-1/5" />
					<col className="w-2/5" />
					<col className="w-1/5" />
					<col className="w-1/5" />
				</colgroup>
				<thead className="bg-gray-50">
					<tr>
						<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							回
						</th>
						<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							内容
						</th>
						<th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
							教科書コンテンツ
						</th>
						<th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
							演習問題
						</th>
					</tr>
				</thead>
				<tbody className="bg-white divide-y divide-gray-200">
					{Object.entries(groupedLessons)
						.sort(
							([numA], [numB]) => Number.parseInt(numA) - Number.parseInt(numB),
						)
						.map(([lessonNumStr, lessonsInGroup]) => {
							const lessonNum = Number.parseInt(lessonNumStr);
							const isGroupExpanded = expandedLessonNumbers.has(lessonNum);

							return (
								<React.Fragment key={`group-${lessonNum}`}>
									{/* "第N回" ヘッダー行 */}
									<tr className="bg-gray-100">
										<td className="p-0" colSpan={4}>
											<button
												type="button"
												onClick={() => onToggleLessonNumber(lessonNum)}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														onToggleLessonNumber(lessonNum);
													}
												}}
												className="w-full flex items-center space-x-2 px-6 py-4 text-left text-sm font-semibold text-gray-800 whitespace-nowrap hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 cursor-pointer"
											>
												<svg
													className={`w-5 h-5 transition-transform transform ${isGroupExpanded ? "rotate-90" : ""}`}
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
													xmlns="http://www.w3.org/2000/svg"
													aria-hidden="true"
												>
													<title>開閉アイコン</title>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth="2"
														d="M9 5l7 7-7 7"
													/>
												</svg>
												<span>第{lessonNum}回</span>
											</button>
										</td>
									</tr>

									{/* この "第N回" に属するレッスンのリスト */}
									{isGroupExpanded &&
										lessonsInGroup.map((lesson) => {
											const individualContents =
												contentsMap[lesson.id] || [];
											individualContents.sort((a, b) => a.order - b.order);

											return (
												<React.Fragment key={lesson.id}>
													{/* レッスンの名前と演習問題 */}
													<tr className="border-t bg-slate-50 hover:bg-slate-100">
														<td className="pl-10 pr-6 py-3 text-sm text-gray-500">
															{/* 1列目はインデントとして機能 */}
														</td>
														<td className="px-6 py-3 text-base font-medium text-gray-700">
															{lesson.title}
														</td>
														<td className="px-6 py-3 text-center text-sm">
															{" "}
															{/* 学習を始めるボタン用のセル */}
															<Button
																variant="default"
																size="sm"
																disabled={loadingState[`lesson-${lesson.id}`]}
																onClick={async (e) => {
																	e.stopPropagation();
																	setLoadingState((prev) => ({
																		...prev,
																		[`lesson-${lesson.id}`]: true,
																	}));
																	try {
																		await onMoveLesson(lesson.id);
																	} finally {
																		setLoadingState((prev) => ({
																			...prev,
																			[`lesson-${lesson.id}`]: false,
																		}));
																	}
																}}
															>
																{loadingState[`lesson-${lesson.id}`] ? (
																	<Loader2 className="w-4 h-4 animate-spin" />
																) : (
																	"学習を始める"
																)}
															</Button>
														</td>
														<td className="px-6 py-3 text-center text-sm">
															<Button
																variant="outline"
																size="sm"
																disabled={loadingState[`flow-${lesson.id}`]}
																onClick={async (e) => {
																	e.stopPropagation();
																	setLoadingState((prev) => ({
																		...prev,
																		[`flow-${lesson.id}`]: true,
																	}));
																	try {
																		await onMoveFlow(lesson.id);
																	} finally {
																		setLoadingState((prev) => ({
																			...prev,
																			[`flow-${lesson.id}`]: false,
																		}));
																	}
																}}
															>
																{loadingState[`flow-${lesson.id}`] ? (
																	<Loader2 className="w-4 h-4 animate-spin" />
																) : (
																	"演習問題"
																)}
															</Button>
														</td>
													</tr>

												</React.Fragment>
											);
										})}
								</React.Fragment>
							);
						})}
				</tbody>
			</table>
		</div>
	</div>
);

const CoursePage = () => {
	const params = useParams();
	const router = useRouter();
	const course_id = params.course_id as string;

	const [_userInfo, setUserInfo] = useState<UserInfo | null>(null);
	const [sessionError, setSessionError] = useState(false);
	const [course, setCourse] = useState<Course | null>(null);
	const [lessons, setLessons] = useState<Lesson[]>([]); // weeks -> lessons
	const [contents, setContents] = useState<Content[]>([]);
	const [loading, setLoading] = useState(true);
	const [isCardView, setIsCardView] = useState(false);

	const [groupedLessonsByNum, setGroupedLessonsByNum] = useState<{ // groupedWeeksByNum -> groupedLessonsByNum
		[key: number]: Lesson[];
	}>({});
	const [expandedLessonNumbers, setExpandedLessonNumbers] = useState<Set<number>>( // expandedWeekNumbers -> expandedLessonNumbers
		new Set(),
	);
	const [loadingState, setLoadingState] = useState<{ [key: string]: boolean }>(
		{},
	);

	// レッスンごとのコンテンツマップを作成
	const contentsMap = contents.reduce(
		(acc, content) => {
			if (!acc[content.lesson_id]) { // week_id -> lesson_id
				acc[content.lesson_id] = []; // week_id -> lesson_id
			}
			acc[content.lesson_id].push(content); // week_id -> lesson_id
			return acc;
		},
		{} as { [lessonId: number]: Content[] }, // weekId -> lessonId
	);

	useEffect(() => {
		if (!course_id) {
			setLoading(false);
			return;
		}

		const homeProfile = () => {
			axios
				.get("/home_profile")
				.then((response) => {
					setUserInfo(response.data);
				})
				.catch((error) => {
					if (error.response?.status === 401) {
						setSessionError(true);
					} else {
					}
				});
		};

		const getCourseInfo = async () => {
			try {
				const response = await axios.get(`/courses/${course_id}`, {
					withCredentials: true,
				});
				const baseCourse = response.data as any;

				// デフォルトは null（＝バッジ非表示）。マスタから取れれば上書き。
				let subjectCategoryName: string | null = null;
				const subjectId: number | undefined =
					baseCourse.subject?.id ?? baseCourse.subject_id;

				if (subjectId) {
					try {
						// シラバスから科目区分IDを取得
						const syllabusRes = await axios.get(
							`/subjects/${subjectId}/syllabus`,
							{ withCredentials: true },
						);
						const subjectCategoryId: number | undefined =
							syllabusRes.data?.subject_category_id;

						if (subjectCategoryId) {
							// マスタ一覧から名称を解決
							const catRes = await axios.get("/subject-categories", {
								withCredentials: true,
							});
							const categories = catRes.data as Array<{
								id: number;
								name: string;
							}>;
							const hit = categories.find((c) => c.id === subjectCategoryId);
							if (hit) {
								subjectCategoryName = hit.name;
							}
						}
					} catch (e: any) {
						// 404 (シラバスなし) やマスタ未設定などは、そのまま非表示（null）のままにする
						if (e?.response?.status !== 404) {
							console.warn("科目区分名の取得に失敗しました:", e);
						}
					}
				}

				setCourse({
					...(baseCourse as Course),
					subject_category_name: subjectCategoryName,
				});
			} catch (error) {
				console.error("コース情報の取得に失敗しました:", error);
			}
		};

		const getLessonsApi = () => { // getWeeksApi -> getLessonsApi
			axios
				.get(`/courses/${course_id}/lessons`)
				.then((response) => {
					setLessons(response.data); // setWeeks -> setLessons
				})
				.catch((error) => {
					console.error("レッスン一覧の取得に失敗しました:", error); // 週 -> レッスン
				});
		};

		const getCourseContents = () => {
			axios
				.get(`/courses/${course_id}/lesson-items`)
				.then((response) => {
					const lessonItemsByLessonId: { [key: number]: LessonItem[] } =
						response.data;
					const allLessonItems: Content[] = Object.values(lessonItemsByLessonId)
						.flat()
						.map((item) => ({
							content_id: item.id,
							content_name: item.title,
							lesson_id: item.lesson_id,
							order: item.display_order,
						}));
					setContents(allLessonItems);
				})
				.catch((error) => {
					console.error("コンテンツ一覧の取得に失敗しました:", error);
				})
				.finally(() => {
					setLoading(false);
				});
		};

		getCourseInfo();
		getLessonsApi(); // getWeeksApi -> getLessonsApi
		getCourseContents();
	}, [course_id]);

	// `lessons` が更新されたら `lesson_number` でグループ化する
	useEffect(() => {
		if (lessons.length > 0) { // weeks -> lessons
			const groups = lessons.reduce( // weeks -> lessons
				(acc, lesson) => { // week -> lesson
					const key = lesson.lesson_number; // week.week_num -> lesson.lesson_number
					if (!acc[key]) {
						acc[key] = [];
					}
					acc[key].push(lesson); // week -> lesson
					return acc;
				},
				{} as { [key: number]: Lesson[] }, // Week -> Lesson
			);

			// 各グループ内のレッスンを `display_order` プロパティでソート
			for (const numKey in groups) {
				groups[numKey].sort((a, b) => a.display_order - b.display_order); // order -> display_order
			}
			setGroupedLessonsByNum(groups); // setGroupedWeeksByNum -> setGroupedLessonsByNum
		} else {
			setGroupedLessonsByNum({}); // setGroupedWeeksByNum -> setGroupedLessonsByNum
		}
	}, [lessons]); // weeks -> lessons

	const handleToggleLessonNumber = (lessonNum: number) => { // handleToggleWeekNumber -> handleToggleLessonNumber
		const newExpanded = new Set(expandedLessonNumbers); // expandedWeekNumbers -> expandedLessonNumbers
		if (newExpanded.has(lessonNum)) {
			newExpanded.delete(lessonNum);
		} else {
			newExpanded.add(lessonNum);
		}
		setExpandedLessonNumbers(newExpanded); // setExpandedWeekNumbers -> setExpandedLessonNumbers
	};

	const handleMoveLesson = async (id: number, isContentId = false) => { // handleMoveWeek -> handleMoveLesson
		// ダミーウェイト
		await new Promise((resolve) => setTimeout(resolve, 400));
		if (isContentId) {
			// id は lesson_item_id → そのまま使用
			router.push(`/lesson/${course_id}/${id}/1`);
		} else {
			// id は lesson.id (CourseLessons ID) → contentsMap から最初の lesson_item_id を取得
			const lessonContents = contentsMap[id] || [];
			if (lessonContents.length > 0) {
				const sortedContents = [...lessonContents].sort((a, b) => a.order - b.order);
				router.push(`/lesson/${course_id}/${sortedContents[0].content_id}/1`);
			} else {
				alert("このレッスンにはコンテンツが登録されていません。");
			}
		}
	};

	const handleMoveFlow = async (lessonId: number) => { // weekId -> lessonId
		await new Promise((resolve) => setTimeout(resolve, 400));
		router.push(`/weekflows/${course_id}/${lessonId}`); // weekId -> lessonId
	};

	if (sessionError) {
		return (
			<>
				<main>
					<div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
						<div className="container mx-auto px-4 py-8">
							<h2 className="text-2xl font-bold text-red-600 mb-4">
								セッションエラー
							</h2>
							<p>ログインが必要です。</p>
						</div>
					</div>
				</main>
			</>
		);
	}

	if (loading) {
		return (
			<>
				<main>
					<div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
						<div className="container mx-auto px-4 py-8">
							<p>読み込み中...</p>
						</div>
					</div>
				</main>
			</>
		);
	}

	return (
		<>
			<TcAccessTime page="student_course_detail" />
			<main>
				<div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
					<div className="container mx-auto px-4 py-8">
						<div className="max-w-6xl mx-auto">
							{course && (
								<div className="mb-8">
									<div className="flex items-center gap-3 mb-2">
										<h1 className="text-3xl font-bold text-primary">
											{course.subject_name}
										</h1>
									</div>
									<h2 className="text-xl text-gray-600 mb-4 flex items-center gap-2">
										<span className="flex items-center gap-2">
											<span>{course.course_name}</span>
											{course.subject_category_name && (
												<span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full">
													{course.subject_category_name}
												</span>
											)}
										</span>
										<span className="text-gray-400">/</span>
										<span>{course.period}</span>
									</h2>
									{course.course_description && (
										<blockquote className="text-gray-600 mt-4 p-4 bg-gray-50 rounded-lg border-l-4 border-primary">
											<p className="italic">{course.course_description}</p>
										</blockquote>
									)}
								</div>
							)}

							<div className="mb-6">
								<div className="flex items-center justify-between">
									{/* 課題提出ボタン */}
									<Button
										variant="outline"
										className="h-10 px-5 font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2 border-primary/30 text-primary hover:bg-primary/5"
										onClick={() => router.push(`/course/${course_id}/assignments`)}
									>
										<FileText className="w-4 h-4" />
										課題提出
									</Button>
									{/* 表示切替 */}
									<span className="inline-flex items-center px-2 py-1 bg-white rounded-lg border border-gray-100 shadow-sm">
										<svg
											className="w-6 h-6 text-primary"
											viewBox="0 0 24 24"
											fill="currentColor"
											aria-hidden="true"
										>
											<title>リスト表示アイコン</title>
											<path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
										</svg>
										<CustomSwitch
											checked={isCardView}
											onCheckedChange={setIsCardView}
										/>
										<svg
											className="w-6 h-6 text-primary"
											viewBox="0 0 24 24"
											fill="currentColor"
											aria-hidden="true"
										>
											<title>カード表示アイコン</title>
											<path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />
										</svg>
									</span>
								</div>
							</div>

							{isCardView && (
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
									{Object.entries(groupedLessonsByNum) // groupedWeeksByNum -> groupedLessonsByNum
										.sort(
											([numA], [numB]) =>
												Number.parseInt(numA) - Number.parseInt(numB),
										)
										.flatMap(([_lessonNum, lessonsInGroup]) => // _weekNum -> _lessonNum, weeksInGroup -> lessonsInGroup
											lessonsInGroup.map((lesson) => ( // week -> lesson
												<LessonSelectCard // WeekSelectCard -> LessonSelectCard
													key={lesson.id} // week.week_id -> lesson.id
													lesson={lesson} // week -> lesson
													contents={contentsMap[lesson.id] || []} // week.week_id -> lesson.id
													onMoveLesson={handleMoveLesson} // onMoveWeek -> onMoveLesson
													onMoveFlow={handleMoveFlow}
													loadingState={loadingState}
													setLoadingState={setLoadingState}
												/>
											)),
										).length > 0 ? (
										Object.entries(groupedLessonsByNum) // groupedWeeksByNum -> groupedLessonsByNum
											.sort(
												([numA], [numB]) =>
													Number.parseInt(numA) - Number.parseInt(numB),
											)
											.flatMap(([_lessonNum, lessonsInGroup]) => // _weekNum -> _lessonNum, weeksInGroup -> lessonsInGroup
												lessonsInGroup.map((lesson) => ( // week -> lesson
													<LessonSelectCard // WeekSelectCard -> LessonSelectCard
														key={lesson.id} // week.week_id -> lesson.id
														lesson={lesson} // week -> lesson
														contents={contentsMap[lesson.id] || []} // week.week_id -> lesson.id
														onMoveLesson={handleMoveLesson} // onMoveWeek -> onMoveLesson
														onMoveFlow={handleMoveFlow}
														loadingState={loadingState}
														setLoadingState={setLoadingState}
													/>
												)),
											)
									) : (
										<div className="col-span-full bg-white rounded-xl shadow-sm border border-gray-100 p-6">
											<p className="text-center text-gray-500">
												このコースにはレッスンが設定されていません。
											</p>
										</div>
									)}
								</div>
							)}

							{!isCardView && (
								<div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
									<LessonSelectTable // WeekSelectTable -> LessonSelectTable
										groupedLessons={groupedLessonsByNum} // groupedWeeks -> groupedLessons
										contentsMap={contentsMap}
										expandedLessonNumbers={expandedLessonNumbers} // expandedWeekNumbers -> expandedLessonNumbers
										onToggleLessonNumber={handleToggleLessonNumber} // onToggleWeekNumber -> onToggleLessonNumber
										onMoveLesson={handleMoveLesson} // onMoveWeek -> onMoveLesson
										onMoveFlow={handleMoveFlow}
										loadingState={loadingState}
										setLoadingState={setLoadingState}
									/>
								</div>
							)}
						</div>
					</div>
				</div>
			</main>
		</>
	);
};

export default CoursePage;
