"use client";

import { AlertCircle, CheckCircle2, Upload, UserMinus, UserPlus, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import axios from "@/lib/axios";

type StudentOption = {
	id: number;
	username?: string | null;
	display_name?: string | null;
	email: string;
	grade?: number | null;
	department?: string | null;
	student_number?: string | null;
	class_number?: string | null;
	class_roster_number?: string | null;
};

type EnrolledStudent = {
	user_id: number;
	username?: string | null;
	display_name?: string | null;
	email?: string | null;
	grade?: number | null;
	department?: string | null;
	student_number?: string | null;
	class_number?: string | null;
	class_roster_number?: string | null;
	enrolled_at: string;
};

export default function CourseEnrollmentsPage() {
	const params = useParams();
	const courseId = params.course_id as string;

	const [students, setStudents] = useState<StudentOption[]>([]);
	const [enrolled, setEnrolled] = useState<EnrolledStudent[]>([]);
	const [selectedIds, setSelectedIds] = useState<number[]>([]);
	const [selectedEnrolledIds, setSelectedEnrolledIds] = useState<number[]>([]);
	const [csvStudentNumbers, setCsvStudentNumbers] = useState<string[]>([]);
	const [search, setSearch] = useState("");
	const [filterGrade, setFilterGrade] = useState("");
	const [filterDepartment, setFilterDepartment] = useState("");
	const [filterClass, setFilterClass] = useState("");
	const [loading, setLoading] = useState(false);
	const [initialLoading, setInitialLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [activeTab, setActiveTab] = useState<"manual" | "csv">("manual");
	const csvInputRef = useRef<HTMLInputElement>(null);

	const enrolledIdSet = useMemo(
		() => new Set(enrolled.map((e) => e.user_id)),
		[enrolled],
	);

	const filteredStudents = useMemo(() => {
		const kw = search.trim().toLowerCase();
		return students.filter((s) => {
			const text = [
				s.display_name || "",
				s.username || "",
				s.email || "",
				s.student_number || "",
				s.department || "",
				s.class_number || "",
				s.class_roster_number || "",
			]
				.join(" ")
				.toLowerCase();
			const matchKeyword = kw ? text.includes(kw) : true;
			const matchGrade = filterGrade
				? (s.grade ?? "").toString() === filterGrade
				: true;
			const matchDepartment = filterDepartment
				? (s.department || "") === filterDepartment
				: true;
			const matchClass = filterClass ? (s.class_number || "") === filterClass : true;
			return matchKeyword && matchGrade && matchDepartment && matchClass;
		});
	}, [students, search, filterGrade, filterDepartment, filterClass]);

	const availableStudents = useMemo(
		() => filteredStudents.filter((s) => !enrolledIdSet.has(s.id)),
		[filteredStudents, enrolledIdSet],
	);

	const gradeOptions = useMemo(() => {
		const set = new Set<string>();
		for (const s of students) {
			if (s.grade !== null && s.grade !== undefined) set.add(String(s.grade));
		}
		return Array.from(set).sort((a, b) => Number(a) - Number(b));
	}, [students]);

	const departmentOptions = useMemo(() => {
		const set = new Set<string>();
		for (const s of students) {
			if (s.department) set.add(s.department);
		}
		return Array.from(set).sort();
	}, [students]);

	const classOptions = useMemo(() => {
		const set = new Set<string>();
		for (const s of students) {
			if (s.class_number) set.add(s.class_number);
		}
		return Array.from(set).sort();
	}, [students]);

	const fetchData = async () => {
		try {
			setInitialLoading(true);
			const [studentsRes, enrolledRes] = await Promise.all([
				axios.get("/users/students"),
				axios.get(`/courses/${courseId}/enrollments`),
			]);
			setStudents((studentsRes.data as StudentOption[]) ?? []);
			setEnrolled((enrolledRes.data as EnrolledStudent[]) ?? []);
		} catch (error) {
			console.error("履修者情報の取得に失敗:", error);
			setErrorMessage("履修者情報の取得に失敗しました");
		} finally {
			setInitialLoading(false);
		}
	};

	useEffect(() => {
		fetchData();
	}, [courseId]);

	const toggleSelect = (id: number, checked: boolean) => {
		setSelectedIds((prev) =>
			checked ? [...prev, id] : prev.filter((x) => x !== id),
		);
	};

	const toggleSelectEnrolled = (id: number, checked: boolean) => {
		setSelectedEnrolledIds((prev) =>
			checked ? [...prev, id] : prev.filter((x) => x !== id),
		);
	};

	const handleSelectAllFiltered = () => {
		const ids = availableStudents.map((s) => s.id);
		setSelectedIds(ids);
	};

	const handleEnroll = async () => {
		const targetIds = selectedIds.filter((id) => !enrolledIdSet.has(id));
		if (targetIds.length === 0) {
			setErrorMessage("登録対象の学生を選択してください");
			return;
		}

		setLoading(true);
		setErrorMessage("");
		setSuccessMessage("");
		try {
			await axios.post(`/courses/${courseId}/enrollments/batch`, {
				enrollments: targetIds.map((id) => ({
					user_id: id,
					course_id: Number.parseInt(courseId, 10),
				})),
			});
			setSuccessMessage(`${targetIds.length}名を履修者として登録しました`);
			setSelectedIds([]);
			setSelectedEnrolledIds([]);
			await fetchData();
		} catch (error: any) {
			console.error("履修者登録に失敗:", error);
			setErrorMessage(error?.response?.data?.detail || "履修者登録に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const handleUnenroll = async () => {
		if (selectedEnrolledIds.length === 0) {
			setErrorMessage("解除対象の履修者を選択してください");
			return;
		}
		setLoading(true);
		setErrorMessage("");
		setSuccessMessage("");
		try {
			const query = selectedEnrolledIds
				.map((id) => `user_ids=${encodeURIComponent(String(id))}`)
				.join("&");
			await axios.delete(`/courses/${courseId}/enrollments/batch?${query}`);
			setSuccessMessage(`${selectedEnrolledIds.length}名の履修を解除しました`);
			setSelectedEnrolledIds([]);
			setSelectedIds([]);
			await fetchData();
		} catch (error: any) {
			console.error("履修解除に失敗:", error);
			setErrorMessage(error?.response?.data?.detail || "履修解除に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const handleCsvChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		setErrorMessage("");
		setSuccessMessage("");

		const reader = new FileReader();
		reader.onload = (e) => {
			const text = (e.target?.result as string) || "";
			const lines = text
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter((line) => line.length > 0);
			if (lines.length === 0) {
				setCsvStudentNumbers([]);
				setErrorMessage("CSVにデータがありません");
				return;
			}

			// 1列CSVを想定。ヘッダー(student_number)はあってもなくても可。
			const parsed = lines.map((line) => line.split(",")[0]?.trim() || "");
			const normalized = parsed
				.filter((v) => v.length > 0)
				.filter((v) => v.toLowerCase() !== "student_number" && v !== "学籍番号");
			const unique = Array.from(new Set(normalized));
			setCsvStudentNumbers(unique);
		};
		reader.readAsText(file);
	};

	const handleEnrollByCsv = async () => {
		if (csvStudentNumbers.length === 0) {
			setErrorMessage("CSVの学籍番号が読み込まれていません");
			return;
		}
		setLoading(true);
		setErrorMessage("");
		setSuccessMessage("");
		try {
			const byStudentNumber = new Map<string, StudentOption>();
			for (const s of students) {
				if (s.student_number) byStudentNumber.set(s.student_number, s);
			}

			const unknownNumbers: string[] = [];
			const alreadyEnrolledNumbers: string[] = [];
			const targetIds: number[] = [];

			for (const num of csvStudentNumbers) {
				const student = byStudentNumber.get(num);
				if (!student) {
					unknownNumbers.push(num);
					continue;
				}
				if (enrolledIdSet.has(student.id)) {
					alreadyEnrolledNumbers.push(num);
					continue;
				}
				targetIds.push(student.id);
			}

			if (targetIds.length > 0) {
				await axios.post(`/courses/${courseId}/enrollments/batch`, {
					enrollments: targetIds.map((id) => ({
						user_id: id,
						course_id: Number.parseInt(courseId, 10),
					})),
				});
			}

			const messages: string[] = [];
			if (unknownNumbers.length > 0) {
				messages.push(
					`未登録の学籍番号: ${unknownNumbers.slice(0, 10).join(", ")}${
						unknownNumbers.length > 10 ? " ..." : ""
					}`,
				);
			}
			if (alreadyEnrolledNumbers.length > 0) {
				messages.push(
					`既に履修済み: ${alreadyEnrolledNumbers.slice(0, 10).join(", ")}${
						alreadyEnrolledNumbers.length > 10 ? " ..." : ""
					}`,
				);
			}
			if (messages.length > 0) setErrorMessage(messages.join(" / "));
			setSuccessMessage(`${targetIds.length}名をCSVから履修登録しました`);

			setCsvStudentNumbers([]);
			if (csvInputRef.current) csvInputRef.current.value = "";
			setSelectedIds([]);
			setSelectedEnrolledIds([]);
			await fetchData();
		} catch (error: any) {
			console.error("CSV履修登録に失敗:", error);
			setErrorMessage(error?.response?.data?.detail || "CSV履修登録に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	if (initialLoading) {
		return (
			<div className="flex items-center justify-center py-10">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
			</div>
		);
	}

	return (
		<div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl flex items-center gap-2">
						<Users className="h-6 w-6" />
						履修者登録
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{activeTab === "manual" ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
								候補学生数:{" "}
								<span className="font-semibold">{availableStudents.length}</span>
							</div>
							<div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
								現在の履修者数: <span className="font-semibold">{enrolled.length}</span>
							</div>
						</div>
					) : (
						<div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
							CSV読込件数: <span className="font-semibold">{csvStudentNumbers.length}</span>
						</div>
					)}

					{errorMessage && (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{errorMessage}</AlertDescription>
						</Alert>
					)}
					{successMessage && (
						<Alert>
							<CheckCircle2 className="h-4 w-4" />
							<AlertDescription>{successMessage}</AlertDescription>
						</Alert>
					)}

					<Tabs
						value={activeTab}
						onValueChange={(v) => setActiveTab(v as "manual" | "csv")}
						className="space-y-4"
					>
						<TabsList className="w-full sm:w-auto">
							<TabsTrigger value="manual" className="gap-2">
								<UserPlus className="h-4 w-4" />
								学生候補から登録
							</TabsTrigger>
							<TabsTrigger value="csv" className="gap-2">
								<Upload className="h-4 w-4" />
								CSVで登録
							</TabsTrigger>
						</TabsList>

						<TabsContent value="manual" className="space-y-4">
							<div className="grid grid-cols-1 md:grid-cols-4 gap-3">
								<Input
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="氏名 / メール / 学籍番号で検索"
								/>
								<select
									className="h-10 rounded-md border bg-background px-3 text-sm"
									value={filterGrade}
									onChange={(e) => setFilterGrade(e.target.value)}
								>
									<option value="">学年: すべて</option>
									{gradeOptions.map((g) => (
										<option key={g} value={g}>
											{g}
										</option>
									))}
								</select>
								<select
									className="h-10 rounded-md border bg-background px-3 text-sm"
									value={filterDepartment}
									onChange={(e) => setFilterDepartment(e.target.value)}
								>
									<option value="">所属: すべて</option>
									{departmentOptions.map((d) => (
										<option key={d} value={d}>
											{d}
										</option>
									))}
								</select>
								<select
									className="h-10 rounded-md border bg-background px-3 text-sm"
									value={filterClass}
									onChange={(e) => setFilterClass(e.target.value)}
								>
									<option value="">クラス: すべて</option>
									{classOptions.map((c) => (
										<option key={c} value={c}>
											{c}
										</option>
									))}
								</select>
							</div>
						</TabsContent>

						<TabsContent value="csv" className="space-y-3">
							<p className="text-sm text-muted-foreground">
								1列CSV（学籍番号）を読み込み、該当学生を一括で履修登録します。
								ヘッダーは任意です（`student_number` / `学籍番号`）。
							</p>
							<input
								ref={csvInputRef}
								type="file"
								accept=".csv"
								onChange={handleCsvChange}
								className="block w-full text-sm text-gray-500
								file:mr-4 file:py-2 file:px-4
								file:rounded-full file:border-0
								file:text-sm file:font-semibold
								file:bg-primary file:text-white
								hover:file:bg-primary/90"
								disabled={loading}
							/>
							<div className="flex justify-end">
								<Button
									type="button"
									onClick={handleEnrollByCsv}
									disabled={loading || csvStudentNumbers.length === 0}
								>
									{loading ? "登録中..." : "CSVから履修登録"}
								</Button>
							</div>
						</TabsContent>
					</Tabs>

				</CardContent>
			</Card>

			{activeTab === "manual" && (
				<>
					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 gap-3">
							<CardTitle>学生一覧（候補）</CardTitle>
							<div className="flex flex-wrap items-center justify-end gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={handleSelectAllFiltered}
									disabled={availableStudents.length === 0 || loading}
									size="sm"
								>
									絞り込み結果を全選択
								</Button>
								<Button onClick={handleEnroll} disabled={loading} size="sm">
									<UserPlus className="h-4 w-4 mr-2" />
									{loading ? "登録中..." : "選択した学生を登録"}
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<div className="space-y-2 max-h-[420px] overflow-auto">
								{filteredStudents.map((s) => {
									const isEnrolled = enrolledIdSet.has(s.id);
									return (
										<label
											key={s.id}
											className="flex items-start gap-3 p-3 border rounded-md hover:bg-muted/40"
										>
											<Checkbox
												checked={selectedIds.includes(s.id)}
												onCheckedChange={(v) => toggleSelect(s.id, Boolean(v))}
												disabled={isEnrolled}
											/>
											<div className="space-y-1">
												<div className="font-medium">
													{s.display_name || s.username || "名称未設定"}
												</div>
												<div className="text-sm text-muted-foreground">{s.email}</div>
												<div className="flex flex-wrap gap-1 text-xs">
													{s.student_number && (
														<Badge variant="secondary">
															学籍番号: {s.student_number}
														</Badge>
													)}
													{s.class_number && (
														<Badge variant="secondary">クラス: {s.class_number}</Badge>
													)}
													{s.class_roster_number && (
														<Badge variant="secondary">
															名列: {s.class_roster_number}
														</Badge>
													)}
													{s.department && (
														<Badge variant="secondary">所属: {s.department}</Badge>
													)}
													{isEnrolled && <Badge>履修登録済み</Badge>}
												</div>
											</div>
										</label>
									);
								})}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0">
							<CardTitle>現在の履修者</CardTitle>
							<Button
								variant="destructive"
								onClick={handleUnenroll}
								disabled={loading || selectedEnrolledIds.length === 0}
								size="sm"
							>
								<UserMinus className="h-4 w-4 mr-2" />
								{loading ? "処理中..." : "選択した履修者を解除"}
							</Button>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{enrolled.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										履修者はまだいません。
									</p>
								) : (
									enrolled.map((e) => (
										<label
											key={e.user_id}
											className="flex items-start gap-3 p-3 border rounded-md text-sm"
										>
											<Checkbox
												checked={selectedEnrolledIds.includes(e.user_id)}
												onCheckedChange={(v) =>
													toggleSelectEnrolled(e.user_id, Boolean(v))
												}
											/>
											<div>
												<div className="font-medium">
													{e.display_name || e.username || `user:${e.user_id}`}
												</div>
												<div className="text-muted-foreground">{e.email}</div>
											</div>
										</label>
									))
								)}
							</div>
						</CardContent>
					</Card>
				</>
			)}
		</div>
	);
}

