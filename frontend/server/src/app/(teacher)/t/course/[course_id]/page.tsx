"use client";
import { BarChart2, Edit, Eye, FileText, Loader2, Shield, UserPlus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
	subject_id?: number;
	subject_name: string;
	course_name: string;
	period: string;
	course_description?: string;
	year: string;
	semester: string;
}

interface Lesson {
	id: number;
	title: string;
	lesson_number: number;
	display_order: number;
}

interface Content {
	content_id: number;
	content_name: string;
	lesson_id: number;
	order: number;
}

interface TeacherUser {
	id: number;
	username: string | null;
	display_name: string | null;
	email: string;
}

interface CoursePermission {
	teacher_user_id: number;
	course_id: number;
	can_read_content: boolean;
	can_update_content: boolean;
	can_delete_content: boolean;
	start_date_time: string;
	end_date_time: string;
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
}: {
	lesson: Lesson;
	contents: Content[];
	onMoveLesson: (id: number, isContentId?: boolean) => void;
	onMoveFlow: (lessonId: number) => void;
}) => (
	(() => {
		const hasContents = contents.length > 0;
		const defaultTitle = `第${lesson.lesson_number}回`;
		const isDefaultLessonTitle = lesson.title?.trim() === defaultTitle;
		const displayTitle = !hasContents && isDefaultLessonTitle ? "コンテンツ未登録" : lesson.title;

		return (
			<Card className="h-full">
				<CardContent className="p-6">
					<h3 className="text-lg font-semibold mb-2">第{lesson.lesson_number}回</h3>
					<p className="text-gray-600 mb-4 text-sm">{displayTitle}</p>


					<div className="flex space-x-2 mt-4">
						<Button
							variant="default"
							className="flex-1"
							onClick={() => onMoveLesson(lesson.id)}
						>
							{hasContents ? "編集" : "コンテンツ追加"}
						</Button>
						<Button
							variant="outline"
							className="flex-1 whitespace-nowrap"
							onClick={() => onMoveFlow(lesson.id)}
							disabled={!hasContents}
						>
							学習状況
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	})()
);

// レッスン選択テーブルコンポーネント
const LessonSelectTable = ({
	groupedLessons,
	contentsMap,
	expandedLessonNumbers,
	onToggleLessonNumber,
	onMoveLesson,
	onPreviewLesson,
	onMoveFlow,
}: {
	groupedLessons: { [key: number]: Lesson[] };
	contentsMap: { [lessonId: number]: Content[] };
	expandedLessonNumbers: Set<number>;
	onToggleLessonNumber: (lessonNum: number) => void;
	onMoveLesson: (id: number, isContentId?: boolean) => void;
	onPreviewLesson: (id: number, isContentId?: boolean) => void;
	onMoveFlow: (lessonId: number) => void;
}) => {
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

	// 空の状態チェック
	const hasLessons = Object.keys(groupedLessons).length > 0;

	if (!hasLessons) {
		return (
			<div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
				<div className="text-center py-12">
					<div className="flex flex-col items-center space-y-4">
						<div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
							<svg
								className="w-8 h-8 text-gray-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
								/>
							</svg>
						</div>
						<div>
							<h3 className="text-lg font-medium text-gray-900 mb-2">
								コンテンツが登録されていません
							</h3>
							<p className="text-sm text-gray-500">
								「コンテンツを追加」ボタンから学習コンテンツを追加してください
							</p>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
			<div className="overflow-x-auto relative">
				<table className="w-full">
					<thead className="bg-gray-50 sticky top-0 z-10">
						<tr>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500">
								回
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500">
								内容
							</th>
							<th className="px-6 py-3 text-center text-xs font-medium text-gray-500">
								プレビュー
							</th>
							<th className="px-6 py-3 text-center text-xs font-medium text-gray-500">
								編集
							</th>
							<th className="px-6 py-3 text-center text-xs font-medium text-gray-500 min-w-24">
								学習状況
							</th>
						</tr>
					</thead>
					<tbody className="bg-white divide-y divide-gray-200">
						{Object.entries(groupedLessons)
							.sort(
								([numA], [numB]) =>
									Number.parseInt(numA) - Number.parseInt(numB),
							)
							.map(([lessonNumStr, lessonsInGroup]) => {
								const lessonNum = Number.parseInt(lessonNumStr);
								const isGroupExpanded = expandedLessonNumbers.has(lessonNum);

								return (
									<React.Fragment key={`group-${lessonNum}`}>
										<tr className="bg-gray-50 hover:bg-gray-100 transition-colors duration-200">
											<td className="p-0" colSpan={5}>
												<button
													type="button"
													onClick={() => onToggleLessonNumber(lessonNum)}
													onKeyDown={(e) => {
														if (e.key === "Enter" || e.key === " ") {
															e.preventDefault();
															onToggleLessonNumber(lessonNum);
														}
													}}
													className="w-full flex items-center space-x-2 px-6 py-4 text-left text-sm font-semibold text-primary whitespace-nowrap hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary cursor-pointer"
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

										{isGroupExpanded &&
											lessonsInGroup.map((lesson) => {
												const individualContents =
													contentsMap[lesson.id] || [];
												individualContents.sort((a, b) => a.order - b.order);
												const hasContents = individualContents.length > 0;
												const defaultTitle = `第${lesson.lesson_number}回`;
												const isDefaultLessonTitle =
													lesson.title?.trim() === defaultTitle;
												const displayLessonTitle =
													!hasContents && isDefaultLessonTitle
														? "コンテンツ未登録"
														: lesson.title;

												return (
													<React.Fragment key={lesson.id}>
														<tr className="border-t bg-white hover:bg-gray-50 transition-colors duration-200">
															<td className="pl-10 pr-6 py-4 text-sm text-gray-500" />
															<td className="px-6 py-4 text-base font-medium text-gray-700">
																{displayLessonTitle}
															</td>
															<td className="px-6 py-4 text-center text-sm">
																<Button
																	variant="default"
																	size="sm"
																	onClick={(e) => {
																		e.stopPropagation();
																		handleButtonClick(
																			`preview-${lesson.id}`,
																			() => onPreviewLesson(lesson.id, false),
																		);
																	}}
																	className="bg-primary text-white hover:bg-primary/90 whitespace-nowrap"
																	disabled={
																		loadingButtons[`preview-${lesson.id}`] ||
																		!hasContents
																	}
																>
																	{loadingButtons[`preview-${lesson.id}`] ? (
																		<Loader2 className="w-4 h-4 animate-spin" />
																	) : (
																		<>
																			<Eye className="w-4 h-4 mr-1" />
																			プレビュー
																		</>
																	)}
																</Button>
															</td>
															<td className="px-6 py-4 text-center text-sm">
																<Button
																	variant="default"
																	size="sm"
																	onClick={(e) => {
																		e.stopPropagation();
																		handleButtonClick(
																			`edit-${lesson.id}`,
																			() => onMoveLesson(lesson.id, false),
																		);
																	}}
																	className="bg-primary text-white hover:bg-primary/90 whitespace-nowrap"
																	disabled={
																		loadingButtons[`edit-${lesson.id}`]
																	}
																>
																	{loadingButtons[`edit-${lesson.id}`] ? (
																		<Loader2 className="w-4 h-4 animate-spin" />
																	) : (
																		<>
																			<Edit className="w-4 h-4 mr-1" />
																			{hasContents ? "編集" : "追加"}
																		</>
																	)}
																</Button>
															</td>
															<td className="px-6 py-4 text-center text-sm min-w-24">
																<Button
																	variant="outline"
																	size="sm"
																	onClick={(e) => {
																		e.stopPropagation();
																		handleButtonClick(
																			`status-${lesson.id}`,
																			() => onMoveFlow(lesson.id),
																		);
																	}}
																	className="border-primary/20 text-primary hover:bg-primary/5 whitespace-nowrap"
																	disabled={
																		loadingButtons[`status-${lesson.id}`] ||
																		!hasContents
																	}
																>
																	{loadingButtons[`status-${lesson.id}`] ? (
																		<Loader2 className="w-4 h-4 animate-spin" />
																	) : (
																		<>
																			<BarChart2 className="w-4 h-4 mr-1" />
																			学習状況
																		</>
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
};

function CoursePage() {
	const router = useRouter();
	const params = useParams();
	const course_id = params.course_id as string;

	const [_userInfo, setUserInfo] = useState<UserInfo | null>(null);
	const [sessionError, setSessionError] = useState(false);
	const [course, setCourse] = useState<Course | null>(null);
	const [lessons, setLessons] = useState<Lesson[]>([]);
	const [contents, setContents] = useState<Content[]>([]);
	const [loading, setLoading] = useState(true);
	const [isCardView, setIsCardView] = useState(false);

	// 権限管理用state
	const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);
	const [teacherList, setTeacherList] = useState<TeacherUser[]>([]);
	const [existingPermissions, setExistingPermissions] = useState<CoursePermission[]>([]);
	const [permissionState, setPermissionState] = useState<{
		[teacherId: number]: { can_read: boolean; can_update: boolean; can_delete: boolean; };
	}>({});
	const [permStartDate, setPermStartDate] = useState("");
	const [permEndDate, setPermEndDate] = useState("");
	const [permissionLoading, setPermissionLoading] = useState(false);
	const [permissionError, setPermissionError] = useState<string | null>(null);
	const [permissionSuccess, setPermissionSuccess] = useState<string | null>(null);

	const [groupedLessonsByNum, setGroupedLessonsByNum] = useState<{
		[key: number]: Lesson[];
	}>({});
	const [expandedLessonNumbers, setExpandedLessonNumbers] = useState<Set<number>>(
		new Set(),
	);

	const contentsMap = contents.reduce(
		(acc, content) => {
			if (!acc[content.lesson_id]) {
				acc[content.lesson_id] = [];
			}
			acc[content.lesson_id].push(content);
			return acc;
		},
		{} as { [lessonId: number]: Content[] },
	);

	const [isAddContentDialogOpen, setIsAddContentDialogOpen] = useState(false);
	const [lessonTitle, setLessonTitle] = useState("");
	const [lessonNumber, setLessonNumber] = useState("1");
	const [displayOrder, setDisplayOrder] = useState("1");
	const [files, setFiles] = useState<
		{ file_path: string; file_text: string }[]
	>([]);
	const [selectedFileCount, setSelectedFileCount] = useState(0);
	const [selectedFolderName, setSelectedFolderName] = useState("");
	const [errorMessage, setErrorMessage] = useState<string[]>([]);

	const readFileAsText = (file: File): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => resolve(e.target?.result as string);
			reader.onerror = reject;
			reader.readAsText(file);
		});
	};

	const readFileAsBinary = (file: File): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				const result = e.target?.result as string;
				// result is a data URL like "data:image/png;base64,iVBORw0KGgo..."
				// We only need the base64 part.
				const base64String = result.split(",")[1];
				resolve(base64String);
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	};

	const validateForm = () => {
		const errors: string[] = [];
		if (files.length === 0) {
			errors.push("登録するコースのフォルダを選択してください。");
		}
		if (!lessonTitle) {
			errors.push("レッスン名を入力してください。");
		}
		if (!lessonNumber) {
			errors.push("レッスン番号を入力してください。");
		}
		if (!displayOrder) {
			errors.push("並び順を入力してください。");
		}
		setErrorMessage(errors);
		return errors.length === 0;
	};

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const fileObjects = e.target.files;
		if (!fileObjects) return;

		const fileForUpload: { file_path: string; file_text: string }[] = [];
		const fileCount = fileObjects.length;

		// フォルダ名を取得（最初のファイルのパスから）
		if (fileCount > 0) {
			const firstFile = fileObjects[0] as File & { webkitRelativePath: string };
			const folderName = firstFile.webkitRelativePath.split("/")[0];
			setSelectedFolderName(folderName);
		}

		setSelectedFileCount(fileCount);

		try {
			for (const file of Array.from(fileObjects)) {
				const filePath = (file as File & { webkitRelativePath: string })
					.webkitRelativePath;

				let fileContent: string;

				if (file.type.startsWith("image/")) {
					// 画像ファイルはバイナリとして読み取り
					fileContent = await readFileAsBinary(file);
				} else {
					// その他のファイルはテキストとして読み取り
					fileContent = await readFileAsText(file);
				}

				fileForUpload.push({
					file_path: filePath,
					file_text: fileContent,
				});
			}

			setFiles(fileForUpload);
		} catch (error) {
			console.error("Error reading files:", error);
			setErrorMessage(["ファイルの読み取りに失敗しました"]);
		}
	};

	const handleRegisterLesson = async () => {
		if (!validateForm()) return;

		setLoading(true);

		try {
			const lessonData = {
				course_id: parseInt(params.course_id as string),
				lesson_title: lessonTitle,
				lesson_number: parseInt(lessonNumber) || 1,
				lesson_description: null,
				lesson_display_order: parseInt(displayOrder) || 1,
				lesson_is_active: true,
				files: files,
			};

			const response = await axios.post(`/courses/${params.course_id}/lessons`, lessonData);

			if (response.status === 201 || response.data) {
				setIsAddContentDialogOpen(false);
				setLessonTitle("");

				setLessonNumber("1");
				setDisplayOrder("1");
				setFiles([]);
				setSelectedFileCount(0);
				setSelectedFolderName("");
				setErrorMessage([]);
				getLessonsApi();
				getCourseContents();
			} else {
				setErrorMessage([
					"レッスンコンテンツの登録に失敗しました",
				]);
			}
		} catch (error: any) {
			console.error("レッスンの登録に失敗しました:", error);
			if (error.response?.status === 401) {
				setErrorMessage(["認証エラーが発生しました"]);
			} else if (error.response?.status === 403) {
				setErrorMessage(["この操作を行う権限がありません"]);
			} else {
				const detail = error.response?.data?.detail;
				if (typeof detail === "string") {
					setErrorMessage([detail]);
				} else if (Array.isArray(detail)) {
					const messages = detail.map(
						(d: { loc: (string | number)[]; msg: string }) =>
							`[${d.loc.join(" > ")}]: ${d.msg}`,
					);
					setErrorMessage(messages);
				} else {
					setErrorMessage(["レッスンの登録に失敗しました。"]);
				}
			}
		} finally {
			setLoading(false);
		}
	};

	const handleDialogClose = () => {
		setIsAddContentDialogOpen(false);
		setLessonTitle("");
		setLessonNumber("1");
		setDisplayOrder("1");
		setFiles([]);
		setSelectedFileCount(0);
		setSelectedFolderName("");
		setErrorMessage([]);
	};

	useEffect(() => {
		if (course_id) {
			getCourseInfo();
			getLessonsApi();
			getCourseContents();
		}
	}, [course_id]);

	// 権限管理ダイアログを開く
	const handleOpenPermissionDialog = async () => {
		setPermissionError(null);
		setPermissionSuccess(null);
		setPermissionLoading(true);
		// デフォルトの開始・終了日時をコース情報から設定
		if (course) {
			// course には日付情報がないため、今日から1年後をデフォルトにする
			const today = new Date();
			const nextYear = new Date(today);
			nextYear.setFullYear(today.getFullYear() + 1);
			setPermStartDate(today.toISOString().slice(0, 16));
			setPermEndDate(nextYear.toISOString().slice(0, 16));
		}
		try {
			const [teachersRes, permsRes] = await Promise.all([
				axios.get("/users/teachers"),
				axios.get(`/courses/${course_id}/permissions`),
			]);
			const teachers: TeacherUser[] = teachersRes.data;
			const perms: CoursePermission[] = permsRes.data;
			setTeacherList(teachers);
			setExistingPermissions(perms);
			// 既存の権限をstateに反映
			const initState: typeof permissionState = {};
			for (const t of teachers) {
				const existing = perms.find((p) => p.teacher_user_id === t.id);
				initState[t.id] = {
					can_read: existing?.can_read_content ?? false,
					can_update: existing?.can_update_content ?? false,
					can_delete: existing?.can_delete_content ?? false,
				};
			}
			setPermissionState(initState);
		} catch (e) {
			setPermissionError("教師一覧または権限情報の取得に失敗しました");
		} finally {
			setPermissionLoading(false);
		}
		setIsPermissionDialogOpen(true);
	};

	const handlePermissionToggle = (
		teacherId: number,
		field: "can_read" | "can_update" | "can_delete",
		value: boolean,
	) => {
		setPermissionState((prev) => ({
			...prev,
			[teacherId]: { ...prev[teacherId], [field]: value },
		}));
	};

	const handleSavePermissions = async () => {
		if (!permStartDate || !permEndDate) {
			setPermissionError("権限の有効期間を入力してください");
			return;
		}
		if (new Date(permStartDate) >= new Date(permEndDate)) {
			setPermissionError("開始日時は終了日時より前である必要があります");
			return;
		}
		setPermissionLoading(true);
		setPermissionError(null);
		setPermissionSuccess(null);
		try {
			const existingPermissionMap = new Map(
				existingPermissions.map((p) => [p.teacher_user_id, p]),
			);

			const permissions = teacherList
				.map((t) => {
					const next = {
						can_read_content: permissionState[t.id]?.can_read ?? false,
						can_update_content: permissionState[t.id]?.can_update ?? false,
						can_delete_content: permissionState[t.id]?.can_delete ?? false,
					};
					const prev = existingPermissionMap.get(t.id);

					// 既存がない && 全false は API送信不要（何もしない）
					if (
						!prev &&
						!next.can_read_content &&
						!next.can_update_content &&
						!next.can_delete_content
					) {
						return null;
					}

					// 既存があり、権限ビットが全く同じなら送信不要
					if (
						prev &&
						prev.can_read_content === next.can_read_content &&
						prev.can_update_content === next.can_update_content &&
						prev.can_delete_content === next.can_delete_content
					) {
						return null;
					}

					return {
						teacher_user_id: t.id,
						course_id: Number(course_id),
						can_read_content: next.can_read_content,
						can_update_content: next.can_update_content,
						can_delete_content: next.can_delete_content,
						start_date_time: new Date(permStartDate).toISOString(),
						end_date_time: new Date(permEndDate).toISOString(),
					};
				})
				.filter((p): p is NonNullable<typeof p> => p !== null);

			if (permissions.length === 0) {
				setPermissionSuccess("変更はありません");
				return;
			}

			await axios.post(`/courses/${course_id}/permissions/batch`, { permissions });
			setPermissionSuccess("権限を保存しました");
		} catch (e: any) {
			const detail = e?.response?.data?.detail;
			setPermissionError(
				typeof detail === "string" ? detail : "権限の保存に失敗しました",
			);
		} finally {
			setPermissionLoading(false);
		}
	};

	const getCourseInfo = () => {
		axios
			.get(`/courses/${params.course_id}`)
			.then((response) => {
				const data = response.data;
				const mapped: Course = {
					course_id: data.id,
					subject_id: data.subject_id,
					subject_name: data.subject?.subject_name || "",
					course_name: data.course_name || "",
					period: data.subject?.semester?.semester_name || "",
					course_description: data.description,
					year: data.subject?.semester?.year?.toString() || "",
					semester: data.subject?.semester?.semester_name || "",
				};
				setCourse(mapped);
			})
			.catch((error) => {
				console.error("コース情報の取得に失敗しました:", error);
			});
	};

	const getLessonsApi = () => {
		axios
			.get(`/courses/${params.course_id}/lessons`)
			.then((response) => {
				const mapped: Lesson[] = response.data.map((lesson: any) => ({
					id: lesson.id,
					title: lesson.title,
					lesson_number: lesson.lesson_number,
					display_order: lesson.display_order,
				}));
				setLessons(mapped);
			})
			.catch((error) => {
				console.error("レッスン一覧の取得に失敗しました:", error);
			});
	};

	const getCourseContents = () => {
		axios
			.get(`/courses/${params.course_id}/lesson-items`)
			.then((response) => {
				const data = response.data;
				const mapped: Content[] = [];
				for (const lessonId in data) {
					const items = data[lessonId];
					for (const item of items) {
						mapped.push({
							content_id: item.id,
							content_name: item.title,
							lesson_id: item.lesson_id,
							order: item.display_order,
						});
					}
				}
				setContents(mapped);
			})
			.catch((error) => {
				console.error("コンテンツ一覧の取得に失敗しました:", error);
			})
			.finally(() => {
				setLoading(false);
			});
	};

	useEffect(() => {
		if (lessons.length > 0) {
			const groups = lessons.reduce(
				(acc, lesson) => {
					const key = lesson.lesson_number;
					if (!acc[key]) {
						acc[key] = [];
					}
					acc[key].push(lesson);
					return acc;
				},
				{} as { [key: number]: Lesson[] },
			);

			for (const numKey in groups) {
				groups[numKey].sort((a, b) => a.display_order - b.display_order);
			}
			setGroupedLessonsByNum(groups);
		} else {
			setGroupedLessonsByNum({});
		}
	}, [lessons]);

	const handleToggleLessonNumber = (lessonNum: number) => {
		const newExpanded = new Set(expandedLessonNumbers);
		if (newExpanded.has(lessonNum)) {
			newExpanded.delete(lessonNum);
		} else {
			newExpanded.add(lessonNum);
		}
		setExpandedLessonNumbers(newExpanded);
	};

	const handleMoveLesson = (id: number, isContentId = false) => {
		console.log("handleMoveLesson called:", { id, isContentId, course_id });

		if (isContentId) {
			// id は lesson_item_id → そのまま使用
			if (course_id) {
				const editUrl = `/t/course/${course_id}/week/${id}/edit`;
				console.log("Navigating to content edit:", editUrl);
				router.push(editUrl);
			}
		} else {
			// id は lesson.id → contentsMap から最初の lesson_item_id を取得
			const lessonContents = contentsMap[id] || [];
			if (lessonContents.length > 0 && course_id) {
				const sortedContents = [...lessonContents].sort((a, b) => a.order - b.order);
				const editUrl = `/t/course/${course_id}/week/${sortedContents[0].content_id}/edit`;
				console.log("Navigating to lesson edit:", editUrl);
				router.push(editUrl);
			} else {
				// 空の初期レッスンでも「編集」からすぐ登録できるようにする
				const targetLesson = lessons.find((lesson) => lesson.id === id);
				if (targetLesson) {
					setLessonTitle(targetLesson.title || `第${targetLesson.lesson_number}回`);
					setLessonNumber(targetLesson.lesson_number.toString());
					setDisplayOrder(targetLesson.display_order.toString());
				}
				setErrorMessage([]);
				setIsAddContentDialogOpen(true);
			}
		}
	};

	const handlePreviewLesson = (id: number, isContentId = false) => {
		console.log("handlePreviewLesson called:", { id, isContentId, course_id });

		if (isContentId) {
			// id は lesson_item_id → そのまま使用
			if (course_id) {
				const previewUrl = `/t/course/${course_id}/preview/week/${id}/1`;
				console.log("Navigating to content preview:", previewUrl);
				router.push(previewUrl);
			}
		} else {
			// id は lesson.id → contentsMap から最初の lesson_item_id を取得
			const lessonContents = contentsMap[id] || [];
			if (lessonContents.length > 0 && course_id) {
				const sortedContents = [...lessonContents].sort((a, b) => a.order - b.order);
				const previewUrl = `/t/course/${course_id}/preview/week/${sortedContents[0].content_id}/1`;
				console.log("Navigating to lesson preview:", previewUrl);
				router.push(previewUrl);
			} else {
				alert("このレッスンにはコンテンツが登録されていません。");
			}
		}
	};

	const handleMoveFlow = (_lessonId: number) => {
		// コース全体の演習・成績状況ページへ遷移
		router.push(`/t/course/${course_id}/score`);
	};

	if (sessionError) {
		return (
			<>
				<div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
					<div className="container mx-auto px-4 py-8">
						<h2 className="text-2xl font-bold text-red-600 mb-4">
							セッションエラー
						</h2>
						<p>ログインが必要です。</p>
					</div>
				</div>
			</>
		);
	}

	if (loading) {
		return (
			<>
				<div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
					<div className="container mx-auto px-4 py-8">
						<p>読み込み中...</p>
					</div>
				</div>
			</>
		);
	}

	return (
		<>
			<div className="min-h-screen bg-gray-100">
				<div className="container mx-auto px-4 py-8">
					<div className="max-w-6xl mx-auto">
						{course && (
							<div className="mb-8">
								<h1 className="text-3xl font-bold mb-2">
									{course.subject_name}
								</h1>
								<h2 className="text-xl text-gray-600 mb-4">
									{course.course_name} / {course.period}
								</h2>
							</div>
						)}

						<div className="mb-6">
							<div className="flex items-center justify-end space-x-4">
								<Button
									onClick={() => router.push(`/t/course/${course_id}/assignments`)}
									variant="outline"
									className="h-10 px-6 text-base font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2"
								>
									<FileText className="w-5 h-5" />
									課題管理
								</Button>
								<Button
									onClick={handleOpenPermissionDialog}
									variant="outline"
									className="h-10 px-6 text-base font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2"
								>
									<Shield className="w-5 h-5" />
									権限管理
								</Button>
								<Button
									onClick={() => router.push(`/t/course/${course_id}/enrollments`)}
									variant="outline"
									className="h-10 px-6 text-base font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2"
								>
									<UserPlus className="w-5 h-5" />
									履修者を登録
								</Button>
								<Button
									onClick={() => setIsAddContentDialogOpen(true)}
									className="bg-primary hover:bg-primary/90 text-white h-10 px-6 text-base font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2"
								>
									<svg
										className="w-5 h-5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										xmlns="http://www.w3.org/2000/svg"
										aria-hidden="true"
									>
										<title>コンテンツ追加アイコン</title>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth="2"
											d="M12 4v16m8-8H4"
										/>
									</svg>
									コンテンツを追加
								</Button>
								<div className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm border border-gray-100">
									<svg
										className="w-6 h-6 text-primary"
										viewBox="0 0 24 24"
										fill="currentColor"
										aria-hidden="true"
									>
										<title>カード表示アイコン</title>
										<path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />
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
										<title>リスト表示アイコン</title>
										<path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
									</svg>
								</div>
							</div>
						</div>

						{/* 権限管理ダイアログ */}
						<Dialog
							open={isPermissionDialogOpen}
							onOpenChange={(open) => {
								if (!open) {
									setIsPermissionDialogOpen(false);
									setPermissionError(null);
									setPermissionSuccess(null);
								}
							}}
						>
							<DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
								<DialogHeader>
									<DialogTitle className="text-2xl font-bold text-gray-800 flex items-center gap-2">
										<Shield className="w-6 h-6 text-primary" />
										コース権限管理
									</DialogTitle>
									<p className="text-sm text-gray-500 mt-1">
										他の教師に対してこのコースの操作権限を付与・剥奪できます。
									</p>
								</DialogHeader>

								<div className="space-y-5 py-4">
									{/* 有効期間 */}
									<div className="bg-gray-50 rounded-lg p-4 space-y-3">
										<h3 className="text-sm font-semibold text-gray-700">権限有効期間</h3>
										<div className="grid grid-cols-2 gap-4">
											<div className="space-y-1">
												<Label htmlFor="perm-start" className="text-xs text-gray-600">開始日時</Label>
												<Input
													id="perm-start"
													type="datetime-local"
													value={permStartDate}
													onChange={(e) => setPermStartDate(e.target.value)}
													className="h-10 text-sm"
												/>
											</div>
											<div className="space-y-1">
												<Label htmlFor="perm-end" className="text-xs text-gray-600">終了日時</Label>
												<Input
													id="perm-end"
													type="datetime-local"
													value={permEndDate}
													onChange={(e) => setPermEndDate(e.target.value)}
													className="h-10 text-sm"
												/>
											</div>
										</div>
									</div>

									{/* エラー・成功メッセージ */}
									{permissionError && (
										<div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg">
											{permissionError}
										</div>
									)}
									{permissionSuccess && (
										<div className="bg-green-50 border border-green-200 text-green-700 text-sm p-3 rounded-lg">
											{permissionSuccess}
										</div>
									)}

									{/* 教師一覧テーブル */}
									{permissionLoading ? (
										<div className="flex justify-center py-8">
											<Loader2 className="w-8 h-8 animate-spin text-primary" />
										</div>
									) : teacherList.length === 0 ? (
										<div className="text-center py-8 text-gray-400">
											<Shield className="w-12 h-12 mx-auto mb-2 opacity-30" />
											<p className="text-sm">他の教師アカウントが存在しません</p>
										</div>
									) : (
										<div className="border border-gray-200 rounded-lg overflow-hidden">
											<table className="w-full text-sm">
												<thead className="bg-gray-50">
													<tr>
														<th className="px-4 py-3 text-left font-semibold text-gray-600">教師</th>
														<th className="px-4 py-3 text-center font-semibold text-gray-600">閲覧</th>
														<th className="px-4 py-3 text-center font-semibold text-gray-600">編集</th>
														<th className="px-4 py-3 text-center font-semibold text-gray-600">削除</th>
													</tr>
												</thead>
												<tbody className="divide-y divide-gray-100">
													{teacherList.map((teacher) => (
														<tr key={teacher.id} className="hover:bg-gray-50 transition-colors">
															<td className="px-4 py-3">
																<div className="font-medium text-gray-800">
																	{teacher.display_name || teacher.username || teacher.email}
																</div>
																<div className="text-xs text-gray-400">{teacher.email}</div>
															</td>
															<td className="px-4 py-3 text-center">
																<input
																	type="checkbox"
																	id={`read-${teacher.id}`}
																	checked={permissionState[teacher.id]?.can_read ?? false}
																	onChange={(e) =>
																		handlePermissionToggle(teacher.id, "can_read", e.target.checked)
																	}
																	className="w-4 h-4 rounded accent-primary cursor-pointer"
																/>
															</td>
															<td className="px-4 py-3 text-center">
																<input
																	type="checkbox"
																	id={`update-${teacher.id}`}
																	checked={permissionState[teacher.id]?.can_update ?? false}
																	onChange={(e) =>
																		handlePermissionToggle(teacher.id, "can_update", e.target.checked)
																	}
																	className="w-4 h-4 rounded accent-primary cursor-pointer"
																/>
															</td>
															<td className="px-4 py-3 text-center">
																<input
																	type="checkbox"
																	id={`delete-${teacher.id}`}
																	checked={permissionState[teacher.id]?.can_delete ?? false}
																	onChange={(e) =>
																		handlePermissionToggle(teacher.id, "can_delete", e.target.checked)
																	}
																	className="w-4 h-4 rounded accent-primary cursor-pointer"
																/>
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									)}
								</div>

								<DialogFooter className="gap-3 pt-2">
									<Button
										type="button"
										variant="outline"
										onClick={() => {
											setIsPermissionDialogOpen(false);
											setPermissionError(null);
											setPermissionSuccess(null);
										}}
										className="h-11 text-base"
									>
										閉じる
									</Button>
									<Button
										type="button"
										onClick={handleSavePermissions}
										disabled={permissionLoading || teacherList.length === 0}
										className="h-11 text-base bg-primary hover:bg-primary/90"
									>
										{permissionLoading ? (
											<Loader2 className="w-4 h-4 animate-spin mr-2" />
										) : (
											<Shield className="w-4 h-4 mr-2" />
										)}
										権限を保存
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>

						{/* コンテンツ追加ダイアログ */}
						<Dialog
							open={isAddContentDialogOpen}
							onOpenChange={handleDialogClose}
						>
							<DialogContent className="sm:max-w-[600px]">
								<DialogHeader>
									<DialogTitle className="text-2xl font-bold text-gray-800">
										コンテンツ追加
									</DialogTitle>
								</DialogHeader>
								<form
									onSubmit={(e) => {
										e.preventDefault();
										handleRegisterLesson();
									}}
								>
									<div className="grid gap-6 py-6">
										{errorMessage.length > 0 && (
											<div className="bg-red-50 border border-red-200 text-red-600 p-6 rounded-lg">
												<h3 className="font-semibold mb-2">
													エラーが発生しました
												</h3>
												<ul className="list-disc list-inside space-y-1">
													{errorMessage.map((msg) => (
														<li key={msg}>{msg}</li>
													))}
												</ul>
											</div>
										)}

										<div className="grid gap-4">
											<div className="grid gap-2">
												<Label
													htmlFor="lessonTitle"
													className="text-base font-medium"
												>
													レッスン名
												</Label>
												<Input
													id="lessonTitle"
													value={lessonTitle}
													onChange={(e) => setLessonTitle(e.target.value)}
													placeholder="例: 線形代数学_第1週"
													className="h-12 text-base"
													required
												/>
											</div>

											<div className="grid grid-cols-2 gap-6">
												<div className="grid gap-2">
													<Label
														htmlFor="lessonNumber"
														className="text-base font-medium"
													>
														第○回
													</Label>
													<Input
														id="lessonNumber"
														type="number"
														value={lessonNumber}
														onChange={(e) => setLessonNumber(e.target.value)}
														placeholder="数値のみを入力"
														className="h-12 text-base"
														required
													/>
												</div>
												<div className="grid gap-2">
													<Label
														htmlFor="displayOrder"
														className="text-base font-medium"
													>
														並び順
													</Label>
													<Input
														id="displayOrder"
														type="number"
														value={displayOrder}
														onChange={(e) => setDisplayOrder(e.target.value)}
														placeholder="数値のみを入力"
														className="h-12 text-base"
														required
													/>
												</div>
											</div>

											<div className="grid gap-2">
												<Label
													htmlFor="files"
													className="text-base font-medium"
												>
													コンテンツファイル
												</Label>
												<div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary/50 transition-colors duration-200">
													{selectedFileCount === 0 ? (
														<label
															htmlFor="files"
															className="flex flex-col items-center space-y-3 cursor-pointer"
														>
															<svg
																className="w-12 h-12 text-gray-400"
																fill="none"
																stroke="currentColor"
																viewBox="0 0 24 24"
																xmlns="http://www.w3.org/2000/svg"
																aria-hidden="true"
															>
																<title>フォルダアイコン</title>
																<path
																	strokeLinecap="round"
																	strokeLinejoin="round"
																	strokeWidth="2"
																	d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z"
																/>
															</svg>
															<div className="text-center">
																<p className="text-sm font-medium text-gray-700 mb-1">
																	フォルダを選択してください
																</p>
															</div>
															<Input
																id="files"
																type="file"
																onChange={handleFileChange}
																// @ts-expect-error
																webkitdirectory="true"
																directory=""
																className="h-12 text-base file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
																required
															/>
														</label>
													) : (
														<div className="flex flex-col items-center space-y-3">
															<div className="flex items-center space-x-2 text-green-600">
																<svg
																	className="w-8 h-8"
																	fill="none"
																	stroke="currentColor"
																	viewBox="0 0 24 24"
																	xmlns="http://www.w3.org/2000/svg"
																	aria-hidden="true"
																>
																	<title>チェックマークアイコン</title>
																	<path
																		strokeLinecap="round"
																		strokeLinejoin="round"
																		strokeWidth="2"
																		d="M5 13l4 4L19 7"
																	/>
																</svg>
																<span className="text-lg font-semibold">
																	ファイルが選択されました
																</span>
															</div>
															<div className="bg-green-50 border border-green-200 rounded-lg p-4 w-full max-w-md">
																<div className="flex items-center justify-between">
																	<div className="flex items-center space-x-2">
																		<svg
																			className="w-5 h-5 text-green-600"
																			fill="none"
																			stroke="currentColor"
																			viewBox="0 0 24 24"
																			xmlns="http://www.w3.org/2000/svg"
																			aria-hidden="true"
																		>
																			<title>フォルダアイコン</title>
																			<path
																				strokeLinecap="round"
																				strokeLinejoin="round"
																				strokeWidth="2"
																				d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z"
																			/>
																		</svg>
																		<span className="font-medium text-gray-900">
																			{selectedFolderName}
																		</span>
																	</div>
																	<div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
																		{selectedFileCount}個のファイル
																	</div>
																</div>
															</div>
															<label htmlFor="files" className="cursor-pointer">
																<Input
																	id="files"
																	type="file"
																	onChange={handleFileChange}
																	// @ts-expect-error
																	webkitdirectory="true"
																	directory=""
																	className="hidden"
																/>
															</label>
														</div>
													)}
												</div>
											</div>
										</div>
									</div>
									<DialogFooter className="gap-3">
										<Button
											type="button"
											variant="outline"
											onClick={handleDialogClose}
											className="h-12 text-base"
										>
											キャンセル
										</Button>
										<Button
											type="submit"
											className="h-12 text-base bg-primary hover:bg-primary/90"
										>
											登録
										</Button>
									</DialogFooter>
								</form>
							</DialogContent>
						</Dialog>

						{isCardView && (
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
								{Object.entries(groupedLessonsByNum)
									.sort(
										([numA], [numB]) =>
											Number.parseInt(numA) - Number.parseInt(numB),
									)
									.flatMap(([_lessonNum, lessonsInGroup]) =>
										lessonsInGroup.map((lesson) => (
											<LessonSelectCard
												key={lesson.id}
												lesson={lesson}
												contents={contentsMap[lesson.id] || []}
												onMoveLesson={handleMoveLesson}
												onMoveFlow={handleMoveFlow}
											/>
										)),
									).length > 0 ? (
									Object.entries(groupedLessonsByNum)
										.sort(
											([numA], [numB]) =>
												Number.parseInt(numA) - Number.parseInt(numB),
										)
										.flatMap(([_lessonNum, lessonsInGroup]) =>
											lessonsInGroup.map((lesson) => (
												<LessonSelectCard
													key={lesson.id}
													lesson={lesson}
													contents={contentsMap[lesson.id] || []}
													onMoveLesson={handleMoveLesson}
													onMoveFlow={handleMoveFlow}
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
							<LessonSelectTable
								groupedLessons={groupedLessonsByNum}
								contentsMap={contentsMap}
								expandedLessonNumbers={expandedLessonNumbers}
								onToggleLessonNumber={handleToggleLessonNumber}
								onMoveLesson={handleMoveLesson}
								onPreviewLesson={handlePreviewLesson}
								onMoveFlow={handleMoveFlow}
							/>
						)}
					</div>
				</div>
			</div>
		</>
	);
}

export default CoursePage;
