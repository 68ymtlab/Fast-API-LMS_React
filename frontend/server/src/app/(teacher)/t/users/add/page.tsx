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
import { useLoginUser } from "@/hooks/useLoginUser";
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
}

const userTypes = ["学生", "教師"];

function AddUserPage() {
	const { loginUser, isLoadingUser } = useLoginUser();
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	const [errorMessages, setErrorMessages] = useState<string[]>([]);
	const [showSuccessDialog, setShowSuccessDialog] = useState(false);
	const [successMessage, setSuccessMessage] = useState("");
	const [users, setUsers] = useState<any[]>([]);
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
		},
	});

	useEffect(() => {
		if (!isLoadingUser && !loginUser) {
			router.push("/login");
		}
	}, [loginUser, isLoadingUser, router]);

	useEffect(() => {
		if (loginUser) {
			fetchUsers();
		}
	}, [loginUser]);

	const fetchUsers = async () => {
		try {
			const response = await axios.get("/get_users");
			setUsers(response.data);
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

		// 重複チェック
		if (users.some((u) => u.email === userData.email)) {
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
			};

			const validationErrors = validateUser(userData);
			if (validationErrors.length > 0) {
				setErrorMessages(validationErrors);
				setLoading(false);
				return;
			}

			const response = await axios.post("/add_user", userData);

			if (response.data.success) {
				setSuccessMessage(`${data.username}を登録しました`);
				setShowSuccessDialog(true);
				form.reset();
				await fetchUsers(); // ユーザーリストを更新
				setTimeout(() => setShowSuccessDialog(false), 3000);
			} else {
				setErrorMessages([
					response.data.error_msgs || "ユーザーの登録に失敗しました",
				]);
			}
		} catch (error: any) {
			console.error("Error adding user:", error);
			setErrorMessages(["ユーザーの登録に失敗しました"]);
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
				if (parts.length !== 4) {
					setErrorMessages([
						"CSVファイルのデータが間違っています。形式を確認してください",
					]);
					return;
				}

				const userData: User = {
					username: parts[0].trim(),
					email: parts[1].trim(),
					password: parts[2].trim(),
					kind_name: parts[3].replace("\r", "").trim(),
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

			const response = await axios.post("/add_users", validUsers);

			if (response.data.success) {
				setSuccessMessage(`${validUsers.length}件のユーザーを登録しました`);
				setShowSuccessDialog(true);
				setFileUsers([]);
				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}
				await fetchUsers(); // ユーザーリストを更新
				setTimeout(() => setShowSuccessDialog(false), 3000);
			} else {
				setErrorMessages([
					response.data.error_msgs || "ユーザーの一括登録に失敗しました",
				]);
			}
		} catch (error: any) {
			console.error("Error adding users:", error);
			setErrorMessages(["ユーザーの一括登録に失敗しました"]);
		} finally {
			setLoading(false);
		}
	};

	if (isLoadingUser) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
			</div>
		);
	}

	if (!loginUser) {
		return null;
	}

	return (
		<div className="container mx-auto py-8 px-4 max-w-4xl">
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
										<div className="overflow-x-auto">
											<table className="w-full border border-gray-300 rounded-lg">
												<thead>
													<tr className="bg-gray-50">
														<th className="border border-gray-300 px-4 py-2 text-left">
															ユーザー名
														</th>
														<th className="border border-gray-300 px-4 py-2 text-left">
															メールアドレス
														</th>
														<th className="border border-gray-300 px-4 py-2 text-left">
															パスワード
														</th>
														<th className="border border-gray-300 px-4 py-2 text-left">
															ユーザー種別
														</th>
													</tr>
												</thead>
												<tbody>
													<tr className="text-sm text-gray-600">
														<td className="border border-gray-300 px-4 py-2">
															田中太郎
														</td>
														<td className="border border-gray-300 px-4 py-2">
															tanaka@example.com
														</td>
														<td className="border border-gray-300 px-4 py-2">
															password123
														</td>
														<td className="border border-gray-300 px-4 py-2">
															学生
														</td>
													</tr>
												</tbody>
											</table>
										</div>
										<p className="text-sm text-gray-500 mt-2">
											※ ユーザー種別は「学生」または「教師」を指定してください
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
											<div className="max-h-40 overflow-y-auto border border-gray-300 rounded-lg">
												<table className="w-full text-sm">
													<thead className="bg-gray-50 sticky top-0">
														<tr>
															<th className="border-b border-gray-300 px-3 py-2 text-left">
																ユーザー名
															</th>
															<th className="border-b border-gray-300 px-3 py-2 text-left">
																メール
															</th>
															<th className="border-b border-gray-300 px-3 py-2 text-left">
																種別
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
