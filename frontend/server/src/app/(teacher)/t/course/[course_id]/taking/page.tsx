"use client";

import {
	AlertCircle,
	BookOpen,
	CheckCircle,
	GraduationCap,
	UserMinus,
	UserPlus,
	Users,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import axios from "@/lib/axios";

interface User {
	id: number;
	email: string;
	username: string;
	kind_name: string;
}

interface CourseInfo {
	course_name: string;
	subject_name: string;
	update_answer: boolean;
}

interface TakingData {
	registered: User[];
	unregistered: User[];
}

interface GrantData {
	registered: User[];
	unregistered: User[];
}

function CourseTakingPage() {
	const router = useRouter();
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
	const [errorMessage, setErrorMessage] = useState("");
	const [showSuccessDialog, setShowSuccessDialog] = useState(false);
	const [successMessage, setSuccessMessage] = useState("");

	// 学生管理
	const [takingStudents, setTakingStudents] = useState<TakingData>({
		registered: [],
		unregistered: [],
	});
	const [selectedUnregisteredStudents, setSelectedUnregisteredStudents] =
		useState<number[]>([]);
	const [selectedRegisteredStudents, setSelectedRegisteredStudents] = useState<
		number[]
	>([]);

	// 教師管理
	const [grantTeachers, setGrantTeachers] = useState<GrantData>({
		registered: [],
		unregistered: [],
	});
	const [selectedUnregisteredTeachers, setSelectedUnregisteredTeachers] =
		useState<number[]>([]);
	const [selectedRegisteredTeachers, setSelectedRegisteredTeachers] = useState<
		number[]
	>([]);

	const [activeTab, setActiveTab] = useState<
		"add_students" | "conf_students" | "add_teachers" | "conf_teachers"
	>("add_students");

	useEffect(() => {
		if (params.course_id) {
			fetchCourseInfo();
			fetchTakingStudents();
			fetchGrantTeachers();
		}
	}, [params.course_id]);

	const fetchCourseInfo = async () => {
		try {
			const response = await axios.get(`/courses/${params.course_id}`);
			setCourseInfo(response.data);
		} catch (error) {
			console.error("Error fetching course info:", error);
			setErrorMessage("コース情報の取得に失敗しました");
		}
	};

	const fetchTakingStudents = async () => {
		try {
			const response = await axios.get(
				`/get_taking_students/${params.course_id}`,
			);
			setTakingStudents(response.data);
		} catch (error) {
			console.error("Error fetching taking students:", error);
			setErrorMessage("履修者情報の取得に失敗しました");
		}
	};

	const fetchGrantTeachers = async () => {
		try {
			const response = await axios.get(
				`/get_grant_teachers/${params.course_id}`,
			);
			setGrantTeachers(response.data);
		} catch (error) {
			console.error("Error fetching grant teachers:", error);
			setErrorMessage("教師権限情報の取得に失敗しました");
		}
	};

	const addTakingStudents = async () => {
		if (selectedUnregisteredStudents.length === 0) {
			setErrorMessage("追加する学生を選択してください");
			return;
		}

		try {
			setLoading(true);
			setErrorMessage("");

			const userList = takingStudents.unregistered.filter((student) =>
				selectedUnregisteredStudents.includes(student.id),
			);

			await axios.post("/register_taking_student", {
				course_id: params.course_id,
				user_list: userList,
			});

			setSelectedUnregisteredStudents([]);
			await fetchTakingStudents();
			setSuccessMessage("学生を正常に追加しました");
			setShowSuccessDialog(true);
			setTimeout(() => setShowSuccessDialog(false), 2000);
		} catch (error) {
			console.error("Error adding students:", error);
			setErrorMessage("学生の追加に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const deleteTakingStudents = async () => {
		if (selectedRegisteredStudents.length === 0) {
			setErrorMessage("削除する学生を選択してください");
			return;
		}

		try {
			setLoading(true);
			setErrorMessage("");

			const userList = takingStudents.registered.filter((student) =>
				selectedRegisteredStudents.includes(student.id),
			);

			await axios.post("/delete_taking_student", {
				course_id: params.course_id,
				user_list: userList,
			});

			setSelectedRegisteredStudents([]);
			await fetchTakingStudents();
			setSuccessMessage("学生を正常に削除しました");
			setShowSuccessDialog(true);
			setTimeout(() => setShowSuccessDialog(false), 2000);
		} catch (error) {
			console.error("Error deleting students:", error);
			setErrorMessage("学生の削除に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const addGrantTeachers = async () => {
		if (selectedUnregisteredTeachers.length === 0) {
			setErrorMessage("権限を付与する教師を選択してください");
			return;
		}

		try {
			setLoading(true);
			setErrorMessage("");

			const userList = grantTeachers.unregistered.filter((teacher) =>
				selectedUnregisteredTeachers.includes(teacher.id),
			);

			await axios.post("/register_grant_teacher", {
				course_id: params.course_id,
				user_list: userList,
			});

			setSelectedUnregisteredTeachers([]);
			await fetchGrantTeachers();
			setSuccessMessage("教師権限を正常に付与しました");
			setShowSuccessDialog(true);
			setTimeout(() => setShowSuccessDialog(false), 2000);
		} catch (error) {
			console.error("Error adding teachers:", error);
			setErrorMessage("教師権限の付与に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const deleteGrantTeachers = async () => {
		if (selectedRegisteredTeachers.length === 0) {
			setErrorMessage("権限を削除する教師を選択してください");
			return;
		}

		try {
			setLoading(true);
			setErrorMessage("");

			const userList = grantTeachers.registered.filter((teacher) =>
				selectedRegisteredTeachers.includes(teacher.id),
			);

			await axios.post("/delete_grant_teacher", {
				course_id: params.course_id,
				user_list: userList,
			});

			setSelectedRegisteredTeachers([]);
			await fetchGrantTeachers();
			setSuccessMessage("教師権限を正常に削除しました");
			setShowSuccessDialog(true);
			setTimeout(() => setShowSuccessDialog(false), 2000);
		} catch (error) {
			console.error("Error deleting teachers:", error);
			setErrorMessage("教師権限の削除に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const handleStudentSelection = (studentId: number, isRegistered: boolean) => {
		if (isRegistered) {
			setSelectedRegisteredStudents((prev) =>
				prev.includes(studentId)
					? prev.filter((id) => id !== studentId)
					: [...prev, studentId],
			);
		} else {
			setSelectedUnregisteredStudents((prev) =>
				prev.includes(studentId)
					? prev.filter((id) => id !== studentId)
					: [...prev, studentId],
			);
		}
	};

	const handleTeacherSelection = (teacherId: number, isRegistered: boolean) => {
		if (isRegistered) {
			setSelectedRegisteredTeachers((prev) =>
				prev.includes(teacherId)
					? prev.filter((id) => id !== teacherId)
					: [...prev, teacherId],
			);
		} else {
			setSelectedUnregisteredTeachers((prev) =>
				prev.includes(teacherId)
					? prev.filter((id) => id !== teacherId)
					: [...prev, teacherId],
			);
		}
	};

	const selectAllStudents = (isRegistered: boolean) => {
		if (isRegistered) {
			const allIds = takingStudents.registered.map((student) => student.id);
			setSelectedRegisteredStudents(
				selectedRegisteredStudents.length === allIds.length ? [] : allIds,
			);
		} else {
			const allIds = takingStudents.unregistered.map((student) => student.id);
			setSelectedUnregisteredStudents(
				selectedUnregisteredStudents.length === allIds.length ? [] : allIds,
			);
		}
	};

	const selectAllTeachers = (isRegistered: boolean) => {
		if (isRegistered) {
			const allIds = grantTeachers.registered.map((teacher) => teacher.id);
			setSelectedRegisteredTeachers(
				selectedRegisteredTeachers.length === allIds.length ? [] : allIds,
			);
		} else {
			const allIds = grantTeachers.unregistered.map((teacher) => teacher.id);
			setSelectedUnregisteredTeachers(
				selectedUnregisteredTeachers.length === allIds.length ? [] : allIds,
			);
		}
	};

	return (
		<div className="container mx-auto py-8 px-4 max-w-6xl">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl flex items-center gap-2">
						<Users className="h-6 w-6" />
						履修者登録・権限設定
					</CardTitle>
					{courseInfo && (
						<CardDescription>
							{courseInfo.subject_name} - {courseInfo.course_name}
						</CardDescription>
					)}
				</CardHeader>
				<CardContent>
					{errorMessage && (
						<Alert variant="destructive" className="mb-6">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{errorMessage}</AlertDescription>
						</Alert>
					)}

					{!courseInfo?.update_answer && (
						<Alert className="mb-6">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>
								このコースは編集権限がないため、表示のみとなります
							</AlertDescription>
						</Alert>
					)}

					{/* タブナビゲーション */}
					<div className="flex flex-col space-y-4 mb-6">
						{/* 学生セクション */}
						<div>
							<div className="flex items-center gap-2 mb-3">
								<GraduationCap className="h-5 w-5" />
								<h3 className="text-lg font-semibold">学生</h3>
							</div>
							<div className="flex space-x-2">
								<Button
									variant={activeTab === "add_students" ? "default" : "outline"}
									onClick={() => setActiveTab("add_students")}
									className="flex items-center gap-2"
								>
									<UserPlus className="h-4 w-4" />
									履修者登録
								</Button>
								<Button
									variant={
										activeTab === "conf_students" ? "default" : "outline"
									}
									onClick={() => setActiveTab("conf_students")}
									className="flex items-center gap-2"
								>
									<Users className="h-4 w-4" />
									履修者確認
								</Button>
							</div>
						</div>

						<Separator />

						{/* 教師セクション */}
						<div>
							<div className="flex items-center gap-2 mb-3">
								<BookOpen className="h-5 w-5" />
								<h3 className="text-lg font-semibold">教師</h3>
							</div>
							<div className="flex space-x-2">
								<Button
									variant={activeTab === "add_teachers" ? "default" : "outline"}
									onClick={() => setActiveTab("add_teachers")}
									className="flex items-center gap-2"
								>
									<UserPlus className="h-4 w-4" />
									権限付与
								</Button>
								<Button
									variant={
										activeTab === "conf_teachers" ? "default" : "outline"
									}
									onClick={() => setActiveTab("conf_teachers")}
									className="flex items-center gap-2"
								>
									<Users className="h-4 w-4" />
									権限確認
								</Button>
							</div>
						</div>
					</div>

					{/* コンテンツエリア */}
					<div className="mt-6">
						{/* 履修者登録 */}
						{activeTab === "add_students" && (
							<Card>
								<CardHeader>
									<div className="flex items-center justify-between">
										<CardTitle className="text-lg">履修者登録</CardTitle>
										{courseInfo?.update_answer && (
											<Button
												onClick={addTakingStudents}
												disabled={
													selectedUnregisteredStudents.length === 0 || loading
												}
												className="flex items-center gap-2"
											>
												<UserPlus className="h-4 w-4" />
												{loading ? "追加中..." : "追加"}
											</Button>
										)}
									</div>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										{courseInfo?.update_answer && (
											<div className="flex items-center gap-2">
												<Checkbox
													checked={
														selectedUnregisteredStudents.length ===
															takingStudents.unregistered.length &&
														takingStudents.unregistered.length > 0
													}
													onCheckedChange={() => selectAllStudents(false)}
												/>
												<span className="text-sm">全て選択</span>
											</div>
										)}
										<div className="grid gap-2">
											{takingStudents.unregistered.length === 0 ? (
												<div className="text-center py-8 text-gray-500">
													追加可能な学生がいません
												</div>
											) : (
												takingStudents.unregistered.map((student) => (
													<div
														key={student.id}
														className="flex items-center space-x-3 p-3 border rounded-lg"
													>
														{courseInfo?.update_answer && (
															<Checkbox
																checked={selectedUnregisteredStudents.includes(
																	student.id,
																)}
																onCheckedChange={() =>
																	handleStudentSelection(student.id, false)
																}
															/>
														)}
														<div className="flex-1">
															<div className="font-medium">{student.email}</div>
															<div className="text-sm text-gray-600">
																{student.username}
															</div>
														</div>
														<Badge variant="secondary">
															{student.kind_name}
														</Badge>
													</div>
												))
											)}
										</div>
									</div>
								</CardContent>
							</Card>
						)}

						{/* 履修者確認 */}
						{activeTab === "conf_students" && (
							<Card>
								<CardHeader>
									<div className="flex items-center justify-between">
										<CardTitle className="text-lg">履修者確認</CardTitle>
										{courseInfo?.update_answer && (
											<Button
												onClick={deleteTakingStudents}
												disabled={
													selectedRegisteredStudents.length === 0 || loading
												}
												variant="destructive"
												className="flex items-center gap-2"
											>
												<UserMinus className="h-4 w-4" />
												{loading ? "削除中..." : "削除"}
											</Button>
										)}
									</div>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										{courseInfo?.update_answer && (
											<div className="flex items-center gap-2">
												<Checkbox
													checked={
														selectedRegisteredStudents.length ===
															takingStudents.registered.length &&
														takingStudents.registered.length > 0
													}
													onCheckedChange={() => selectAllStudents(true)}
												/>
												<span className="text-sm">全て選択</span>
											</div>
										)}
										<div className="grid gap-2">
											{takingStudents.registered.length === 0 ? (
												<div className="text-center py-8 text-gray-500">
													履修者がいません
												</div>
											) : (
												takingStudents.registered.map((student) => (
													<div
														key={student.id}
														className="flex items-center space-x-3 p-3 border rounded-lg"
													>
														{courseInfo?.update_answer && (
															<Checkbox
																checked={selectedRegisteredStudents.includes(
																	student.id,
																)}
																onCheckedChange={() =>
																	handleStudentSelection(student.id, true)
																}
															/>
														)}
														<div className="flex-1">
															<div className="font-medium">{student.email}</div>
															<div className="text-sm text-gray-600">
																{student.username}
															</div>
														</div>
														<Badge variant="secondary">
															{student.kind_name}
														</Badge>
													</div>
												))
											)}
										</div>
									</div>
								</CardContent>
							</Card>
						)}

						{/* 教師権限付与 */}
						{activeTab === "add_teachers" && (
							<Card>
								<CardHeader>
									<div className="flex items-center justify-between">
										<CardTitle className="text-lg">権限付与</CardTitle>
										{courseInfo?.update_answer && (
											<Button
												onClick={addGrantTeachers}
												disabled={
													selectedUnregisteredTeachers.length === 0 || loading
												}
												className="flex items-center gap-2"
											>
												<UserPlus className="h-4 w-4" />
												{loading ? "付与中..." : "付与"}
											</Button>
										)}
									</div>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										{courseInfo?.update_answer && (
											<div className="flex items-center gap-2">
												<Checkbox
													checked={
														selectedUnregisteredTeachers.length ===
															grantTeachers.unregistered.length &&
														grantTeachers.unregistered.length > 0
													}
													onCheckedChange={() => selectAllTeachers(false)}
												/>
												<span className="text-sm">全て選択</span>
											</div>
										)}
										<div className="grid gap-2">
											{grantTeachers.unregistered.length === 0 ? (
												<div className="text-center py-8 text-gray-500">
													権限付与可能な教師がいません
												</div>
											) : (
												grantTeachers.unregistered.map((teacher) => (
													<div
														key={teacher.id}
														className="flex items-center space-x-3 p-3 border rounded-lg"
													>
														{courseInfo?.update_answer && (
															<Checkbox
																checked={selectedUnregisteredTeachers.includes(
																	teacher.id,
																)}
																onCheckedChange={() =>
																	handleTeacherSelection(teacher.id, false)
																}
															/>
														)}
														<div className="flex-1">
															<div className="font-medium">{teacher.email}</div>
															<div className="text-sm text-gray-600">
																{teacher.username}
															</div>
														</div>
														<Badge variant="secondary">
															{teacher.kind_name}
														</Badge>
													</div>
												))
											)}
										</div>
									</div>
								</CardContent>
							</Card>
						)}

						{/* 教師権限確認 */}
						{activeTab === "conf_teachers" && (
							<Card>
								<CardHeader>
									<div className="flex items-center justify-between">
										<CardTitle className="text-lg">権限確認</CardTitle>
										{courseInfo?.update_answer && (
											<Button
												onClick={deleteGrantTeachers}
												disabled={
													selectedRegisteredTeachers.length === 0 || loading
												}
												variant="destructive"
												className="flex items-center gap-2"
											>
												<UserMinus className="h-4 w-4" />
												{loading ? "削除中..." : "削除"}
											</Button>
										)}
									</div>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										{courseInfo?.update_answer && (
											<div className="flex items-center gap-2">
												<Checkbox
													checked={
														selectedRegisteredTeachers.length ===
															grantTeachers.registered.length &&
														grantTeachers.registered.length > 0
													}
													onCheckedChange={() => selectAllTeachers(true)}
												/>
												<span className="text-sm">全て選択</span>
											</div>
										)}
										<div className="grid gap-2">
											{grantTeachers.registered.length === 0 ? (
												<div className="text-center py-8 text-gray-500">
													権限を持つ教師がいません
												</div>
											) : (
												grantTeachers.registered.map((teacher) => (
													<div
														key={teacher.id}
														className="flex items-center space-x-3 p-3 border rounded-lg"
													>
														{courseInfo?.update_answer && (
															<Checkbox
																checked={selectedRegisteredTeachers.includes(
																	teacher.id,
																)}
																onCheckedChange={() =>
																	handleTeacherSelection(teacher.id, true)
																}
															/>
														)}
														<div className="flex-1">
															<div className="font-medium">{teacher.email}</div>
															<div className="text-sm text-gray-600">
																{teacher.username}
															</div>
														</div>
														<Badge variant="secondary">
															{teacher.kind_name}
														</Badge>
													</div>
												))
											)}
										</div>
									</div>
								</CardContent>
							</Card>
						)}
					</div>
				</CardContent>
			</Card>

			{/* 成功ダイアログ */}
			<Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader className="text-center">
						<div className="mx-auto mb-4">
							<CheckCircle className="h-16 w-16 text-green-500" />
						</div>
						<DialogTitle className="text-xl">完了</DialogTitle>
						<DialogDescription>{successMessage}</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default CourseTakingPage;
