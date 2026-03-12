"use client";
import {
	AlertCircle,
	CheckCircle,
	ChevronDown,
	ChevronRight,
	Clock,
	Download,
	FileText,
	Loader2,
	Star,
	Upload,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import axios from "@/lib/axios";

// ── 型定義 ──────────────────────────────────────────
interface Assignment {
	id: number;
	lesson_id: number;
	title: string;
	description: string | null;
	is_published: boolean;
	due_date: string | null;
	allow_late_submission: boolean;
	max_file_size_mb: number;
	allowed_file_types: string | null;
	display_order: number;
	submission_count: number;
	my_submission: Submission | null;
}

interface Submission {
	id: number;
	assignment_id: number;
	original_filename: string;
	file_size_bytes: number | null;
	submission_number: number;
	is_latest: boolean;
	score: number | null;
	max_score: number | null;
	teacher_comment: string | null;
	graded_at: string | null;
	submitted_at: string;
}

interface Lesson {
	id: number;
	title: string;
	lesson_number: number;
}

// ── ヘルパー ─────────────────────────────────────────
function fmtDate(iso: string | null): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleString("ja-JP", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function fmtFileSize(bytes: number | null): string {
	if (!bytes) return "—";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isOverdue(dueDate: string | null): boolean {
	if (!dueDate) return false;
	return new Date() > new Date(dueDate);
}

// ── メインコンポーネント ──────────────────────────────
export default function StudentAssignmentsPage() {
	const params = useParams();
	const courseId = params.course_id as string;

	const [lessons, setLessons] = useState<Lesson[]>([]);
	const [assignments, setAssignments] = useState<Assignment[]>([]);
	const [loading, setLoading] = useState(true);
	const [expandedLessons, setExpandedLessons] = useState<Set<number>>(new Set());
	const [expandedAssignments, setExpandedAssignments] = useState<Set<number>>(new Set());
	const [expandedAssignmentDetails, setExpandedAssignmentDetails] = useState<
		Set<number>
	>(new Set());

	// 提出用ステート（課題IDごと）
	const [uploadingId, setUploadingId] = useState<number | null>(null);
	const [uploadError, setUploadError] = useState<Record<number, string>>({});
	const [uploadSuccess, setUploadSuccess] = useState<Record<number, boolean>>({});
	const [selectedFiles, setSelectedFiles] = useState<Record<number, File | null>>({});
	const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

	// 提出履歴
	const [historyByAssignment, setHistoryByAssignment] = useState<
		Record<number, Submission[]>
	>({});
	const [historyLoading, setHistoryLoading] = useState<Set<number>>(new Set());

	useEffect(() => {
		if (courseId) fetchData();
	}, [courseId]);

	const fetchData = async () => {
		try {
			const res = await axios.get(`/courses/${courseId}/lessons`);
			setLessons(res.data);
			await fetchAllAssignments(res.data.map((l: Lesson) => l.id));
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	};

	const fetchAllAssignments = async (lessonIds: number[]) => {
		const all: Assignment[] = [];
		await Promise.all(
			lessonIds.map(async (lid) => {
				try {
					const res = await axios.get(`/lessons/${lid}/assignments`);
					all.push(...res.data);
				} catch {
					// ignore
				}
			}),
		);
		setAssignments(all.sort((a, b) => a.display_order - b.display_order) as any);
	};

	const fetchHistory = async (assignmentId: number) => {
		setHistoryLoading((prev) => new Set(prev).add(assignmentId));
		try {
			const res = await axios.get(`/assignments/${assignmentId}/my-submissions`);
			setHistoryByAssignment((prev) => ({
				...prev,
				[assignmentId]: res.data,
			}));
		} catch (e) {
			console.error(e);
		} finally {
			setHistoryLoading((prev) => {
				const next = new Set(prev);
				next.delete(assignmentId);
				return next;
			});
		}
	};

	const handleFileChange = (assignmentId: number, file: File | null) => {
		setSelectedFiles((prev) => ({ ...prev, [assignmentId]: file }));
		setUploadError((prev) => ({ ...prev, [assignmentId]: "" }));
		setUploadSuccess((prev) => ({ ...prev, [assignmentId]: false }));
	};

	const handleSubmit = async (a: Assignment) => {
		const file = selectedFiles[a.id];
		if (!file) {
			setUploadError((prev) => ({
				...prev,
				[a.id]: "ファイルを選択してください",
			}));
			return;
		}

		// 拡張子チェック（クライアント側）
		if (a.allowed_file_types) {
			const allowed = a.allowed_file_types
				.split(",")
				.map((s) => s.trim().toLowerCase());
			const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
			if (!allowed.includes(ext)) {
				setUploadError((prev) => ({
					...prev,
					[a.id]: `許可されていないファイル形式です。使用可能: ${a.allowed_file_types}`,
				}));
				return;
			}
		}

		// サイズチェック（クライアント側）
		if (file.size > a.max_file_size_mb * 1024 * 1024) {
			setUploadError((prev) => ({
				...prev,
				[a.id]: `ファイルサイズが上限（${a.max_file_size_mb}MB）を超えています`,
			}));
			return;
		}

		setUploadingId(a.id);
		const formData = new FormData();
		formData.append("file", file);
		try {
			await axios.post(`/assignments/${a.id}/submissions`, formData, {
				headers: { "Content-Type": "multipart/form-data" },
			});
			setUploadSuccess((prev) => ({ ...prev, [a.id]: true }));
			setSelectedFiles((prev) => ({ ...prev, [a.id]: null }));
			if (fileInputRefs.current[a.id]) {
				fileInputRefs.current[a.id]!.value = "";
			}
			// データ再取得
			await fetchAllAssignments(lessons.map((l) => l.id));
			await fetchHistory(a.id);
		} catch (e: any) {
			const detail = e?.response?.data?.detail;
			setUploadError((prev) => ({
				...prev,
				[a.id]:
					typeof detail === "string" ? detail : "提出に失敗しました",
			}));
		} finally {
			setUploadingId(null);
		}
	};

	const handleDownload = async (sub: Submission) => {
		try {
			const res = await axios.get(`/submissions/${sub.id}/download`, {
				responseType: "blob",
			});
			const url = window.URL.createObjectURL(new Blob([res.data]));
			const link = document.createElement("a");
			link.href = url;
			link.setAttribute("download", sub.original_filename);
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.URL.revokeObjectURL(url);
		} catch {
			alert("ダウンロードに失敗しました");
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<Loader2 className="w-8 h-8 animate-spin text-primary" />
			</div>
		);
	}

	const assignmentsByLesson = (lessonId: number) =>
		assignments.filter((a) => a.lesson_id === lessonId && a.is_published);

	const publishedLessons = lessons.filter(
		(l) => assignmentsByLesson(l.id).length > 0,
	);

	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
			<div className="container mx-auto px-4 py-8 max-w-3xl">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
						<Upload className="w-8 h-8 text-primary" />
						課題提出
					</h1>
					<p className="text-gray-500 mt-1 text-sm">
						各授業の課題ファイルを提出できます
					</p>
				</div>

				{publishedLessons.length === 0 ? (
					<div className="text-center py-20 text-gray-400">
						<FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
						<p className="text-lg">現在公開されている課題はありません</p>
					</div>
				) : (
					<div className="space-y-4">
						{publishedLessons.map((lesson) => {
							const lAssignments = assignmentsByLesson(lesson.id);
							const submittedInLesson = lAssignments.filter(
								(a) => !!a.my_submission,
							).length;
							const unsubmittedInLesson = lAssignments.length - submittedInLesson;
							const isExpanded = expandedLessons.has(lesson.id);
							return (
								<Card key={lesson.id} className="shadow-sm">
									<CardHeader className="py-4 px-6">
										<button
											type="button"
											className="flex items-center gap-2 text-left w-full"
											onClick={() => {
												const next = new Set(expandedLessons);
												if (isExpanded) next.delete(lesson.id);
												else next.add(lesson.id);
												setExpandedLessons(next);
											}}
										>
											{isExpanded ? (
												<ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
											) : (
												<ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
											)}
											<CardTitle className="text-base font-semibold">
												第{lesson.lesson_number}回: {lesson.title}
											</CardTitle>
											<div className="ml-auto flex items-center gap-2 text-xs">
												<span className="bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">
													提出済み {submittedInLesson}
												</span>
												<span className="bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">
													未提出 {unsubmittedInLesson}
												</span>
												<span className="bg-primary/10 text-primary rounded-full px-2 py-0.5">
													{lAssignments.length}件
												</span>
											</div>
										</button>
									</CardHeader>

									{isExpanded && (
										<CardContent className="px-6 pb-6 space-y-4">
											{lAssignments.map((a) => {
												const overdue = isOverdue(a.due_date);
												const cannotSubmit =
													overdue && !a.allow_late_submission;
												const isUploading = uploadingId === a.id;
												const isAssignExpanded = expandedAssignments.has(a.id);
												const isDetailExpanded =
													expandedAssignmentDetails.has(a.id);

												return (
													<div
														key={a.id}
														className="border border-gray-200 rounded-xl overflow-hidden bg-white"
													>
														{/* 課題ヘッダー */}
														<div className="px-5 py-4">
															<div className="flex items-start justify-between gap-4">
																<div className="flex-1">
																	<h3 className="font-semibold text-gray-800 flex items-center gap-2">
																		{a.my_submission ? (
																			<CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
																		) : (
																			<FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
																		)}
																		{a.title}
																	</h3>
																	<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
																		{a.my_submission ? (
																			<span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">
																				提出済み
																			</span>
																		) : (
																			<span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
																				未提出
																			</span>
																		)}
																		{a.due_date && (
																			<span
																				className={`inline-flex items-center gap-1 ${
																					overdue
																						? "text-red-500"
																						: "text-gray-500"
																				}`}
																			>
																				<Clock className="w-3 h-3" />
																				締切: {fmtDate(a.due_date)}
																				{overdue && " (締切済)"}
																				{overdue && a.allow_late_submission && (
																					<span className="text-orange-500 font-medium">
																						※遅延提出可
																					</span>
																				)}
																			</span>
																		)}
																		<span className="text-gray-400">
																			最大 {a.max_file_size_mb}MB
																		</span>
																		{a.allowed_file_types && (
																			<span className="text-gray-400">
																				許可形式: {a.allowed_file_types}
																			</span>
																		)}
																	</div>
																</div>
																{/* 採点状態 */}
																<div className="flex-shrink-0 text-right space-y-2">
																	<div>
																		{a.due_date ? (
																			<span
																				className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
																					overdue
																						? "bg-red-100 text-red-700"
																						: "bg-slate-100 text-slate-700"
																				}`}
																			>
																				締切 {fmtDate(a.due_date)}
																			</span>
																		) : (
																			<span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
																				締切なし
																			</span>
																		)}
																	</div>
																	{a.my_submission?.score !== undefined &&
																		a.my_submission.score !== null && (
																			<div className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 rounded-full px-3 py-1 text-sm font-bold">
																				<Star className="w-3.5 h-3.5" />
																				{a.my_submission.score}
																				{a.my_submission.max_score
																					? `/${a.my_submission.max_score}`
																					: ""}
																				点
																			</div>
																		)}
																</div>
															</div>

															<div className="mt-2 flex justify-end">
																<Button
																	size="sm"
																	variant="ghost"
																	className="h-7 px-2 text-xs text-gray-500"
																	onClick={() => {
																		const next = new Set(
																			expandedAssignmentDetails,
																		);
																		if (isDetailExpanded) next.delete(a.id);
																		else next.add(a.id);
																		setExpandedAssignmentDetails(next);
																	}}
																>
																	{isDetailExpanded ? "詳細を閉じる" : "詳細を表示"}
																	{isDetailExpanded ? (
																		<ChevronDown className="w-3 h-3 ml-1" />
																	) : (
																		<ChevronRight className="w-3 h-3 ml-1" />
																	)}
																</Button>
															</div>
														</div>

														{isDetailExpanded && (
															<>
																{a.description && (
																	<div className="border-t border-gray-100 px-5 py-3">
																		<p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
																			{a.description}
																		</p>
																	</div>
																)}

																{/* 最新提出情報 */}
																{a.my_submission && (
																	<div className="border-t border-gray-100 px-5 py-3 bg-green-50">
																		<div className="flex items-center justify-between">
																			<div>
																				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
																					<p className="font-semibold text-green-700 flex items-center gap-1">
																						<CheckCircle className="w-3.5 h-3.5" />
																						提出済 (第{a.my_submission.submission_number}版)
																					</p>
																					<p className="text-gray-600">
																						{a.my_submission.original_filename}{" "}
																						({fmtFileSize(a.my_submission.file_size_bytes)})
																					</p>
																					<p className="text-gray-500">
																						提出: {fmtDate(a.my_submission.submitted_at)}
																					</p>
																				</div>
																				{a.my_submission.teacher_comment && (
																					<p className="text-xs text-blue-700 mt-1 bg-blue-50 rounded px-2 py-1">
																						💬 {a.my_submission.teacher_comment}
																					</p>
																				)}
																			</div>
																			<div className="flex items-center gap-2">
																				<Button
																					size="sm"
																					variant="outline"
																					onClick={() => handleDownload(a.my_submission!)}
																					className="text-xs"
																				>
																					<Download className="w-3.5 h-3.5 mr-1" />
																					DL
																				</Button>
																				<Button
																					size="sm"
																					variant="ghost"
																					className="text-xs text-gray-500"
																					onClick={async () => {
																						const next = new Set(expandedAssignments);
																						if (isAssignExpanded) {
																							next.delete(a.id);
																						} else {
																							next.add(a.id);
																							if (!historyByAssignment[a.id]) {
																								await fetchHistory(a.id);
																							}
																						}
																						setExpandedAssignments(next);
																					}}
																				>
																					履歴
																					{isAssignExpanded ? (
																						<ChevronDown className="w-3 h-3 ml-1" />
																					) : (
																						<ChevronRight className="w-3 h-3 ml-1" />
																					)}
																				</Button>
																			</div>
																		</div>
																		{/* 提出履歴 */}
																		{isAssignExpanded && (
																			<div className="mt-3 space-y-1">
																				{historyLoading.has(a.id) ? (
																					<div className="flex justify-center py-2">
																						<Loader2 className="w-4 h-4 animate-spin text-gray-400" />
																					</div>
																				) : (
																					(historyByAssignment[a.id] || []).map((h) => (
																						<div
																							key={h.id}
																							className={`flex items-center justify-between text-xs rounded px-2 py-1 ${
																								h.is_latest
																									? "bg-green-100 text-green-800"
																									: "bg-gray-100 text-gray-500"
																							}`}
																						>
																							<span>
																								第{h.submission_number}版:{" "}
																								{h.original_filename}
																							</span>
																							<span>{fmtDate(h.submitted_at)}</span>
																						</div>
																					))
																				)}
																			</div>
																		)}
																	</div>
																)}

																{/* ファイル提出フォーム */}
																{!cannotSubmit && (
																	<div className="border-t border-gray-100 px-5 py-4">
																		<p className="text-xs font-semibold text-gray-600 mb-2">
																			{a.my_submission ? "再提出" : "ファイルを提出"}
																		</p>
																		<div className="flex items-center gap-3">
																			<label
																				htmlFor={`file-${a.id}`}
																				className="flex-1 flex items-center gap-2 border-2 border-dashed border-gray-300 hover:border-primary/50 rounded-lg px-4 py-3 cursor-pointer transition-colors text-sm text-gray-500 hover:text-primary"
																			>
																				<Upload className="w-4 h-4 flex-shrink-0" />
																				{selectedFiles[a.id]
																					? selectedFiles[a.id]!.name
																					: "クリックまたはドロップ"}
																				<input
																					id={`file-${a.id}`}
																					type="file"
																					className="hidden"
																					ref={(el) => {
																						fileInputRefs.current[a.id] = el;
																					}}
																					accept={a.allowed_file_types || "*"}
																					onChange={(e) =>
																						handleFileChange(
																							a.id,
																							e.target.files?.[0] ?? null,
																						)
																					}
																				/>
																			</label>
																			<Button
																				disabled={!selectedFiles[a.id] || isUploading}
																				onClick={() => handleSubmit(a)}
																				className="flex-shrink-0"
																			>
																				{isUploading ? (
																					<Loader2 className="w-4 h-4 animate-spin mr-2" />
																				) : (
																					<Upload className="w-4 h-4 mr-2" />
																				)}
																				提出
																			</Button>
																		</div>

																		{/* エラー */}
																		{uploadError[a.id] && (
																			<div className="mt-2 flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-2">
																				<AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
																				{uploadError[a.id]}
																			</div>
																		)}

																		{/* 成功 */}
																		{uploadSuccess[a.id] && (
																			<div className="mt-2 flex items-center gap-2 text-xs text-green-600 bg-green-50 rounded-lg p-2">
																				<CheckCircle className="w-3.5 h-3.5" />
																				提出が完了しました！
																			</div>
																		)}
																	</div>
																)}

																{/* 締切後・再提出不可 */}
																{cannotSubmit && (
																	<div className="border-t border-gray-100 px-5 py-3 bg-red-50 text-xs text-red-600 flex items-center gap-2">
																		<AlertCircle className="w-3.5 h-3.5" />
																		提出期限が過ぎました（再提出不可）
																	</div>
																)}
															</>
														)}
													</div>
												);
											})}
										</CardContent>
									)}
								</Card>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
