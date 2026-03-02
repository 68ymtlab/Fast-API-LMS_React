"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import axios from "@/lib/axios";

type Semester = {
	id: number;
	name: string;
	sort_order: number | null;
};

type SubjectCategory = {
	id: number;
	name: string;
	description: string | null;
};

type Subject = {
	id: number;
	subject_name: string;
	academic_year: number;
	semester_id: number;
	is_active: boolean;
	semester: Semester;
};

type Course = {
	id: number;
	course_name: string;
	description: string | null;
	session_count: number | null;
	start_date_time: string;
	end_date_time: string;
	is_active: boolean;
	subject_id: number | null;
};

const toInputDateTime = (raw: string) => {
	if (!raw) return "";
	const date = new Date(raw);
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	const hour = `${date.getHours()}`.padStart(2, "0");
	const minute = `${date.getMinutes()}`.padStart(2, "0");
	return `${year}-${month}-${day}T${hour}:${minute}`;
};

const AdminCoursesPage = () => {
	const [subjects, setSubjects] = useState<Subject[]>([]);
	const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
	const [courses, setCourses] = useState<Course[]>([]);
	const [loading, setLoading] = useState(false);
	const [courseLoading, setCourseLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [semesters, setSemesters] = useState<Semester[]>([]);
	const [subjectCategories, setSubjectCategories] = useState<SubjectCategory[]>([]);

	const [subjectDialogOpen, setSubjectDialogOpen] = useState(false);
	const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
	const [subjectForm, setSubjectForm] = useState({
		subject_name: "",
		academic_year: "",
		semester_id: "",
		is_active: true,
	});
	const [subjectSaving, setSubjectSaving] = useState(false);

	const [createSubjectDialogOpen, setCreateSubjectDialogOpen] = useState(false);
	const [createSubjectForm, setCreateSubjectForm] = useState({
		subject_name: "",
		academic_year: String(new Date().getFullYear()),
		semester_id: "",
		subject_category_id: "",
		credits: "",
		code: "",
		learning_goal: "",
		summary: "",
		prerequisites: "",
		behavioral_objectives: "{}",
		achievement_targets: "{}",
	});
	const [createSubjectSaving, setCreateSubjectSaving] = useState(false);
	const [createSubjectError, setCreateSubjectError] = useState<string | null>(null);

	const [courseDialogOpen, setCourseDialogOpen] = useState(false);
	const [editingCourse, setEditingCourse] = useState<Course | null>(null);
	const [courseForm, setCourseForm] = useState({
		course_name: "",
		description: "",
		session_count: "",
		start_date_time: "",
		end_date_time: "",
		is_active: true,
	});
	const [courseSaving, setCourseSaving] = useState(false);

	const selectedSubject = useMemo(
		() => subjects.find((s) => s.id === selectedSubjectId) ?? null,
		[subjects, selectedSubjectId],
	);

	const fetchSubjects = async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await axios.get<Subject[]>("/subjects", {
				withCredentials: true,
			});
			setSubjects(response.data);
			if (response.data.length > 0 && selectedSubjectId === null) {
				setSelectedSubjectId(response.data[0].id);
			}
		} catch (_error) {
			setError("科目一覧の取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const fetchMasterData = async () => {
		try {
			const [semRes, catRes] = await Promise.all([
				axios.get<Semester[]>("/semesters", { withCredentials: true }),
				axios.get<SubjectCategory[]>("/subject-categories", { withCredentials: true }),
			]);
			setSemesters(semRes.data);
			setSubjectCategories(catRes.data);
		} catch (_error) {
			// マスタデータ取得失敗は致命的でないため無視
		}
	};

	const fetchCoursesBySubject = async (subjectId: number) => {
		setCourseLoading(true);
		setError(null);
		try {
			const response = await axios.get<Course[]>(
				`/admin/courses/by-subject/${subjectId}`,
				{
					withCredentials: true,
				},
			);
			setCourses(response.data);
		} catch (_error) {
			setError("コース一覧の取得に失敗しました");
		} finally {
			setCourseLoading(false);
		}
	};

	useEffect(() => {
		fetchSubjects();
		fetchMasterData();
	}, []);

	useEffect(() => {
		if (selectedSubjectId !== null) {
			fetchCoursesBySubject(selectedSubjectId);
		}
	}, [selectedSubjectId]);

	const openCreateSubject = () => {
		setCreateSubjectForm({
			subject_name: "",
			academic_year: String(new Date().getFullYear()),
			semester_id: semesters.length > 0 ? String(semesters[0].id) : "",
			subject_category_id: subjectCategories.length > 0 ? String(subjectCategories[0].id) : "",
			credits: "",
			code: "",
			learning_goal: "",
			summary: "",
			prerequisites: "",
			behavioral_objectives: "{}",
			achievement_targets: "{}",
		});
		setCreateSubjectError(null);
		setCreateSubjectDialogOpen(true);
	};

	const saveCreateSubject = async () => {
		setCreateSubjectError(null);
		let behavioralObj: object;
		let achievementObj: object;
		try {
			behavioralObj = JSON.parse(createSubjectForm.behavioral_objectives);
			achievementObj = JSON.parse(createSubjectForm.achievement_targets);
		} catch {
			setCreateSubjectError("到達目標のJSON形式が正しくありません");
			return;
		}
		setCreateSubjectSaving(true);
		try {
			const body = {
				subject: {
					subject_name: createSubjectForm.subject_name,
					academic_year: Number.parseInt(createSubjectForm.academic_year, 10),
					semester_id: Number.parseInt(createSubjectForm.semester_id, 10),
					is_active: true,
				},
				syllabus: {
					subject_category_id: Number.parseInt(createSubjectForm.subject_category_id, 10),
					credits: Number.parseInt(createSubjectForm.credits, 10),
					code: createSubjectForm.code,
					learning_goal: createSubjectForm.learning_goal,
					summary: createSubjectForm.summary,
					prerequisites: createSubjectForm.prerequisites,
					behavioral_objectives: behavioralObj,
					achievement_targets: achievementObj,
				},
			};
			await axios.post("/subjects", body, { withCredentials: true });
			setCreateSubjectDialogOpen(false);
			await fetchSubjects();
		} catch (_error) {
			setCreateSubjectError("科目の作成に失敗しました");
		} finally {
			setCreateSubjectSaving(false);
		}
	};

	const openSubjectEdit = (subject: Subject) => {
		setEditingSubject(subject);
		setSubjectForm({
			subject_name: subject.subject_name,
			academic_year: String(subject.academic_year),
			semester_id: String(subject.semester_id),
			is_active: subject.is_active,
		});
		setSubjectDialogOpen(true);
	};

	const saveSubject = async () => {
		if (!editingSubject) return;
		setSubjectSaving(true);
		try {
			await axios.put(
				`/subjects/${editingSubject.id}`,
				{
					subject_name: subjectForm.subject_name,
					academic_year: Number.parseInt(subjectForm.academic_year, 10),
					semester_id: Number.parseInt(subjectForm.semester_id, 10),
					is_active: subjectForm.is_active,
				},
				{ withCredentials: true },
			);
			setSubjectDialogOpen(false);
			await fetchSubjects();
			if (selectedSubjectId !== null) {
				await fetchCoursesBySubject(selectedSubjectId);
			}
		} catch (_error) {
			setError("科目の更新に失敗しました");
		} finally {
			setSubjectSaving(false);
		}
	};

	const openCourseEdit = (course: Course) => {
		setEditingCourse(course);
		setCourseForm({
			course_name: course.course_name,
			description: course.description ?? "",
			session_count: course.session_count ? String(course.session_count) : "",
			start_date_time: toInputDateTime(course.start_date_time),
			end_date_time: toInputDateTime(course.end_date_time),
			is_active: course.is_active,
		});
		setCourseDialogOpen(true);
	};

	const saveCourse = async () => {
		if (!editingCourse || selectedSubjectId === null) return;
		setCourseSaving(true);
		try {
			await axios.put(
				`/courses/${editingCourse.id}`,
				{
					course_name: courseForm.course_name,
					description: courseForm.description || null,
					session_count: courseForm.session_count
						? Number.parseInt(courseForm.session_count, 10)
						: null,
					start_date_time: courseForm.start_date_time
						? `${courseForm.start_date_time}:00`
						: null,
					end_date_time: courseForm.end_date_time
						? `${courseForm.end_date_time}:00`
						: null,
					is_active: courseForm.is_active,
				},
				{ withCredentials: true },
			);
			setCourseDialogOpen(false);
			await fetchCoursesBySubject(selectedSubjectId);
		} catch (_error) {
			setError("コースの更新に失敗しました");
		} finally {
			setCourseSaving(false);
		}
	};

	return (
		<div className="p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-bold">科目・コース管理</h1>
				<p className="text-sm text-muted-foreground">
					全科目と配下コースの表示・編集を行います。
				</p>
			</div>

			{error ? <p className="text-sm text-red-500">{error}</p> : null}

			<div className="grid gap-6 lg:grid-cols-3">
				<Card className="lg:col-span-1">
					<CardHeader>
						<div className="flex items-center justify-between">
							<div>
								<CardTitle>科目一覧</CardTitle>
								<CardDescription>科目を選択してコースを表示</CardDescription>
							</div>
							<Button size="sm" onClick={openCreateSubject}>
								<Plus className="h-4 w-4 mr-1" />
								科目追加
							</Button>
						</div>
					</CardHeader>
					<CardContent className="space-y-2">
						{loading ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" /> 読み込み中...
							</div>
						) : (
							subjects.map((subject) => (
								<div
									key={subject.id}
									className={`rounded-md border p-3 ${
										selectedSubjectId === subject.id
											? "border-primary"
											: "border-border"
									}`}
								>
									<div className="flex items-start justify-between gap-3">
										<button
											type="button"
											onClick={() => setSelectedSubjectId(subject.id)}
											className="text-left flex-1"
										>
											<p className="font-medium">{subject.subject_name}</p>
											<p className="text-xs text-muted-foreground">
												{subject.academic_year}年 / {subject.semester?.name}
											</p>
										</button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => openSubjectEdit(subject)}
										>
											<Pencil className="h-4 w-4" />
										</Button>
									</div>
								</div>
							))
						)}
					</CardContent>
				</Card>

				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>
							{selectedSubject
								? `${selectedSubject.subject_name} のコース`
								: "コース一覧"}
						</CardTitle>
						<CardDescription>選択した科目に紐づく全コース</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						{courseLoading ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" /> 読み込み中...
							</div>
						) : courses.length === 0 ? (
							<p className="text-sm text-muted-foreground">コースがありません</p>
						) : (
							courses.map((course) => (
								<div
									key={course.id}
									className="rounded-md border border-border p-3"
								>
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="font-medium">{course.course_name}</p>
											<p className="text-xs text-muted-foreground">
												{new Date(course.start_date_time).toLocaleDateString("ja-JP")} 〜 {" "}
												{new Date(course.end_date_time).toLocaleDateString("ja-JP")}
											</p>
											<p className="text-xs text-muted-foreground">
												{course.is_active ? "公開中" : "非公開"}
											</p>
										</div>
										<Button
											variant="outline"
											size="sm"
											onClick={() => openCourseEdit(course)}
										>
											<Pencil className="h-4 w-4" />
										</Button>
									</div>
								</div>
							))
						)}
					</CardContent>
				</Card>
			</div>

			{/* 科目新規作成ダイアログ */}
			<Dialog open={createSubjectDialogOpen} onOpenChange={setCreateSubjectDialogOpen}>
				<DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>科目新規作成</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">科目情報</p>
						<div className="space-y-2">
							<Label htmlFor="c_subject_name">科目名 <span className="text-red-500">*</span></Label>
							<Input
								id="c_subject_name"
								value={createSubjectForm.subject_name}
								onChange={(e) => setCreateSubjectForm((p) => ({ ...p, subject_name: e.target.value }))}
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-2">
								<Label htmlFor="c_academic_year">開講年 <span className="text-red-500">*</span></Label>
								<Input
									id="c_academic_year"
									type="number"
									value={createSubjectForm.academic_year}
									onChange={(e) => setCreateSubjectForm((p) => ({ ...p, academic_year: e.target.value }))}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="c_semester_id">学期 <span className="text-red-500">*</span></Label>
								<select
									id="c_semester_id"
									value={createSubjectForm.semester_id}
									onChange={(e) => setCreateSubjectForm((p) => ({ ...p, semester_id: e.target.value }))}
									className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
								>
									<option value="">選択してください</option>
									{semesters.map((s) => (
										<option key={s.id} value={s.id}>{s.name}</option>
									))}
								</select>
							</div>
						</div>
						<hr />
						<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">シラバス情報</p>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-2">
								<Label htmlFor="c_category">授業科目区分 <span className="text-red-500">*</span></Label>
								<select
									id="c_category"
									value={createSubjectForm.subject_category_id}
									onChange={(e) => setCreateSubjectForm((p) => ({ ...p, subject_category_id: e.target.value }))}
									className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
								>
									<option value="">選択してください</option>
									{subjectCategories.map((c) => (
										<option key={c.id} value={c.id}>{c.name}</option>
									))}
								</select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="c_credits">単位数 <span className="text-red-500">*</span></Label>
								<Input
									id="c_credits"
									type="number"
									min="1"
									value={createSubjectForm.credits}
									onChange={(e) => setCreateSubjectForm((p) => ({ ...p, credits: e.target.value }))}
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="c_code">科目コード <span className="text-red-500">*</span></Label>
							<Input
								id="c_code"
								value={createSubjectForm.code}
								onChange={(e) => setCreateSubjectForm((p) => ({ ...p, code: e.target.value }))}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="c_learning_goal">学習・教育目標 <span className="text-red-500">*</span></Label>
							<Textarea
								id="c_learning_goal"
								rows={2}
								value={createSubjectForm.learning_goal}
								onChange={(e) => setCreateSubjectForm((p) => ({ ...p, learning_goal: e.target.value }))}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="c_summary">授業の概要 <span className="text-red-500">*</span></Label>
							<Textarea
								id="c_summary"
								rows={2}
								value={createSubjectForm.summary}
								onChange={(e) => setCreateSubjectForm((p) => ({ ...p, summary: e.target.value }))}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="c_prerequisites">履修に必要な予備知識 <span className="text-red-500">*</span></Label>
							<Textarea
								id="c_prerequisites"
								rows={2}
								value={createSubjectForm.prerequisites}
								onChange={(e) => setCreateSubjectForm((p) => ({ ...p, prerequisites: e.target.value }))}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="c_behavioral">理想的な達成レベル (JSON) <span className="text-red-500">*</span></Label>
							<Textarea
								id="c_behavioral"
								rows={2}
								className="font-mono text-sm"
								value={createSubjectForm.behavioral_objectives}
								onChange={(e) => setCreateSubjectForm((p) => ({ ...p, behavioral_objectives: e.target.value }))}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="c_achievement">標準的な達成レベル (JSON) <span className="text-red-500">*</span></Label>
							<Textarea
								id="c_achievement"
								rows={2}
								value={createSubjectForm.achievement_targets}
								onChange={(e) => setCreateSubjectForm((p) => ({ ...p, achievement_targets: e.target.value }))}
							/>
						</div>
						{createSubjectError ? (
							<p className="text-sm text-red-500">{createSubjectError}</p>
						) : null}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setCreateSubjectDialogOpen(false)}>
							キャンセル
						</Button>
						<Button onClick={saveCreateSubject} disabled={createSubjectSaving}>
							{createSubjectSaving ? "作成中..." : "作成"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={subjectDialogOpen} onOpenChange={setSubjectDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>科目編集</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="subject_name">科目名</Label>
							<Input
								id="subject_name"
								value={subjectForm.subject_name}
								onChange={(e) =>
									setSubjectForm((prev) => ({
										...prev,
										subject_name: e.target.value,
									}))
								}
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-2">
								<Label htmlFor="academic_year">開講年</Label>
								<Input
									id="academic_year"
									type="number"
									value={subjectForm.academic_year}
									onChange={(e) =>
										setSubjectForm((prev) => ({
											...prev,
											academic_year: e.target.value,
										}))
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="semester_id">学期ID</Label>
								<Input
									id="semester_id"
									type="number"
									value={subjectForm.semester_id}
									onChange={(e) =>
										setSubjectForm((prev) => ({
											...prev,
											semester_id: e.target.value,
										}))
									}
								/>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<input
								id="subject_active"
								type="checkbox"
								checked={subjectForm.is_active}
								onChange={(e) =>
									setSubjectForm((prev) => ({
										...prev,
										is_active: e.target.checked,
									}))
								}
							/>
							<Label htmlFor="subject_active">有効にする</Label>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setSubjectDialogOpen(false)}>
							キャンセル
						</Button>
						<Button onClick={saveSubject} disabled={subjectSaving}>
							{subjectSaving ? "保存中..." : "保存"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={courseDialogOpen} onOpenChange={setCourseDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>コース編集</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="course_name">コース名</Label>
							<Input
								id="course_name"
								value={courseForm.course_name}
								onChange={(e) =>
									setCourseForm((prev) => ({
										...prev,
										course_name: e.target.value,
									}))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="course_description">概要</Label>
							<Input
								id="course_description"
								value={courseForm.description}
								onChange={(e) =>
									setCourseForm((prev) => ({
										...prev,
										description: e.target.value,
									}))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="course_session_count">セッション数</Label>
							<Input
								id="course_session_count"
								type="number"
								value={courseForm.session_count}
								onChange={(e) =>
									setCourseForm((prev) => ({
										...prev,
										session_count: e.target.value,
									}))
								}
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-2">
								<Label htmlFor="course_start">開始日時</Label>
								<Input
									id="course_start"
									type="datetime-local"
									value={courseForm.start_date_time}
									onChange={(e) =>
										setCourseForm((prev) => ({
											...prev,
											start_date_time: e.target.value,
										}))
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="course_end">終了日時</Label>
								<Input
									id="course_end"
									type="datetime-local"
									value={courseForm.end_date_time}
									onChange={(e) =>
										setCourseForm((prev) => ({
											...prev,
											end_date_time: e.target.value,
										}))
									}
								/>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<input
								id="course_active"
								type="checkbox"
								checked={courseForm.is_active}
								onChange={(e) =>
									setCourseForm((prev) => ({
										...prev,
										is_active: e.target.checked,
									}))
								}
							/>
							<Label htmlFor="course_active">有効にする</Label>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setCourseDialogOpen(false)}>
							キャンセル
						</Button>
						<Button onClick={saveCourse} disabled={courseSaving}>
							{courseSaving ? "保存中..." : "保存"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};

export default AdminCoursesPage;
