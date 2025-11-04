"use client";
import { BarChart2, Edit, Eye, Loader2 } from "lucide-react";
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
import { useLoginUser } from "@/hooks/useLoginUser";
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

interface Week {
	week_id: number;
	week_name: string;
	week_num: number;
	order: number;
}

interface Content {
	content_id: number;
	content_name: string;
	week_id: number;
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

// 週選択カードコンポーネント
const WeekSelectCard = ({
	week,
	contents,
	onMoveWeek,
	onMoveFlow,
}: {
	week: Week;
	contents: Content[];
	onMoveWeek: (id: number, isContentId?: boolean) => void;
	onMoveFlow: (weekId: number) => void;
}) => (
	<Card className="h-full">
		<CardContent className="p-6">
			<h3 className="text-lg font-semibold mb-2">第{week.week_num}回</h3>
			<p className="text-gray-600 mb-4 text-sm">{week.week_name}</p>

			{contents.length > 0 && (
				<div className="space-y-2 mb-4">
					<h4 className="text-sm font-medium text-gray-700 mb-2">
						コンテンツ:
					</h4>
					{contents.map((content) => (
						<div
							key={content.content_id}
							className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
						>
							<span className="text-gray-700">{content.content_name}</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() => onMoveWeek(content.content_id, true)}
								className="text-xs"
							>
								編集
							</Button>
						</div>
					))}
				</div>
			)}

			<div className="flex space-x-2 mt-4">
				<Button
					variant="default"
					className="flex-1"
					onClick={() => onMoveWeek(week.week_id)}
				>
					編集
				</Button>
				<Button
					variant="outline"
					className="flex-1 whitespace-nowrap"
					onClick={() => onMoveFlow(week.week_id)}
				>
					学習状況
				</Button>
			</div>
		</CardContent>
	</Card>
);

