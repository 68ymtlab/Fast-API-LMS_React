"use client";

import { Loader2, Pencil } from "lucide-react";
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

	const [subjectDialogOpen, setSubjectDialogOpen] = useState(false);
	const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
	const [subjectForm, setSubjectForm] = useState({
		subject_name: "",
		academic_year: "",
		semester_id: "",
		is_active: true,
	});
	const [subjectSaving, setSubjectSaving] = useState(false);

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
	}, []);

	useEffect(() => {
		if (selectedSubjectId !== null) {
			fetchCoursesBySubject(selectedSubjectId);
		}
	}, [selectedSubjectId]);

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
						<CardTitle>科目一覧</CardTitle>
						<CardDescription>科目を選択してコースを表示</CardDescription>
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
