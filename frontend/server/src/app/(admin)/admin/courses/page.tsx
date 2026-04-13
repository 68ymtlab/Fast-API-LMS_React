"use client";

import { Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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

type SubjectSyllabus = {
	subject_id: number;
	subject_category_id: number;
	credits: number;
	code: string;
	keywords: Record<string, unknown> | null;
	learning_goal: string | null;
	summary: string | null;
	prerequisites: string | null;
	behavioral_objectives: Record<string, unknown> | null;
	achievement_targets: Record<string, unknown> | null;
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

type CourseDuplicateResult = {
	course: Course;
	copied_permissions: number;
	copied_enrollments: number;
	copied_lessons: number;
	copied_lesson_items: number;
	copied_lesson_pages: number;
};

const toInputDateTime = (raw: string) => {
	if (!raw) return "";
	const date = new Date(raw);
	const year = date.getUTCFullYear();
	const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
	const day = `${date.getUTCDate()}`.padStart(2, "0");
	const hour = `${date.getUTCHours()}`.padStart(2, "0");
	const minute = `${date.getUTCMinutes()}`.padStart(2, "0");
	return `${year}-${month}-${day}T${hour}:${minute}`;
};

const formatDate = (raw: string) => {
	if (!raw) return "";
	const date = new Date(raw);
	const year = date.getUTCFullYear();
	const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
	const day = `${date.getUTCDate()}`.padStart(2, "0");
	return `${year}/${month}/${day}`;
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
	const [syllabusForm, setSyllabusForm] = useState({
		subject_category_id: "",
		credits: "",
		code: "",
		learning_goal: "",
		summary: "",
		prerequisites: "",
		behavioral_objectives: "",
		achievement_targets: "",
	});
	const [syllabusLoading, setSyllabusLoading] = useState(false);
	const [syllabusError, setSyllabusError] = useState<string | null>(null);

	const [semesterManageDialogOpen, setSemesterManageDialogOpen] = useState(false);
	const [newSemesterName, setNewSemesterName] = useState("");
	const [newSemesterSortOrder, setNewSemesterSortOrder] = useState("");
	const [semesterSaving, setSemesterSaving] = useState(false);
	const [semesterError, setSemesterError] = useState<string | null>(null);
	const [selectedSemesterForManage, setSelectedSemesterForManage] = useState<string>("");

	const [categoryManageDialogOpen, setCategoryManageDialogOpen] = useState(false);
	const [newCategoryName, setNewCategoryName] = useState("");
	const [newCategoryDescription, setNewCategoryDescription] = useState("");
	const [categorySaving, setCategorySaving] = useState(false);
	const [categoryError, setCategoryError] = useState<string | null>(null);
	const [defaultCategoriesSaving, setDefaultCategoriesSaving] = useState(false);
	const [defaultCategoriesError, setDefaultCategoriesError] = useState<string | null>(null);
	const [selectedCategoryForManage, setSelectedCategoryForManage] = useState<string>("");

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

	const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
	const [duplicatingCourse, setDuplicatingCourse] = useState<Course | null>(null);
	const [duplicateForm, setDuplicateForm] = useState({
		new_course_name: "",
		start_date_time: "",
		end_date_time: "",
		is_active: true,
		include_teacher_permissions: true,
		include_enrollments: false,
		include_lessons_and_materials: true,
		include_inactive_lessons: false,
	});
	const [duplicateSaving, setDuplicateSaving] = useState(false);
	const [duplicateError, setDuplicateError] = useState<string | null>(null);
	const [duplicateSuccess, setDuplicateSuccess] = useState<string | null>(null);

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

	const loadSyllabus = async (subjectId: number) => {
		setSyllabusError(null);
		setSyllabusLoading(true);
		try {
			const res = await axios.get<SubjectSyllabus>(
				`/subjects/${subjectId}/syllabus`,
				{ withCredentials: true },
			);
			setSyllabusForm({
				subject_category_id: res.data.subject_category_id
					? String(res.data.subject_category_id)
					: "",
				credits: res.data.credits ? String(res.data.credits) : "",
				code: res.data.code ?? "",
				learning_goal: res.data.learning_goal ?? "",
				summary: res.data.summary ?? "",
				prerequisites: res.data.prerequisites ?? "",
				behavioral_objectives: res.data.behavioral_objectives
					? JSON.stringify(res.data.behavioral_objectives, null, 2)
					: "{}",
				achievement_targets: res.data.achievement_targets
					? JSON.stringify(res.data.achievement_targets, null, 2)
					: "{}",
			});
		} catch (_error) {
			setSyllabusError("シラバス情報の取得に失敗しました");
		} finally {
			setSyllabusLoading(false);
		}
	};

	const handleCreateSemester = async () => {
		if (!newSemesterName.trim()) {
			setSemesterError("学期名を入力してください");
			return;
		}
		setSemesterError(null);
		setSemesterSaving(true);
		try {
			const body = {
				name: newSemesterName.trim(),
				sort_order: newSemesterSortOrder
					? Number.parseInt(newSemesterSortOrder, 10)
					: null,
			};
			const res = await axios.post<Semester>("/semesters", body, {
				withCredentials: true,
			});
			await fetchMasterData();
			setCreateSubjectForm((p) => ({
				...p,
				semester_id: String(res.data.id),
			}));
			setNewSemesterName("");
			setNewSemesterSortOrder("");
		} catch (_error) {
			setSemesterError("学期の作成に失敗しました");
		} finally {
			setSemesterSaving(false);
		}
	};

	const handleCreateCategory = async () => {
		if (!newCategoryName.trim()) {
			setCategoryError("科目区分名を入力してください");
			return;
		}
		setCategoryError(null);
		setCategorySaving(true);
		try {
			const body = {
				name: newCategoryName.trim(),
				description: newCategoryDescription || null,
			};
			const res = await axios.post<SubjectCategory>("/subject-categories", body, {
				withCredentials: true,
			});
			await fetchMasterData();
			setCreateSubjectForm((p) => ({
				...p,
				subject_category_id: String(res.data.id),
			}));
			setNewCategoryName("");
			setNewCategoryDescription("");
		} catch (_error) {
			setCategoryError("科目区分の作成に失敗しました");
		} finally {
			setCategorySaving(false);
		}
	};

	const handleCreateRequiredAndElectiveCategories = async () => {
		setDefaultCategoriesError(null);
		setDefaultCategoriesSaving(true);
		try {
			const existingNames = new Set(subjectCategories.map((c) => c.name));
			const toCreate: { name: string; description: string }[] = [];

			if (!existingNames.has("必修")) {
				toCreate.push({ name: "必修", description: "必修科目" });
			}
			if (!existingNames.has("選択")) {
				toCreate.push({ name: "選択", description: "選択科目" });
			}

			for (const body of toCreate) {
				// 既に存在するものはスキップされるので、必要なものだけ作成
				// eslint-disable-next-line no-await-in-loop
				await axios.post<SubjectCategory>("/subject-categories", body, {
					withCredentials: true,
				});
			}

			await fetchMasterData();
		} catch (_error) {
			setDefaultCategoriesError("必修/選択区分の作成に失敗しました");
		} finally {
			setDefaultCategoriesSaving(false);
		}
	};

	const handleDeleteSelectedSemester = async () => {
		if (!selectedSemesterForManage) {
			setSemesterError("削除する学期を選択してください");
			return;
		}
		if (!window.confirm("選択中の学期を削除しますか？")) {
			return;
		}
		setSemesterError(null);
		setSemesterSaving(true);
		try {
			await axios.delete(`/semesters/${selectedSemesterForManage}`, {
				withCredentials: true,
			});
			await fetchMasterData();
			setSelectedSemesterForManage("");
		} catch (_error) {
			setSemesterError("学期の削除に失敗しました（使用中の可能性があります）");
		} finally {
			setSemesterSaving(false);
		}
	};

	const handleDeleteSelectedCategory = async () => {
		if (!selectedCategoryForManage) {
			setCategoryError("削除する科目区分を選択してください");
			return;
		}
		if (!window.confirm("選択中の科目区分を削除しますか？")) {
			return;
		}
		setCategoryError(null);
		setCategorySaving(true);
		try {
			await axios.delete(
				`/subject-categories/${selectedCategoryForManage}`,
				{
					withCredentials: true,
				},
			);
			await fetchMasterData();
			setSelectedCategoryForManage("");
		} catch (_error) {
			setCategoryError("科目区分の削除に失敗しました（使用中の可能性があります）");
		} finally {
			setCategorySaving(false);
		}
	};

	const openCreateSubject = () => {
		setCreateSubjectForm({
			subject_name: "",
			academic_year: String(new Date().getFullYear()),
			semester_id: semesters.length > 0 ? String(semesters[0].id) : "",
			subject_category_id:
				subjectCategories.length > 0 ? String(subjectCategories[0].id) : "",
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
			behavioralObj = JSON.parse(createSubjectForm.behavioral_objectives || "{}");
			achievementObj = JSON.parse(createSubjectForm.achievement_targets || "{}");
		} catch {
			setCreateSubjectError("到達目標のJSON形式が正しくありません");
			return;
		}

		// 先にリクエストで使う値を決定しておく（後続の確認にも利用）
		const academicYear =
			Number.parseInt(createSubjectForm.academic_year, 10) ||
			new Date().getFullYear();
		const semesterId =
			Number.parseInt(createSubjectForm.semester_id, 10) ||
			semesters[0]?.id;
		const subjectCategoryId =
			Number.parseInt(createSubjectForm.subject_category_id, 10) ||
			subjectCategories[0]?.id;
		const credits =
			Number.parseInt(createSubjectForm.credits, 10) || 1;
		if (!semesterId || !subjectCategoryId) {
			setCreateSubjectError("学期マスタまたは科目区分マスタが取得できていません。");
			return;
		}

		setCreateSubjectSaving(true);
		try {
			const body = {
				subject: {
					subject_name: createSubjectForm.subject_name,
					academic_year: academicYear,
					semester_id: semesterId,
					is_active: true,
				},
				syllabus: {
					subject_category_id: subjectCategoryId,
					credits,
					code: createSubjectForm.code || "UNSPECIFIED",
					learning_goal: createSubjectForm.learning_goal || "",
					summary: createSubjectForm.summary || "",
					prerequisites: createSubjectForm.prerequisites || "",
					behavioral_objectives: behavioralObj,
					achievement_targets: achievementObj,
				},
			};
			await axios.post("/subjects", body, { withCredentials: true });
			setCreateSubjectDialogOpen(false);
			await fetchSubjects();
		} catch (_error) {
			// API レスポンス上は失敗でも、DB には登録されているケースがあるため、
			// 一度一覧を再取得して「同じ科目が作成されていないか」を確認する
			try {
				const res = await axios.get<Subject[]>("/subjects", {
					withCredentials: true,
				});
				setSubjects(res.data);
				const exists = res.data.some(
					(s) =>
						s.subject_name === createSubjectForm.subject_name &&
						s.academic_year === academicYear &&
						s.semester_id === semesterId,
				);
				if (exists) {
					// 実際には作成されているので成功扱いにする
					setCreateSubjectDialogOpen(false);
					setCreateSubjectError(null);
					return;
				}
			} catch {
				// 一覧取得にも失敗した場合は、もともとのエラー表示をそのまま行う
			}

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
		setSyllabusForm({
			subject_category_id: "",
			credits: "",
			code: "",
			learning_goal: "",
			summary: "",
			prerequisites: "",
			behavioral_objectives: "{}",
			achievement_targets: "{}",
		});
		setSyllabusError(null);
		setSubjectDialogOpen(true);
		loadSyllabus(subject.id);
	};

	const saveSubject = async () => {
		if (!editingSubject) return;

		// シラバスの JSON 項目を検証
		let behavioralObj: object | undefined;
		let achievementObj: object | undefined;
		try {
			behavioralObj = syllabusForm.behavioral_objectives
				? JSON.parse(syllabusForm.behavioral_objectives)
				: undefined;
			achievementObj = syllabusForm.achievement_targets
				? JSON.parse(syllabusForm.achievement_targets)
				: undefined;
		} catch {
			setSyllabusError("到達目標のJSON形式が正しくありません");
			return;
		}

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
			await axios.put(
				`/subjects/${editingSubject.id}/syllabus`,
				{
					subject_category_id: syllabusForm.subject_category_id
						? Number.parseInt(syllabusForm.subject_category_id, 10)
						: undefined,
					credits: syllabusForm.credits
						? Number.parseInt(syllabusForm.credits, 10)
						: undefined,
					code: syllabusForm.code || undefined,
					learning_goal: syllabusForm.learning_goal || undefined,
					summary: syllabusForm.summary || undefined,
					prerequisites: syllabusForm.prerequisites || undefined,
					behavioral_objectives: behavioralObj,
					achievement_targets: achievementObj,
				},
				{ withCredentials: true },
			);
			setSubjectDialogOpen(false);
			await fetchSubjects();
			if (selectedSubjectId !== null) {
				await fetchCoursesBySubject(selectedSubjectId);
			}
		} catch (_error) {
			setError("科目またはシラバスの更新に失敗しました");
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

	const openCourseDuplicate = (course: Course) => {
		setDuplicatingCourse(course);
		setDuplicateForm({
			new_course_name: `${course.course_name}（複製）`,
			start_date_time: toInputDateTime(course.start_date_time),
			end_date_time: toInputDateTime(course.end_date_time),
			is_active: course.is_active,
			include_teacher_permissions: true,
			include_enrollments: false,
			include_lessons_and_materials: true,
			include_inactive_lessons: false,
		});
		setDuplicateError(null);
		setDuplicateSuccess(null);
		setDuplicateDialogOpen(true);
	};

	const duplicateCourse = async () => {
		if (!duplicatingCourse || selectedSubjectId === null) return;
		if (!duplicateForm.new_course_name.trim()) {
			setDuplicateError("複製後のコース名を入力してください");
			return;
		}

		setDuplicateSaving(true);
		setDuplicateError(null);
		setDuplicateSuccess(null);
		try {
			const response = await axios.post<CourseDuplicateResult>(
				`/admin/courses/${duplicatingCourse.id}/duplicate`,
				{
					new_course_name: duplicateForm.new_course_name.trim(),
					start_date_time: duplicateForm.start_date_time
						? `${duplicateForm.start_date_time}:00`
						: null,
					end_date_time: duplicateForm.end_date_time
						? `${duplicateForm.end_date_time}:00`
						: null,
					is_active: duplicateForm.is_active,
					include_teacher_permissions: duplicateForm.include_teacher_permissions,
					include_enrollments: duplicateForm.include_enrollments,
					include_lessons_and_materials:
						duplicateForm.include_lessons_and_materials,
					include_inactive_lessons: duplicateForm.include_inactive_lessons,
				},
				{ withCredentials: true },
			);

			setDuplicateDialogOpen(false);
			await fetchCoursesBySubject(selectedSubjectId);
			setDuplicateSuccess(
				`コースを複製しました（レッスン: ${response.data.copied_lessons}件 / 履修者: ${response.data.copied_enrollments}件）`,
			);
		} catch (_error) {
			setDuplicateError("コースの複製に失敗しました");
		} finally {
			setDuplicateSaving(false);
		}
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
			<div className="flex items-center justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">科目・コース管理</h1>
					<p className="text-sm text-muted-foreground">
						全科目と配下コースの表示・編集を行います。
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setSemesterManageDialogOpen(true)}
					>
						学期マスタ管理
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setCategoryManageDialogOpen(true)}
					>
						授業科目区分管理
					</Button>
				</div>
			</div>

			{error ? <p className="text-sm text-red-500">{error}</p> : null}
			{duplicateSuccess ? (
				<p className="text-sm text-emerald-600">{duplicateSuccess}</p>
			) : null}

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
										<div className="flex gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => openSubjectEdit(subject)}
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={async () => {
													if (
														!window.confirm(
															"この科目を削除しますか？（コースやシラバスも利用できなくなります）",
														)
													) {
														return;
													}
													try {
														await axios.delete(`/subjects/${subject.id}`, {
															withCredentials: true,
														});
														await fetchSubjects();
														if (selectedSubjectId === subject.id) {
															setSelectedSubjectId(null);
															setCourses([]);
														}
													} catch (_error) {
														setError("科目の削除に失敗しました");
													}
												}}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
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
												{formatDate(course.start_date_time)} 〜{" "}
												{formatDate(course.end_date_time)}
											</p>
											<p className="text-xs text-muted-foreground">
												{course.is_active ? "公開中" : "非公開"}
											</p>
										</div>
										<div className="flex gap-2">
											<Button
												variant="outline"
												size="sm"
												title="このコースを複製"
												onClick={() => openCourseDuplicate(course)}
											>
												<Copy className="h-4 w-4" />
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => openCourseEdit(course)}
											>
												<Pencil className="h-4 w-4" />
											</Button>
										</div>
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
								<Label htmlFor="c_academic_year">開講年</Label>
								<Input
									id="c_academic_year"
									type="number"
									value={createSubjectForm.academic_year}
									onChange={(e) => setCreateSubjectForm((p) => ({ ...p, academic_year: e.target.value }))}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="c_semester_id">学期</Label>
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
								<Label htmlFor="c_category">授業科目区分</Label>
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
								<Label htmlFor="c_credits">単位数</Label>
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
							<Label htmlFor="c_code">科目コード</Label>
							<Input
								id="c_code"
								value={createSubjectForm.code}
								onChange={(e) => setCreateSubjectForm((p) => ({ ...p, code: e.target.value }))}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="c_learning_goal">学習・教育目標</Label>
							<Textarea
								id="c_learning_goal"
								rows={2}
								value={createSubjectForm.learning_goal}
								onChange={(e) => setCreateSubjectForm((p) => ({ ...p, learning_goal: e.target.value }))}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="c_summary">授業の概要</Label>
							<Textarea
								id="c_summary"
								rows={2}
								value={createSubjectForm.summary}
								onChange={(e) => setCreateSubjectForm((p) => ({ ...p, summary: e.target.value }))}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="c_prerequisites">履修に必要な予備知識</Label>
							<Textarea
								id="c_prerequisites"
								rows={2}
								value={createSubjectForm.prerequisites}
								onChange={(e) => setCreateSubjectForm((p) => ({ ...p, prerequisites: e.target.value }))}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="c_behavioral">理想的な達成レベル (JSON)</Label>
							<Textarea
								id="c_behavioral"
								rows={2}
								className="font-mono text-sm"
								value={createSubjectForm.behavioral_objectives}
								onChange={(e) => setCreateSubjectForm((p) => ({ ...p, behavioral_objectives: e.target.value }))}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="c_achievement">標準的な達成レベル (JSON)</Label>
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
						<hr />
						<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
							シラバス情報
						</p>
						{syllabusLoading ? (
							<p className="text-xs text-muted-foreground">シラバス情報を読み込み中...</p>
						) : null}
						{syllabusError ? (
							<p className="text-xs text-red-500">{syllabusError}</p>
						) : null}
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-2">
								<Label htmlFor="e_category">授業科目区分</Label>
								<select
									id="e_category"
									value={syllabusForm.subject_category_id}
									onChange={(e) =>
										setSyllabusForm((prev) => ({
											...prev,
											subject_category_id: e.target.value,
										}))
									}
									className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
								>
									<option value="">選択してください</option>
									{subjectCategories.map((c) => (
										<option key={c.id} value={c.id}>
											{c.name}
										</option>
									))}
								</select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="e_credits">単位数</Label>
								<Input
									id="e_credits"
									type="number"
									min="0"
									value={syllabusForm.credits}
									onChange={(e) =>
										setSyllabusForm((prev) => ({
											...prev,
											credits: e.target.value,
										}))
									}
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="e_code">科目コード</Label>
							<Input
								id="e_code"
								value={syllabusForm.code}
								onChange={(e) =>
									setSyllabusForm((prev) => ({
										...prev,
										code: e.target.value,
									}))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="e_learning_goal">学習・教育目標</Label>
							<Textarea
								id="e_learning_goal"
								rows={2}
								value={syllabusForm.learning_goal}
								onChange={(e) =>
									setSyllabusForm((prev) => ({
										...prev,
										learning_goal: e.target.value,
									}))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="e_summary">授業の概要</Label>
							<Textarea
								id="e_summary"
								rows={2}
								value={syllabusForm.summary}
								onChange={(e) =>
									setSyllabusForm((prev) => ({
										...prev,
										summary: e.target.value,
									}))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="e_prerequisites">履修に必要な予備知識</Label>
							<Textarea
								id="e_prerequisites"
								rows={2}
								value={syllabusForm.prerequisites}
								onChange={(e) =>
									setSyllabusForm((prev) => ({
										...prev,
										prerequisites: e.target.value,
									}))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="e_behavioral">理想的な達成レベル (JSON)</Label>
							<Textarea
								id="e_behavioral"
								rows={2}
								className="font-mono text-sm"
								value={syllabusForm.behavioral_objectives}
								onChange={(e) =>
									setSyllabusForm((prev) => ({
										...prev,
										behavioral_objectives: e.target.value,
									}))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="e_achievement">標準的な達成レベル (JSON)</Label>
							<Textarea
								id="e_achievement"
								rows={2}
								className="font-mono text-sm"
								value={syllabusForm.achievement_targets}
								onChange={(e) =>
									setSyllabusForm((prev) => ({
										...prev,
										achievement_targets: e.target.value,
									}))
								}
							/>
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

			{/* 学期マスタ管理ダイアログ */}
			<Dialog open={semesterManageDialogOpen} onOpenChange={setSemesterManageDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>学期マスタ管理</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="m_semester_select">既存の学期</Label>
							<select
								id="m_semester_select"
								value={selectedSemesterForManage}
								onChange={(e) => setSelectedSemesterForManage(e.target.value)}
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
							>
								<option value="">選択してください</option>
								{semesters.map((s) => (
									<option key={s.id} value={s.id}>
										{s.name}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="m_new_semester_name">新しい学期を追加</Label>
							<div className="flex gap-2">
								<Input
									id="m_new_semester_name"
									placeholder="例）前期 2026"
									value={newSemesterName}
									onChange={(e) => setNewSemesterName(e.target.value)}
								/>
								<Input
									id="m_new_semester_sort"
									type="number"
									placeholder="並び順"
									className="w-24"
									value={newSemesterSortOrder}
									onChange={(e) => setNewSemesterSortOrder(e.target.value)}
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleCreateSemester}
									disabled={semesterSaving}
								>
									{semesterSaving ? "追加中..." : "追加"}
								</Button>
							</div>
						</div>
						{semesterError ? (
							<p className="text-xs text-red-500">{semesterError}</p>
						) : null}
						<div className="flex justify-end">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={handleDeleteSelectedSemester}
								disabled={semesterSaving}
							>
								<Trash2 className="mr-1 h-3 w-3" />
								選択中の学期を削除
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			{/* 授業科目区分マスタ管理ダイアログ */}
			<Dialog open={categoryManageDialogOpen} onOpenChange={setCategoryManageDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>授業科目区分マスタ管理</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="m_category_select">既存の科目区分</Label>
							<select
								id="m_category_select"
								value={selectedCategoryForManage}
								onChange={(e) => setSelectedCategoryForManage(e.target.value)}
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
							>
								<option value="">選択してください</option>
								{subjectCategories.map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="m_new_category_name">新しい科目区分を追加</Label>
							<div className="flex flex-col gap-2 md:flex-row">
								<Input
									id="m_new_category_name"
									placeholder="例）専門必修"
									value={newCategoryName}
									onChange={(e) => setNewCategoryName(e.target.value)}
								/>
								<Input
									id="m_new_category_desc"
									placeholder="説明（任意）"
									value={newCategoryDescription}
									onChange={(e) => setNewCategoryDescription(e.target.value)}
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleCreateCategory}
									disabled={categorySaving}
								>
									{categorySaving ? "追加中..." : "追加"}
								</Button>
							</div>
						</div>
						<div className="space-y-2">
							<p className="text-xs text-muted-foreground">
								よく使う区分をまとめて登録（必修 / 選択）
							</p>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={handleCreateRequiredAndElectiveCategories}
								disabled={defaultCategoriesSaving}
							>
								{defaultCategoriesSaving
									? "必修/選択 追加中..."
									: "必修・選択を自動追加"}
							</Button>
						</div>
						{categoryError ? (
							<p className="text-xs text-red-500">{categoryError}</p>
						) : null}
						{defaultCategoriesError ? (
							<p className="text-xs text-red-500">{defaultCategoriesError}</p>
						) : null}
						<div className="flex justify-end">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={handleDeleteSelectedCategory}
								disabled={categorySaving}
							>
								<Trash2 className="mr-1 h-3 w-3" />
								選択中の区分を削除
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>コース複製</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						{duplicatingCourse ? (
							<p className="text-xs text-muted-foreground">
								複製元: {duplicatingCourse.course_name}
							</p>
						) : null}
						<div className="space-y-2">
							<Label htmlFor="duplicate_course_name">複製後のコース名</Label>
							<Input
								id="duplicate_course_name"
								value={duplicateForm.new_course_name}
								onChange={(e) =>
									setDuplicateForm((prev) => ({
										...prev,
										new_course_name: e.target.value,
									}))
								}
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-2">
								<Label htmlFor="duplicate_course_start">開始日時</Label>
								<Input
									id="duplicate_course_start"
									type="datetime-local"
									value={duplicateForm.start_date_time}
									onChange={(e) =>
										setDuplicateForm((prev) => ({
											...prev,
											start_date_time: e.target.value,
										}))
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="duplicate_course_end">終了日時</Label>
								<Input
									id="duplicate_course_end"
									type="datetime-local"
									value={duplicateForm.end_date_time}
									onChange={(e) =>
										setDuplicateForm((prev) => ({
											...prev,
											end_date_time: e.target.value,
										}))
									}
								/>
							</div>
						</div>

						<div className="flex items-center gap-2">
							<input
								id="duplicate_course_active"
								type="checkbox"
								checked={duplicateForm.is_active}
								onChange={(e) =>
									setDuplicateForm((prev) => ({
										...prev,
										is_active: e.target.checked,
									}))
								}
							/>
							<Label htmlFor="duplicate_course_active">複製後コースを有効にする</Label>
						</div>

						<hr />
						<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
							複製範囲
						</p>

						<div className="flex items-center gap-2">
							<input
								id="duplicate_lessons"
								type="checkbox"
								checked={duplicateForm.include_lessons_and_materials}
								onChange={(e) =>
									setDuplicateForm((prev) => ({
										...prev,
										include_lessons_and_materials: e.target.checked,
										include_inactive_lessons: e.target.checked
											? prev.include_inactive_lessons
											: false,
									}))
								}
							/>
							<Label htmlFor="duplicate_lessons">レッスン・教材を複製する</Label>
						</div>

						<div className="flex items-center gap-2 pl-6">
							<input
								id="duplicate_inactive_lessons"
								type="checkbox"
								checked={duplicateForm.include_inactive_lessons}
								disabled={!duplicateForm.include_lessons_and_materials}
								onChange={(e) =>
									setDuplicateForm((prev) => ({
										...prev,
										include_inactive_lessons: e.target.checked,
									}))
								}
							/>
							<Label htmlFor="duplicate_inactive_lessons">
								非アクティブなレッスン・教材も含める
							</Label>
						</div>

						<div className="flex items-center gap-2">
							<input
								id="duplicate_permissions"
								type="checkbox"
								checked={duplicateForm.include_teacher_permissions}
								onChange={(e) =>
									setDuplicateForm((prev) => ({
										...prev,
										include_teacher_permissions: e.target.checked,
									}))
								}
							/>
							<Label htmlFor="duplicate_permissions">教師権限を複製する</Label>
						</div>

						<div className="flex items-center gap-2">
							<input
								id="duplicate_enrollments"
								type="checkbox"
								checked={duplicateForm.include_enrollments}
								onChange={(e) =>
									setDuplicateForm((prev) => ({
										...prev,
										include_enrollments: e.target.checked,
									}))
								}
							/>
							<Label htmlFor="duplicate_enrollments">履修者を複製する</Label>
						</div>

						{duplicateError ? (
							<p className="text-sm text-red-500">{duplicateError}</p>
						) : null}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
							キャンセル
						</Button>
						<Button onClick={duplicateCourse} disabled={duplicateSaving}>
							{duplicateSaving ? "複製中..." : "複製を実行"}
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
