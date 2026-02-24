"use client";
import {
	CheckCircle,
	ChevronDown,
	ChevronRight,
	Clock,
	Download,
	Eye,
	EyeOff,
	FileText,
	Loader2,
	Plus,
	Star,
	Trash2,
	Upload,
	Users,
	X,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

// ── 型定義 ──────────────────────────────────────────
interface Assignment {
	id: number;
	lesson_id: number;
	title: string;
	description: string | null;
	is_published: boolean;
	publish_start_at: string | null;
	publish_end_at: string | null;
	due_date: string | null;
	allow_late_submission: boolean;
	max_file_size_mb: number;
	allowed_file_types: string | null;
	display_order: number;
	submission_count: number;
}

interface Submission {
	id: number;
	assignment_id: number;
	student_user_id: number;
	original_filename: string;
	file_size_bytes: number | null;
	content_type: string | null;
	submission_number: number;
	is_latest: boolean;
	score: number | null;
	max_score: number | null;
	teacher_comment: string | null;
	graded_at: string | null;
	submitted_at: string;
	student_display_name: string | null;
	student_email: string | null;
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

// ── メインコンポーネント ──────────────────────────────
export default function AssignmentsPage() {
	const params = useParams();
	const router = useRouter();
	const courseId = params.course_id as string;

	// ---------- state ----------
	const [lessons, setLessons] = useState<Lesson[]>([]);
	const [assignments, setAssignments] = useState<Assignment[]>([]);
	const [selectedLesson, setSelectedLesson] = useState<number | null>(null);
	const [expandedLessons, setExpandedLessons] = useState<Set<number>>(new Set());
	const [loading, setLoading] = useState(true);

	// 課題作成・編集ダイアログ
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<Assignment | null>(null);
	const [form, setForm] = useState({
		title: "",
		description: "",
		is_published: false,
		publish_start_at: "",
		publish_end_at: "",
		due_date: "",
		allow_late_submission: true,
		max_file_size_mb: 50,
		allowed_file_types: "",
		display_order: 1,
		lesson_id: 0,
	});
	const [formError, setFormError] = useState<string | null>(null);
	const [formLoading, setFormLoading] = useState(false);

	// 提出一覧ダイアログ
	const [submissionDialogOpen, setSubmissionDialogOpen] = useState(false);
	const [submissionTarget, setSubmissionTarget] = useState<Assignment | null>(null);
	const [submissions, setSubmissions] = useState<Submission[]>([]);
	const [submissionsLoading, setSubmissionsLoading] = useState(false);

	// 採点ダイアログ
	const [gradeDialogOpen, setGradeDialogOpen] = useState(false);
	const [gradeTarget, setGradeTarget] = useState<Submission | null>(null);
	const [gradeForm, setGradeForm] = useState({
		score: "",
		max_score: "",
		teacher_comment: "",
	});
	const [gradeLoading, setGradeLoading] = useState(false);

	// ---------- データ取得 ----------
	useEffect(() => {
		if (courseId) {
			fetchLessons();
		}
	}, [courseId]);

	const fetchLessons = async () => {
		try {
			const res = await axios.get(`/courses/${courseId}/lessons`);
			setLessons(res.data);
			if (res.data.length > 0) {
				await fetchAllAssignments(res.data.map((l: Lesson) => l.id));
			}
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
					const res = await axios.get(
						`/lessons/${lid}/assignments?include_unpublished=true`,
					);
					all.push(...res.data);
				} catch {
					// ignore
				}
			}),
		);
		setAssignments(all.sort((a, b) => a.display_order - b.display_order));
	};

	// ---------- 課題作成・編集 ----------
	const openCreate = (lessonId: number) => {
		setEditTarget(null);
		setForm({
			title: "",
			description: "",
			is_published: false,
			publish_start_at: "",
			publish_end_at: "",
			due_date: "",
			allow_late_submission: true,
			max_file_size_mb: 50,
			allowed_file_types: "",
			display_order: 1,
			lesson_id: lessonId,
		});
		setFormError(null);
		setIsCreateOpen(true);
	};

	const openEdit = (a: Assignment) => {
		setEditTarget(a);
		setForm({
			title: a.title,
			description: a.description ?? "",
			is_published: a.is_published,
			publish_start_at: a.publish_start_at
				? new Date(a.publish_start_at).toISOString().slice(0, 16)
				: "",
			publish_end_at: a.publish_end_at
				? new Date(a.publish_end_at).toISOString().slice(0, 16)
				: "",
			due_date: a.due_date
				? new Date(a.due_date).toISOString().slice(0, 16)
				: "",
			allow_late_submission: a.allow_late_submission,
			max_file_size_mb: a.max_file_size_mb,
			allowed_file_types: a.allowed_file_types ?? "",
			display_order: a.display_order,
			lesson_id: a.lesson_id,
		});
		setFormError(null);
		setIsCreateOpen(true);
	};

	const handleSave = async () => {
		if (!form.title.trim()) {
			setFormError("タイトルは必須です");
			return;
		}
		setFormLoading(true);
		setFormError(null);
		try {
			const payload = {
				...form,
				lesson_id: form.lesson_id,
				description: form.description || null,
				publish_start_at: form.publish_start_at
					? new Date(form.publish_start_at).toISOString()
					: null,
				publish_end_at: form.publish_end_at
					? new Date(form.publish_end_at).toISOString()
					: null,
				due_date: form.due_date
					? new Date(form.due_date).toISOString()
					: null,
				allowed_file_types: form.allowed_file_types || null,
			};

			if (editTarget) {
				await axios.put(`/assignments/${editTarget.id}`, payload);
			} else {
				await axios.post(`/lessons/${form.lesson_id}/assignments`, payload);
			}
			setIsCreateOpen(false);
			await fetchAllAssignments(lessons.map((l) => l.id));
		} catch (e: any) {
			const detail = e?.response?.data?.detail;
			setFormError(typeof detail === "string" ? detail : "保存に失敗しました");
		} finally {
			setFormLoading(false);
		}
	};

	const handleTogglePublish = async (a: Assignment) => {
		try {
			await axios.put(`/assignments/${a.id}`, {
				is_published: !a.is_published,
			});
			await fetchAllAssignments(lessons.map((l) => l.id));
		} catch (e) {
			console.error(e);
		}
	};

	const handleDelete = async (a: Assignment) => {
		if (!confirm(`「${a.title}」を削除しますか？`)) return;
		try {
			await axios.delete(`/assignments/${a.id}`);
			await fetchAllAssignments(lessons.map((l) => l.id));
		} catch (e) {
			console.error(e);
		}
	};

	// ---------- 提出一覧 ----------
	const openSubmissions = async (a: Assignment) => {
		setSubmissionTarget(a);
		setSubmissionsLoading(true);
		setSubmissionDialogOpen(true);
		try {
			const res = await axios.get(`/assignments/${a.id}/submissions?latest_only=true`);
			setSubmissions(res.data);
		} catch (e) {
			console.error(e);
		} finally {
			setSubmissionsLoading(false);
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
		} catch (e) {
			alert("ダウンロードに失敗しました");
		}
	};

	// ---------- 採点 ----------
	const openGrade = (sub: Submission) => {
		setGradeTarget(sub);
		setGradeForm({
			score: sub.score !== null ? String(sub.score) : "",
			max_score: sub.max_score !== null ? String(sub.max_score) : "100",
			teacher_comment: sub.teacher_comment ?? "",
		});
		setGradeDialogOpen(true);
	};

	const handleGrade = async () => {
		if (!gradeTarget) return;
		setGradeLoading(true);
		try {
			await axios.put(`/submissions/${gradeTarget.id}/grade`, {
				score: gradeForm.score !== "" ? parseFloat(gradeForm.score) : null,
				max_score:
					gradeForm.max_score !== "" ? parseFloat(gradeForm.max_score) : null,
				teacher_comment: gradeForm.teacher_comment || null,
			});
			setGradeDialogOpen(false);
			// 提出一覧を再取得
			if (submissionTarget) {
				const res = await axios.get(
					`/assignments/${submissionTarget.id}/submissions?latest_only=true`,
				);
				setSubmissions(res.data);
			}
		} catch (e) {
			alert("採点の保存に失敗しました");
		} finally {
			setGradeLoading(false);
		}
	};

	// ---------- レンダリング ----------
	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<Loader2 className="w-8 h-8 animate-spin text-primary" />
			</div>
		);
	}

	const assignmentsByLesson = (lessonId: number) =>
		assignments.filter((a) => a.lesson_id === lessonId);

	return (
		<div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
			<div className="container mx-auto px-4 py-8 max-w-5xl">
				{/* ヘッダー */}
				<div className="flex items-center justify-between mb-8">
					<div>
						<h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
							<FileText className="w-8 h-8 text-primary" />
							課題管理
						</h1>
						<p className="text-gray-500 mt-1 text-sm">
							各レッスンの課題を作成・管理します
						</p>
					</div>
					<Button variant="outline" onClick={() => router.back()}>
						← 戻る
					</Button>
				</div>

				{/* レッスン別課題リスト */}
				<div className="space-y-4">
					{lessons.map((lesson) => {
						const lessonAssignments = assignmentsByLesson(lesson.id);
						const isExpanded = expandedLessons.has(lesson.id);
						return (
							<Card key={lesson.id} className="shadow-sm">
								<CardHeader className="py-4 px-6">
									<div className="flex items-center justify-between">
										<button
											type="button"
											className="flex items-center gap-2 text-left flex-1"
											onClick={() => {
												const next = new Set(expandedLessons);
												if (isExpanded) next.delete(lesson.id);
												else next.add(lesson.id);
												setExpandedLessons(next);
											}}
										>
											{isExpanded ? (
												<ChevronDown className="w-5 h-5 text-gray-400" />
											) : (
												<ChevronRight className="w-5 h-5 text-gray-400" />
											)}
											<CardTitle className="text-base font-semibold">
												第{lesson.lesson_number}回: {lesson.title}
											</CardTitle>
											<span className="ml-2 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
												{lessonAssignments.length}件
											</span>
										</button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => openCreate(lesson.id)}
											className="ml-4 flex items-center gap-1"
										>
											<Plus className="w-4 h-4" />
											課題を追加
										</Button>
									</div>
								</CardHeader>

								{isExpanded && (
									<CardContent className="px-6 pb-6">
										{lessonAssignments.length === 0 ? (
											<p className="text-sm text-gray-400 text-center py-4">
												課題がまだありません
											</p>
										) : (
											<div className="space-y-3">
												{lessonAssignments
													.sort((a, b) => a.display_order - b.display_order)
													.map((a) => (
														<div
															key={a.id}
															className="flex items-start gap-4 p-4 border border-gray-200 rounded-xl hover:border-primary/30 transition-colors bg-white"
														>
															{/* 公開状態バッジ */}
															<div className="mt-1">
																{a.is_published ? (
																	<span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">
																		<Eye className="w-3 h-3" />
																		公開
																	</span>
																) : (
																	<span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
																		<EyeOff className="w-3 h-3" />
																		非公開
																	</span>
																)}
															</div>

															{/* 内容 */}
															<div className="flex-1 min-w-0">
																<p className="font-semibold text-gray-800 truncate">
																	{a.title}
																</p>
																<div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
																	{a.due_date && (
																		<span className="flex items-center gap-1">
																			<Clock className="w-3 h-3" />
																			締切: {fmtDate(a.due_date)}
																		</span>
																	)}
																	<span className="flex items-center gap-1">
																		<Users className="w-3 h-3" />
																		提出数: {a.submission_count}件
																	</span>
																	<span>最大 {a.max_file_size_mb}MB</span>
																</div>
															</div>

															{/* 操作ボタン */}
															<div className="flex items-center gap-2 flex-shrink-0">
																<Button
																	size="sm"
																	variant="outline"
																	onClick={() => openSubmissions(a)}
																	title="提出一覧"
																>
																	<Users className="w-4 h-4" />
																</Button>
																<Button
																	size="sm"
																	variant="outline"
																	onClick={() => handleTogglePublish(a)}
																	title={a.is_published ? "非公開にする" : "公開する"}
																>
																	{a.is_published ? (
																		<EyeOff className="w-4 h-4" />
																	) : (
																		<Eye className="w-4 h-4" />
																	)}
																</Button>
																<Button
																	size="sm"
																	variant="outline"
																	onClick={() => openEdit(a)}
																	title="編集"
																>
																	<FileText className="w-4 h-4" />
																</Button>
																<Button
																	size="sm"
																	variant="outline"
																	onClick={() => handleDelete(a)}
																	title="削除"
																	className="text-red-500 hover:text-red-600"
																>
																	<Trash2 className="w-4 h-4" />
																</Button>
															</div>
														</div>
													))}
											</div>
										)}
									</CardContent>
								)}
							</Card>
						);
					})}
				</div>
			</div>

			{/* ── 課題作成・編集ダイアログ ── */}
			<Dialog open={isCreateOpen} onOpenChange={(o) => !o && setIsCreateOpen(false)}>
				<DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="text-xl font-bold">
							{editTarget ? "課題を編集" : "課題を作成"}
						</DialogTitle>
					</DialogHeader>

					<div className="space-y-4 py-2">
						{formError && (
							<div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg">
								{formError}
							</div>
						)}

						{/* タイトル */}
						<div className="space-y-1">
							<Label htmlFor="assign-title">タイトル *</Label>
							<Input
								id="assign-title"
								value={form.title}
								onChange={(e) => setForm({ ...form, title: e.target.value })}
								placeholder="例: 第1回レポート提出"
							/>
						</div>

						{/* 説明 */}
						<div className="space-y-1">
							<Label htmlFor="assign-desc">課題の説明</Label>
							<textarea
								id="assign-desc"
								value={form.description}
								onChange={(e) =>
									setForm({ ...form, description: e.target.value })
								}
								rows={4}
								className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
								placeholder="提出内容や注意事項を記入..."
							/>
						</div>

						{/* 公開設定 */}
						<div className="bg-gray-50 rounded-lg p-4 space-y-3">
							<h3 className="text-sm font-semibold text-gray-700">公開設定</h3>
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={form.is_published}
									onChange={(e) =>
										setForm({ ...form, is_published: e.target.checked })
									}
									className="w-4 h-4 accent-primary"
								/>
								<span className="text-sm">公開する</span>
							</label>
							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1">
									<Label htmlFor="pub-start" className="text-xs text-gray-600">
										公開開始日時
									</Label>
									<Input
										id="pub-start"
										type="datetime-local"
										value={form.publish_start_at}
										onChange={(e) =>
											setForm({ ...form, publish_start_at: e.target.value })
										}
										className="text-sm"
									/>
								</div>
								<div className="space-y-1">
									<Label htmlFor="pub-end" className="text-xs text-gray-600">
										公開終了日時
									</Label>
									<Input
										id="pub-end"
										type="datetime-local"
										value={form.publish_end_at}
										onChange={(e) =>
											setForm({ ...form, publish_end_at: e.target.value })
										}
										className="text-sm"
									/>
								</div>
							</div>
						</div>

						{/* 提出設定 */}
						<div className="bg-gray-50 rounded-lg p-4 space-y-3">
							<h3 className="text-sm font-semibold text-gray-700">提出設定</h3>
							<div className="space-y-1">
								<Label htmlFor="due-date" className="text-xs text-gray-600">
									提出締切日時
								</Label>
								<Input
									id="due-date"
									type="datetime-local"
									value={form.due_date}
									onChange={(e) =>
										setForm({ ...form, due_date: e.target.value })
									}
									className="text-sm"
								/>
							</div>
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={form.allow_late_submission}
									onChange={(e) =>
										setForm({
											...form,
											allow_late_submission: e.target.checked,
										})
									}
									className="w-4 h-4 accent-primary"
								/>
								<span className="text-sm">締切後の提出を許可する</span>
							</label>
							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1">
									<Label htmlFor="max-size" className="text-xs text-gray-600">
										最大ファイルサイズ（MB）
									</Label>
									<Input
										id="max-size"
										type="number"
										min={1}
										max={500}
										value={form.max_file_size_mb}
										onChange={(e) =>
											setForm({
												...form,
												max_file_size_mb: parseInt(e.target.value) || 50,
											})
										}
										className="text-sm"
									/>
								</div>
								<div className="space-y-1">
									<Label htmlFor="file-types" className="text-xs text-gray-600">
										許可ファイル形式（空欄=全て）
									</Label>
									<Input
										id="file-types"
										value={form.allowed_file_types}
										onChange={(e) =>
											setForm({
												...form,
												allowed_file_types: e.target.value,
											})
										}
										placeholder=".pdf,.docx,.zip"
										className="text-sm"
									/>
								</div>
							</div>
							<div className="space-y-1">
								<Label htmlFor="disp-order" className="text-xs text-gray-600">
									表示順
								</Label>
								<Input
									id="disp-order"
									type="number"
									min={1}
									value={form.display_order}
									onChange={(e) =>
										setForm({
											...form,
											display_order: parseInt(e.target.value) || 1,
										})
									}
									className="text-sm w-24"
								/>
							</div>
						</div>
					</div>

					<DialogFooter className="gap-3">
						<Button
							variant="outline"
							onClick={() => setIsCreateOpen(false)}
							className="h-11"
						>
							キャンセル
						</Button>
						<Button
							onClick={handleSave}
							disabled={formLoading}
							className="h-11 bg-primary hover:bg-primary/90"
						>
							{formLoading ? (
								<Loader2 className="w-4 h-4 animate-spin mr-2" />
							) : null}
							{editTarget ? "更新する" : "作成する"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ── 提出一覧ダイアログ ── */}
			<Dialog
				open={submissionDialogOpen}
				onOpenChange={(o) => !o && setSubmissionDialogOpen(false)}
			>
				<DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="text-xl font-bold flex items-center gap-2">
							<Users className="w-6 h-6 text-primary" />
							提出一覧: {submissionTarget?.title}
						</DialogTitle>
					</DialogHeader>

					{submissionsLoading ? (
						<div className="flex justify-center py-10">
							<Loader2 className="w-8 h-8 animate-spin text-primary" />
						</div>
					) : submissions.length === 0 ? (
						<div className="text-center py-10 text-gray-400">
							<Upload className="w-12 h-12 mx-auto mb-2 opacity-30" />
							<p>まだ提出がありません</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b bg-gray-50">
										<th className="px-4 py-3 text-left text-gray-600 font-semibold">
											学生
										</th>
										<th className="px-4 py-3 text-left text-gray-600 font-semibold">
											ファイル名
										</th>
										<th className="px-4 py-3 text-left text-gray-600 font-semibold">
											サイズ
										</th>
										<th className="px-4 py-3 text-left text-gray-600 font-semibold">
											提出日時
										</th>
										<th className="px-4 py-3 text-center text-gray-600 font-semibold">
											採点
										</th>
										<th className="px-4 py-3 text-center text-gray-600 font-semibold">
											操作
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-100">
									{submissions.map((sub) => (
										<tr key={sub.id} className="hover:bg-gray-50 transition-colors">
											<td className="px-4 py-3">
												<div className="font-medium text-gray-800">
													{sub.student_display_name || "—"}
												</div>
												<div className="text-xs text-gray-400">
													{sub.student_email}
												</div>
											</td>
											<td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
												{sub.original_filename}
											</td>
											<td className="px-4 py-3 text-gray-500">
												{fmtFileSize(sub.file_size_bytes)}
											</td>
											<td className="px-4 py-3 text-gray-500 whitespace-nowrap">
												{fmtDate(sub.submitted_at)}
											</td>
											<td className="px-4 py-3 text-center">
												{sub.score !== null ? (
													<span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-full px-2 py-0.5">
														<Star className="w-3 h-3" />
														{sub.score}/{sub.max_score ?? "—"}
													</span>
												) : sub.teacher_comment ? (
													<span className="text-xs text-yellow-600 bg-yellow-50 rounded-full px-2 py-0.5">
														コメント済
													</span>
												) : (
													<span className="text-xs text-gray-400">未採点</span>
												)}
											</td>
											<td className="px-4 py-3">
												<div className="flex items-center justify-center gap-2">
													<Button
														size="sm"
														variant="outline"
														onClick={() => handleDownload(sub)}
														title="ダウンロード"
													>
														<Download className="w-4 h-4" />
													</Button>
													<Button
														size="sm"
														variant="outline"
														onClick={() => openGrade(sub)}
														title="採点"
														className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
													>
														<Star className="w-4 h-4" />
													</Button>
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setSubmissionDialogOpen(false)}
						>
							閉じる
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ── 採点ダイアログ ── */}
			<Dialog
				open={gradeDialogOpen}
				onOpenChange={(o) => !o && setGradeDialogOpen(false)}
			>
				<DialogContent className="sm:max-w-[480px]">
					<DialogHeader>
						<DialogTitle className="text-xl font-bold flex items-center gap-2">
							<Star className="w-5 h-5 text-yellow-500" />
							採点
						</DialogTitle>
					</DialogHeader>
					{gradeTarget && (
						<div className="space-y-4 py-2">
							<p className="text-sm text-gray-600">
								<span className="font-medium">
									{gradeTarget.student_display_name ?? "学生"}
								</span>{" "}
								の提出: {gradeTarget.original_filename}
							</p>

							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1">
									<Label htmlFor="grade-score">得点</Label>
									<Input
										id="grade-score"
										type="number"
										min={0}
										value={gradeForm.score}
										onChange={(e) =>
											setGradeForm({ ...gradeForm, score: e.target.value })
										}
										placeholder="例: 85"
									/>
								</div>
								<div className="space-y-1">
									<Label htmlFor="grade-max">満点</Label>
									<Input
										id="grade-max"
										type="number"
										min={0}
										value={gradeForm.max_score}
										onChange={(e) =>
											setGradeForm({ ...gradeForm, max_score: e.target.value })
										}
										placeholder="例: 100"
									/>
								</div>
							</div>

							<div className="space-y-1">
								<Label htmlFor="grade-comment">コメント</Label>
								<textarea
									id="grade-comment"
									value={gradeForm.teacher_comment}
									onChange={(e) =>
										setGradeForm({
											...gradeForm,
											teacher_comment: e.target.value,
										})
									}
									rows={4}
									className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
									placeholder="学生へのフィードバック..."
								/>
							</div>
						</div>
					)}
					<DialogFooter className="gap-3">
						<Button
							variant="outline"
							onClick={() => setGradeDialogOpen(false)}
						>
							キャンセル
						</Button>
						<Button
							onClick={handleGrade}
							disabled={gradeLoading}
							className="bg-primary hover:bg-primary/90"
						>
							{gradeLoading ? (
								<Loader2 className="w-4 h-4 animate-spin mr-2" />
							) : (
								<CheckCircle className="w-4 h-4 mr-2" />
							)}
							採点を保存
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