// 週選択テーブルコンポーネント
const WeekSelectTable = ({
	groupedWeeks,
	contentsMap,
	expandedWeekNumbers,
	onToggleWeekNumber,
	onMoveWeek,
	onPreviewWeek,
	onMoveFlow,
}: {
	groupedWeeks: { [key: number]: Week[] };
	contentsMap: { [weekId: number]: Content[] };
	expandedWeekNumbers: Set<number>;
	onToggleWeekNumber: (weekNum: number) => void;
	onMoveWeek: (id: number, isContentId?: boolean) => void;
	onPreviewWeek: (id: number, isContentId?: boolean) => void;
	onMoveFlow: (weekId: number) => void;
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
	const hasWeeks = Object.keys(groupedWeeks).length > 0;

	if (!hasWeeks) {
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
								「週の作成」ボタンから学習コンテンツを追加してください
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
						{Object.entries(groupedWeeks)
							.sort(
								([numA], [numB]) =>
									Number.parseInt(numA) - Number.parseInt(numB),
							)
							.map(([weekNumStr, weeksInGroup]) => {
								const weekNum = Number.parseInt(weekNumStr);
								const isGroupExpanded = expandedWeekNumbers.has(weekNum);

								return (
									<React.Fragment key={`group-${weekNum}`}>
										<tr className="bg-gray-50 hover:bg-gray-100 transition-colors duration-200">
											<td className="p-0" colSpan={5}>
												<button
													type="button"
													onClick={() => onToggleWeekNumber(weekNum)}
													onKeyDown={(e) => {
														if (e.key === "Enter" || e.key === " ") {
															e.preventDefault();
															onToggleWeekNumber(weekNum);
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
													<span>第{weekNum}回</span>
												</button>
											</td>
										</tr>

										{isGroupExpanded &&
											weeksInGroup.map((week) => {
												const individualContents =
													contentsMap[week.week_id] || [];
												individualContents.sort((a, b) => a.order - b.order);

												return (
													<React.Fragment key={week.week_id}>
														<tr className="border-t bg-white hover:bg-gray-50 transition-colors duration-200">
															<td className="pl-10 pr-6 py-4 text-sm text-gray-500" />
															<td className="px-6 py-4 text-base font-medium text-gray-700">
																{week.week_name}
															</td>
															<td className="px-6 py-4 text-center text-sm">
																<Button
																	variant="default"
																	size="sm"
																	onClick={(e) => {
																		e.stopPropagation();
																		handleButtonClick(
																			`preview-${week.week_id}`,
																			() => onPreviewWeek(week.week_id, false),
																		);
																	}}
																	className="bg-primary text-white hover:bg-primary/90 whitespace-nowrap"
																	disabled={
																		loadingButtons[`preview-${week.week_id}`]
																	}
																>
																	{loadingButtons[`preview-${week.week_id}`] ? (
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
																			`edit-${week.week_id}`,
																			() => onMoveWeek(week.week_id, false),
																		);
																	}}
																	className="bg-primary text-white hover:bg-primary/90 whitespace-nowrap"
																	disabled={
																		loadingButtons[`edit-${week.week_id}`]
																	}
																>
																	{loadingButtons[`edit-${week.week_id}`] ? (
																		<Loader2 className="w-4 h-4 animate-spin" />
																	) : (
																		<>
																			<Edit className="w-4 h-4 mr-1" />
																			編集
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
																			`status-${week.week_id}`,
																			() => onMoveFlow(week.week_id),
																		);
																	}}
																	className="border-primary/20 text-primary hover:bg-primary/5 whitespace-nowrap"
																	disabled={
																		loadingButtons[`status-${week.week_id}`]
																	}
																>
																	{loadingButtons[`status-${week.week_id}`] ? (
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

														{individualContents.map((content) => (
															<tr
																key={content.content_id}
																className="bg-gray-50 hover:bg-gray-100 transition-colors duration-200"
															>
																<td className="pl-10 pr-6 py-4 whitespace-nowrap text-sm text-gray-500" />
																<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
																	{content.content_name}
																</td>
																<td className="px-6 py-4 whitespace-nowrap text-center text-sm">
																	<Button
																		variant="default"
																		size="sm"
																		onClick={(e) => {
																			e.stopPropagation();
																			handleButtonClick(
																				`preview-content-${content.content_id}`,
																				() =>
																					onPreviewWeek(
																						content.content_id,
																						true,
																					),
																			);
																		}}
																		className="bg-primary text-white hover:bg-primary/90 whitespace-nowrap"
																		disabled={
																			loadingButtons[
																				`preview-content-${content.content_id}`
																			]
																		}
																	>
																		{loadingButtons[
																			`preview-content-${content.content_id}`
																		] ? (
																			<Loader2 className="w-4 h-4 animate-spin" />
																		) : (
																			<>
																				<Eye className="w-4 h-4 mr-1" />
																				プレビュー
																			</>
																		)}
																	</Button>
																</td>
																<td className="px-6 py-4 whitespace-nowrap text-center text-sm">
																	<Button
																		variant="default"
																		size="sm"
																		onClick={(e) => {
																			e.stopPropagation();
																			handleButtonClick(
																				`edit-content-${content.content_id}`,
																				() =>
																					onMoveWeek(content.content_id, true),
																			);
																		}}
																		className="bg-primary text-white hover:bg-primary/90 whitespace-nowrap"
																		disabled={
																			loadingButtons[
																				`edit-content-${content.content_id}`
																			]
																		}
																	>
																		{loadingButtons[
																			`edit-content-${content.content_id}`
																		] ? (
																			<Loader2 className="w-4 h-4 animate-spin" />
																		) : (
																			<>
																				<Edit className="w-4 h-4 mr-1" />
																				編集
																			</>
																		)}
																	</Button>
																</td>
																<td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
																	-
																</td>
															</tr>
														))}
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
	const { loginUser, isLoadingUser } = useLoginUser();
	const router = useRouter();
	const params = useParams();
	const course_id = params.course_id as string;

	const [_userInfo, setUserInfo] = useState<UserInfo | null>(null);
	const [sessionError, setSessionError] = useState(false);
	const [course, setCourse] = useState<Course | null>(null);
	const [weeks, setWeeks] = useState<Week[]>([]);
	const [contents, setContents] = useState<Content[]>([]);
	const [loading, setLoading] = useState(true);
	const [isCardView, setIsCardView] = useState(false);

	const [groupedWeeksByNum, setGroupedWeeksByNum] = useState<{
		[key: number]: Week[];
	}>({});
	const [expandedWeekNumbers, setExpandedWeekNumbers] = useState<Set<number>>(
		new Set(),
	);

	const contentsMap = contents.reduce(
		(acc, content) => {
			if (!acc[content.week_id]) {
				acc[content.week_id] = [];
			}
			acc[content.week_id].push(content);
			return acc;
		},
		{} as { [weekId: number]: Content[] },
	);

	const [isAddContentDialogOpen, setIsAddContentDialogOpen] = useState(false);
	const [weekName, setWeekName] = useState("線形代数学_第1週");
	const [weekNum, setWeekNum] = useState("1");
	const [order, setOrder] = useState("1");
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
				const result = e.target?.result as ArrayBuffer;
				const uint8Array = new Uint8Array(result);
				let binaryString = "";

				for (let i = 0; i < uint8Array.length; i++) {
					const hex =
						uint8Array[i] < 0x10
							? "0" + uint8Array[i].toString(16)
							: uint8Array[i].toString(16);
					binaryString += "\\x" + hex;
				}

				resolve(binaryString);
			};
			reader.onerror = reject;
			reader.readAsArrayBuffer(file);
		});
	};

	const validateForm = () => {
		const errors: string[] = [];
		if (files.length === 0) {
			errors.push("登録するコースのフォルダを選択してください。");
		}
		if (!weekName) {
			errors.push("週名を入力してください。");
		}
		if (!weekNum) {
			errors.push("週数を入力してください。");
		}
		if (!order) {
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

	const handleRegisterWeek = async () => {
		if (!validateForm()) return;

		setLoading(true);

		try {
			const weekData = {
				week_name: weekName,
				week_num: parseInt(weekNum) || 1,
				order: parseInt(order) || 1,
				course_id: params.course_id,
				week_files: files,
			};

			const response = await axios.post("/register_week", weekData);

			if (response.data.success) {
				setIsAddContentDialogOpen(false);
				// フォームをリセット
				setWeekName("線形代数学_第1週");
				setWeekNum("1");
				setOrder("1");
				setFiles([]);
				setSelectedFileCount(0);
				setSelectedFolderName("");
				setErrorMessage([]);
				// 週一覧を更新
				getWeeksApi();
				getCourseContents();
			} else {
				setErrorMessage([
					response.data.error_msg || "週次コンテンツの登録に失敗しました",
				]);
			}
		} catch (error: any) {
			console.error("週の登録に失敗しました:", error);
			if (error.response?.status === 401) {
				setErrorMessage(["認証エラーが発生しました"]);
			} else {
				setErrorMessage([
					error.response?.data?.error_msg || "週の登録に失敗しました。",
				]);
			}
		} finally {
			setLoading(false);
		}
	};

	const handleDialogClose = () => {
		setIsAddContentDialogOpen(false);
		// フォームをリセット
		setWeekName("線形代数学_第1週");
		setWeekNum("1");
		setOrder("1");
		setFiles([]);
		setSelectedFileCount(0);
		setSelectedFolderName("");
		setErrorMessage([]);
	};

	useEffect(() => {
		if (!isLoadingUser && !loginUser) {
			router.push("/login");
		}
	}, [loginUser, isLoadingUser, router]);

	useEffect(() => {
		if (loginUser && course_id) {
			getCourseInfo();
			getWeeksApi();
			getCourseContents();
		}
	}, [loginUser, course_id]);

	const homeProfile = () => {
		// ユーザー情報が既にあるため、この関数は不要だが呼び出し元があるため保持
	};

	const getCourseInfo = () => {
		axios
			.get(`/get_course_info/${params.course_id}`)
			.then((response) => {
				setCourse(response.data);
			})
			.catch((error) => {
				console.error("コース情報の取得に失敗しました:", error);
			});
	};

	const getWeeksApi = () => {
		axios
			.get(`/get_weeks/${params.course_id}`)
			.then((response) => {
				setWeeks(response.data);
			})
			.catch((error) => {
				console.error("週一覧の取得に失敗しました:", error);
			});
	};

	const getCourseContents = () => {
		axios
			.get(`/get_course_contents/${params.course_id}`)
			.then((response) => {
				setContents(response.data);
			})
			.catch((error) => {
				console.error("コンテンツ一覧の取得に失敗しました:", error);
			})
			.finally(() => {
				setLoading(false);
			});
	};

	useEffect(() => {
		if (weeks.length > 0) {
			const groups = weeks.reduce(
				(acc, week) => {
					const key = week.week_num;
					if (!acc[key]) {
						acc[key] = [];
					}
					acc[key].push(week);
					return acc;
				},
				{} as { [key: number]: Week[] },
			);

			for (const numKey in groups) {
				groups[numKey].sort((a, b) => a.order - b.order);
			}
			setGroupedWeeksByNum(groups);
		} else {
			setGroupedWeeksByNum({});
		}
	}, [weeks]);

	const handleToggleWeekNumber = (weekNum: number) => {
		const newExpanded = new Set(expandedWeekNumbers);
		if (newExpanded.has(weekNum)) {
			newExpanded.delete(weekNum);
		} else {
			newExpanded.add(weekNum);
		}
		setExpandedWeekNumbers(newExpanded);
	};

	const handleMoveWeek = (id: number, isContentId = false) => {
		console.log("handleMoveWeek called:", { id, isContentId, course_id });

		if (isContentId) {
			const targetContent = contents.find((c) => c.content_id === id);
			console.log("Target content:", targetContent);
			if (targetContent && course_id) {
				const editUrl = `/t/course/${course_id}/week/${targetContent.week_id}/edit`;
				console.log("Navigating to content edit:", editUrl);
				router.push(editUrl);
			} else {
				console.error(`Content with id ${id} not found or course_id missing.`);
			}
		} else {
			const weekId = id;
			if (course_id) {
				const editUrl = `/t/course/${course_id}/week/${weekId}/edit`;
				console.log("Navigating to week edit:", editUrl);
				router.push(editUrl);
			} else {
				console.error(`course_id missing.`);
			}
		}
	};

	const handlePreviewWeek = (id: number, isContentId = false) => {
		console.log("handlePreviewWeek called:", { id, isContentId, course_id });

		if (isContentId) {
			const targetContent = contents.find((c) => c.content_id === id);
			console.log("Target content:", targetContent);
			if (targetContent && course_id) {
				const previewUrl = `/t/course/${course_id}/preview/week/${targetContent.week_id}/1`;
				console.log("Navigating to content preview:", previewUrl);
				router.push(previewUrl);
			} else {
				console.error(`Content with id ${id} not found or course_id missing.`);
			}
		} else {
			const weekId = id;
			if (course_id) {
				const previewUrl = `/t/course/${course_id}/preview/week/${weekId}/1`;
				console.log("Navigating to week preview:", previewUrl);
				router.push(previewUrl);
			} else {
				console.error(`course_id missing.`);
			}
		}
	};

	const handleMoveFlow = (weekId: number) => {
		router.push(`/t/weekflows/${course_id}/${weekId}`);
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
			<div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
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
										handleRegisterWeek();
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
													htmlFor="weekName"
													className="text-base font-medium"
												>
													週名
												</Label>
												<Input
													id="weekName"
													value={weekName}
													onChange={(e) => setWeekName(e.target.value)}
													placeholder="例: 線形代数学_第1週"
													className="h-12 text-base"
													required
												/>
											</div>

											<div className="grid grid-cols-2 gap-6">
												<div className="grid gap-2">
													<Label
														htmlFor="weekNum"
														className="text-base font-medium"
													>
														第○週、第○回
													</Label>
													<Input
														id="weekNum"
														type="number"
														value={weekNum}
														onChange={(e) => setWeekNum(e.target.value)}
														placeholder="数値のみを入力"
														className="h-12 text-base"
														required
													/>
												</div>
												<div className="grid gap-2">
													<Label
														htmlFor="order"
														className="text-base font-medium"
													>
														並び順
													</Label>
													<Input
														id="order"
														type="number"
														value={order}
														onChange={(e) => setOrder(e.target.value)}
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
																// @ts-expect-error
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
																	// @ts-expect-error
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
								{Object.entries(groupedWeeksByNum)
									.sort(
										([numA], [numB]) =>
											Number.parseInt(numA) - Number.parseInt(numB),
									)
									.flatMap(([_weekNum, weeksInGroup]) =>
										weeksInGroup.map((week) => (
											<WeekSelectCard
												key={week.week_id}
												week={week}
												contents={contentsMap[week.week_id] || []}
												onMoveWeek={handleMoveWeek}
												onMoveFlow={handleMoveFlow}
											/>
										)),
									).length > 0 ? (
									Object.entries(groupedWeeksByNum)
										.sort(
											([numA], [numB]) =>
												Number.parseInt(numA) - Number.parseInt(numB),
										)
										.flatMap(([_weekNum, weeksInGroup]) =>
											weeksInGroup.map((week) => (
												<WeekSelectCard
													key={week.week_id}
													week={week}
													contents={contentsMap[week.week_id] || []}
													onMoveWeek={handleMoveWeek}
													onMoveFlow={handleMoveFlow}
												/>
											)),
										)
								) : (
									<div className="col-span-full bg-white rounded-xl shadow-sm border border-gray-100 p-6">
										<p className="text-center text-gray-500">
											このコースには週が設定されていません。
										</p>
									</div>
								)}
							</div>
						)}

						{!isCardView && (
							<WeekSelectTable
								groupedWeeks={groupedWeeksByNum}
								contentsMap={contentsMap}
								expandedWeekNumbers={expandedWeekNumbers}
								onToggleWeekNumber={handleToggleWeekNumber}
								onMoveWeek={handleMoveWeek}
								onPreviewWeek={handlePreviewWeek}
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
