"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertCircle,
	CheckCircle,
	Upload,
	UserPlus,
	Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import axios from "@/lib/axios";

const formSchema = z
	.object({
		username: z
			.string()
			.min(1, "ユーザー名を入力してください")
			.max(50, "ユーザー名は50文字以内で入力してください"),
		email: z
			.string()
			.min(1, "メールアドレスを入力してください")
			.email("有効なメールアドレスを入力してください"),
		password: z
			.string()
			.min(1, "パスワードを入力してください")
			.min(6, "パスワードは6文字以上で入力してください"),
		confirmPassword: z.string().min(1, "パスワードの確認を入力してください"),
		userType: z.string().min(1, "ユーザー種別を選択してください"),
		studentGrade: z.string().optional(),
		studentDepartment: z.string().optional(),
		studentClassNumber: z.string().optional(),
		studentNumber: z.string().optional(),
		classRosterNumber: z.string().optional(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "パスワードが一致しません",
		path: ["confirmPassword"],
	});

type FormData = z.infer<typeof formSchema>;

interface User {
	username: string;
	email: string;
	password: string;
	kind_name: string;
	student_grade?: string;
	student_department?: string;
	student_class_number?: string;
	student_number?: string;
	class_roster_number?: string;
}

type ExistingUserForValidation = {
	email: string;
};

type BulkCreateResponse = {
	created_count: number;
	failed_count: number;
	results: Array<{
		email: string;
		status: "created" | "failed";
		user_id?: number | null;
		message?: string | null;
	}>;
};

const userTypes = ["学生", "教師"];

function AddUserPage() {
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	const [errorMessages, setErrorMessages] = useState<string[]>([]);
	const [showSuccessDialog, setShowSuccessDialog] = useState(false);
	const [successMessage, setSuccessMessage] = useState("");
	const [users, setUsers] = useState<ExistingUserForValidation[]>([]);
	const [fileUsers, setFileUsers] = useState<User[]>([]);
	const [isFileUpload, setIsFileUpload] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			username: "",
			email: "",
			password: "",
			confirmPassword: "",
			userType: "",
			studentGrade: "",
			studentDepartment: "",
			studentClassNumber: "",
			studentNumber: "",
			classRosterNumber: "",
		},
	});
	const selectedUserType = form.watch("userType");

	// ユーザー種別名からrole_idへの変換
	const getRoleId = (kindName: string): number => {
		switch (kindName) {
			case "教師":
				return 2;
			case "学生":
				return 3;
			default:
				return 3; // デフォルトは学生
		}
	};

	const fetchUsers = async () => {
		try {
			// 管理者専用API(/admin/users)に依存せず、教師でも取得できるAPIを使用する
			const [studentsRes, teachersRes] = await Promise.all([
				axios.get("/users/students"),
				axios.get("/users/teachers"),
			]);

			const allUsers = [...(studentsRes.data ?? []), ...(teachersRes.data ?? [])];
			const uniqueByEmail = new Map<string, ExistingUserForValidation>();

			for (const u of allUsers) {
				if (u?.email) {
					uniqueByEmail.set(String(u.email).toLowerCase(), { email: String(u.email) });
				}
			}
			setUsers(Array.from(uniqueByEmail.values()));
		} catch (error) {
			console.error("Error fetching users:", error);
		}
	};

	const validateUser = (
		userData: User,
		isFileUpload: boolean = false,
	): string[] => {
		const errors: string[] = [];

		if (!userData.username) {
			errors.push(
				isFileUpload
					? "ユーザー名が入力されていない箇所があります"
					: "ユーザー名を入力してください",
			);
		}
		if (!userData.email) {
			errors.push(
				isFileUpload
					? "メールアドレスが入力されていない箇所があります"
					: "メールアドレスを入力してください",
			);
		}
		if (!userData.password) {
			errors.push(
				isFileUpload
					? "パスワードが入力されていない箇所があります"
					: "パスワードを入力してください",
			);
		}
		if (!userData.kind_name) {
			errors.push(
				isFileUpload
					? "ユーザー種別が入力されていない箇所があります"
					: "ユーザー種別を選択してください",
			);
		}
		if (!userTypes.includes(userData.kind_name)) {
			errors.push(
				isFileUpload
					? `ユーザー種別は「学生」または「教師」を指定してください: ${userData.kind_name}`
					: "ユーザー種別が不正です",
			);
		}
		if (userData.kind_name === "学生" && userData.student_grade) {
			const grade = Number.parseInt(userData.student_grade, 10);
			if (Number.isNaN(grade) || grade < 1) {
				errors.push(
					isFileUpload
						? `${userData.email}: 学年は1以上の整数で指定してください`
						: "学年は1以上の整数で入力してください",
				);
			}
		}

		// 重複チェック
		if (
			users.length > 0 &&
			users.some((u) => u.email.toLowerCase() === userData.email.toLowerCase())
		) {
			errors.push(`${userData.email}：すでに登録されています`);
		}

		return errors;
	};

	const onSubmit = async (data: FormData) => {
		setLoading(true);
		setErrorMessages([]);
		setIsFileUpload(false);

		try {
			const userData: User = {
				username: data.username,
				email: data.email,
				password: data.password,
				kind_name: data.userType,
				student_grade: data.studentGrade?.trim() || undefined,
				student_department: data.studentDepartment?.trim() || undefined,
				student_class_number: data.studentClassNumber?.trim() || undefined,
				student_number: data.studentNumber?.trim() || undefined,
				class_roster_number: data.classRosterNumber?.trim() || undefined,
			};

			const validationErrors = validateUser(userData);
			if (validationErrors.length > 0) {
				setErrorMessages(validationErrors);
				setLoading(false);
				return;
			}

			const studentInfo =
				data.userType === "学生"
					? {
							grade: userData.student_grade
								? Number.parseInt(userData.student_grade, 10)
								: undefined,
							department: userData.student_department || undefined,
							class_number: userData.student_class_number || undefined,
							student_number: userData.student_number || undefined,
							class_roster_number: userData.class_roster_number || undefined,
						}
					: undefined;

			// 新バックエンド POST /users (UserCreate スキーマ)
			await axios.post("/users", {
				username: userData.username,
				email: userData.email,
				password: userData.password,
				role_id: getRoleId(userData.kind_name),
				student_info: studentInfo,
			});

			// 201 Created が返れば成功
			setSuccessMessage(`${data.username}を登録しました`);
			setShowSuccessDialog(true);
			form.reset();
			await fetchUsers();
			setTimeout(() => setShowSuccessDialog(false), 3000);
		} catch (error: any) {
			console.error("Error adding user:", error);
			const detail = error.response?.data?.detail;
			setErrorMessages([detail || "ユーザーの登録に失敗しました"]);
		} finally {
			setLoading(false);
		}
	};

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		setErrorMessages([]);
		setFileUsers([]);

		const reader = new FileReader();
		reader.onload = (e) => {
			const csvData = e.target?.result as string;
			const lines = csvData.split("\n").filter((line) => line.trim() !== "");
			const newFileUsers: User[] = [];

			for (const line of lines) {
				const parts = line.split(",");
				if (parts.length !== 4 && parts.length !== 7 && parts.length !== 9) {
					setErrorMessages([
						"CSV形式が不正です。4列（基本）、7列（学生情報一部）、9列（学籍番号/名列番号込み）で作成してください",
					]);
					return;
				}

				const userData: User = {
					username: parts[0].trim(),
					email: parts[1].trim(),
					password: parts[2].trim(),
					kind_name: parts[3].replace("\r", "").trim(),
					student_grade: parts[4]?.trim(),
					student_department: parts[5]?.trim(),
					student_class_number: parts[6]?.replace("\r", "").trim(),
					student_number: parts[7]?.trim(),
					class_roster_number: parts[8]?.replace("\r", "").trim(),
				};

				newFileUsers.push(userData);
			}

			setFileUsers(newFileUsers);
		};

		reader.readAsText(file);
	};

	const handleBulkUpload = async () => {
		if (fileUsers.length === 0) {
			setErrorMessages(["CSVファイルが選択されていません"]);
			return;
		}

		setLoading(true);
		setErrorMessages([]);
		setIsFileUpload(true);

		try {
			const validUsers: User[] = [];
			const allErrors: string[] = [];

			for (const userData of fileUsers) {
				const validationErrors = validateUser(userData, true);
				if (validationErrors.length > 0) {
					allErrors.push(...validationErrors);
				} else {
					validUsers.push(userData);
				}
			}

			if (allErrors.length > 0) {
				setErrorMessages(allErrors);
				setLoading(false);
				return;
			}

			if (validUsers.length === 0) {
				setErrorMessages(["有効なユーザーデータがありません"]);
				setLoading(false);
				return;
			}

			const payload = validUsers.map((u) => ({
				username: u.username,
				email: u.email,
				password: u.password,
				role_id: getRoleId(u.kind_name),
				student_info:
					u.kind_name === "学生"
						? {
								grade: u.student_grade
									? Number.parseInt(u.student_grade, 10)
									: undefined,
								department: u.student_department || undefined,
								class_number: u.student_class_number || undefined,
								student_number: u.student_number || undefined,
								class_roster_number: u.class_roster_number || undefined,
							}
						: undefined,
			}));

			const response = await axios.post<BulkCreateResponse>("/users/bulk", payload);
			const result = response.data;

			const errors = result.results
				.filter((r) => r.status === "failed")
				.map((r) => `${r.email}: ${r.message || "登録に失敗しました"}`);

			if (errors.length > 0) setErrorMessages(errors);
			if (result.created_count > 0) {
				setSuccessMessage(`${result.created_count}件のユーザーを登録しました`);
				setShowSuccessDialog(true);
				setFileUsers([]);
				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}
				await fetchUsers();
				setTimeout(() => setShowSuccessDialog(false), 3000);
			}
		} catch (error: any) {
			console.error("Error adding users:", error);
			setErrorMessages(["ユーザーの一括登録に失敗しました"]);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchUsers();
	}, []);

	return (
		<div className="container mx-auto py-8 px-4 max-w-6xl">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl flex items-center gap-3">
						<UserPlus className="h-6 w-6" />
						ユーザー追加
					</CardTitle>
					<CardDescription>学生や教師のアカウントを作成します</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-8">
						{/* エラーメッセージ */}
						{errorMessages.length > 0 && (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>
									<ul className="list-disc list-inside space-y-1">
										{errorMessages.map((error, index) => (
											<li key={index}>{error}</li>
										))}
									</ul>
								</AlertDescription>
							</Alert>
						)}

						{/* 単体追加 */}
						<Card>
							<CardHeader>
								<CardTitle className="text-lg flex items-center gap-2">
									<UserPlus className="h-5 w-5" />
									ユーザーを個別に登録
								</CardTitle>
								<CardDescription>1つずつユーザーを追加します</CardDescription>
							</CardHeader>
							<CardContent>
								<Form {...form}>
									<form
										onSubmit={form.handleSubmit(onSubmit)}
										className="space-y-6"
									>
										<FormField
											control={form.control}
											name="username"
											render={({ field }) => (
												<FormItem>
													<FormLabel>ユーザー名</FormLabel>
													<FormControl>
														<Input
															placeholder="山田太郎"
															{...field}
															disabled={loading}
															autoComplete="username"
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="email"
											render={({ field }) => (
												<FormItem>
													<FormLabel>メールアドレス</FormLabel>
													<FormControl>
														<Input
															type="email"
															placeholder="yamada@example.com"
															{...field}
															disabled={loading}
															autoComplete="email"
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="password"
											render={({ field }) => (
												<FormItem>
													<FormLabel>パスワード</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder="パスワードを入力"
															{...field}
															disabled={loading}
															autoComplete="new-password"
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="confirmPassword"
											render={({ field }) => (
												<FormItem>
													<FormLabel>パスワード（再入力）</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder="パスワードを再入力"
															{...field}
															disabled={loading}
															autoComplete="new-password"
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="userType"
											render={({ field }) => (
												<FormItem>
													<FormLabel>ユーザー種別</FormLabel>
													<Select
														onValueChange={field.onChange}
														value={field.value}
														disabled={loading}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue placeholder="ユーザー種別を選択" />
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															{userTypes.map((type) => (
																<SelectItem key={type} value={type}>
																	{type}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
													<FormMessage />
												</FormItem>
											)}
										/>

										{selectedUserType === "学生" && (
											<div className="space-y-4 rounded-lg border p-4 bg-muted/20">
												<p className="text-sm font-medium">
													学生情報（任意）
												</p>
												<FormField
													control={form.control}
													name="studentGrade"
													render={({ field }) => (
														<FormItem>
															<FormLabel>学年</FormLabel>
															<FormControl>
																<Input
																	type="number"
																	min="1"
																	placeholder="例: 1"
																	{...field}
																	disabled={loading}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={form.control}
													name="studentDepartment"
													render={({ field }) => (
														<FormItem>
															<FormLabel>所属</FormLabel>
															<FormControl>
																<Input
																	placeholder="例: 情報工学科"
																	{...field}
																	disabled={loading}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={form.control}
													name="studentClassNumber"
													render={({ field }) => (
														<FormItem>
															<FormLabel>クラス番号</FormLabel>
															<FormControl>
																<Input
																	placeholder="例: A1"
																	{...field}
																	disabled={loading}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={form.control}
													name="studentNumber"
													render={({ field }) => (
														<FormItem>
															<FormLabel>学籍番号</FormLabel>
															<FormControl>
																<Input
																	placeholder="例: 24A1234"
																	{...field}
																	disabled={loading}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={form.control}
													name="classRosterNumber"
													render={({ field }) => (
														<FormItem>
															<FormLabel>名列番号</FormLabel>
															<FormControl>
																<Input
																	placeholder="例: 12"
																	{...field}
																	disabled={loading}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
											</div>
										)}

										<div className="flex justify-center">
											<Button type="submit" disabled={loading} className="px-8">
												{loading ? "登録中..." : "登録"}
											</Button>
										</div>
									</form>
								</Form>
							</CardContent>
						</Card>

						<Separator />

						{/* 一括追加 */}
						<Card>
							<CardHeader>
								<CardTitle className="text-lg flex items-center gap-2">
									<Upload className="h-5 w-5" />
									CSVファイルからまとめて登録
								</CardTitle>
								<CardDescription>
									CSVファイルを使って複数のユーザーを一度に登録できます
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="space-y-6">
									{/* CSVフォーマット説明 */}
									<div>
										<h4 className="font-semibold mb-3">CSVの形式</h4>
										<div className="overflow-x-auto border border-gray-300 rounded-lg">
											<table className="w-full min-w-[1100px] text-sm">
												<thead>
													<tr className="bg-gray-50">
														<th className="border border-gray-300 px-4 py-2 text-left whitespace-nowrap">
															ユーザー名
														</th>
														<th className="border border-gray-300 px-4 py-2 text-left whitespace-nowrap">
															メールアドレス
														</th>
														<th className="border border-gray-300 px-4 py-2 text-left whitespace-nowrap">
															パスワード
														</th>
														<th className="border border-gray-300 px-4 py-2 text-left whitespace-nowrap">
															ユーザー種別
														</th>
														<th className="border border-gray-300 px-4 py-2 text-left whitespace-nowrap">
															学年（任意）
														</th>
														<th className="border border-gray-300 px-4 py-2 text-left whitespace-nowrap">
															所属（任意）
														</th>
														<th className="border border-gray-300 px-4 py-2 text-left whitespace-nowrap">
															クラス番号（任意）
														</th>
														<th className="border border-gray-300 px-4 py-2 text-left whitespace-nowrap">
															学籍番号（任意）
														</th>
														<th className="border border-gray-300 px-4 py-2 text-left whitespace-nowrap">
															名列番号（任意）
														</th>
													</tr>
												</thead>
												<tbody>
													<tr className="text-sm text-gray-600">
														<td className="border border-gray-300 px-4 py-2 whitespace-nowrap">
															田中太郎
														</td>
														<td className="border border-gray-300 px-4 py-2 whitespace-nowrap">
															tanaka@example.com
														</td>
														<td className="border border-gray-300 px-4 py-2 whitespace-nowrap">
															password123
														</td>
														<td className="border border-gray-300 px-4 py-2 whitespace-nowrap">
															学生
														</td>
														<td className="border border-gray-300 px-4 py-2 whitespace-nowrap">
															1
														</td>
														<td className="border border-gray-300 px-4 py-2 whitespace-nowrap">
															情報工学科
														</td>
														<td className="border border-gray-300 px-4 py-2 whitespace-nowrap">
															A1
														</td>
														<td className="border border-gray-300 px-4 py-2 whitespace-nowrap">
															24A1234
														</td>
														<td className="border border-gray-300 px-4 py-2 whitespace-nowrap">
															12
														</td>
													</tr>
												</tbody>
											</table>
										</div>
										<p className="text-sm text-gray-500 mt-2">
											※ 基本4列（ユーザー名,メール,パスワード,ユーザー種別）でも登録可能です
										</p>
										<p className="text-sm text-gray-500">
											※ 学生情報を入れる場合は7列または9列にしてください（学籍番号/名列番号は9列目まで）
										</p>
									</div>

									{/* ファイルアップロード */}
									<div>
										<label className="block text-sm font-medium mb-2">
											CSVファイル選択
										</label>
										<input
											ref={fileInputRef}
											type="file"
											accept=".csv"
											onChange={handleFileChange}
											className="block w-full text-sm text-gray-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-primary file:text-white
                        hover:file:bg-primary/90"
											disabled={loading}
										/>
									</div>

									{/* プレビュー */}
									{fileUsers.length > 0 && (
										<div>
											<h4 className="font-semibold mb-3 flex items-center gap-2">
												<Users className="h-4 w-4" />
												プレビュー（{fileUsers.length}件）
											</h4>
											<div className="max-h-56 overflow-auto border border-gray-300 rounded-lg">
												<table className="w-full min-w-[760px] text-sm">
													<thead className="bg-gray-50 sticky top-0">
														<tr>
															<th className="border-b border-gray-300 px-3 py-2 text-left whitespace-nowrap">
																ユーザー名
															</th>
															<th className="border-b border-gray-300 px-3 py-2 text-left whitespace-nowrap">
																メール
															</th>
															<th className="border-b border-gray-300 px-3 py-2 text-left whitespace-nowrap">
																種別
															</th>
															<th className="border-b border-gray-300 px-3 py-2 text-left whitespace-nowrap">
																学年
															</th>
															<th className="border-b border-gray-300 px-3 py-2 text-left whitespace-nowrap">
																学籍番号
															</th>
															<th className="border-b border-gray-300 px-3 py-2 text-left whitespace-nowrap">
																名列番号
															</th>
														</tr>
													</thead>
													<tbody>
														{fileUsers.map((user, index) => (
															<tr key={index} className="hover:bg-gray-50">
																<td className="border-b border-gray-200 px-3 py-2">
																	{user.username}
																</td>
																<td className="border-b border-gray-200 px-3 py-2">
																	{user.email}
																</td>
																<td className="border-b border-gray-200 px-3 py-2">
																	{user.kind_name}
																</td>
																<td className="border-b border-gray-200 px-3 py-2">
																	{user.student_grade || "-"}
																</td>
																<td className="border-b border-gray-200 px-3 py-2">
																	{user.student_number || "-"}
																</td>
																<td className="border-b border-gray-200 px-3 py-2">
																	{user.class_roster_number || "-"}
																</td>
															</tr>
														))}
													</tbody>
												</table>
											</div>
										</div>
									)}

									<div className="flex justify-center">
										<Button
											onClick={handleBulkUpload}
											disabled={loading || fileUsers.length === 0}
											className="px-8"
										>
											{loading ? "登録中..." : "まとめて登録する"}
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
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
						<DialogTitle className="text-xl">登録完了</DialogTitle>
						<DialogDescription>{successMessage}</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default AddUserPage;
