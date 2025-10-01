"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertCircle,
	CheckCircle,
	Edit,
	EyeOff,
	Mail,
	User,
	UserCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";

const formSchema = z
	.object({
		currentPassword: z.string().min(1, "現在のパスワードを入力してください"),
		newPassword: z.string().min(1, "新しいパスワードを入力してください"),
		confirmPassword: z.string().min(1, "パスワードの確認を入力してください"),
	})
	.refine((data) => data.newPassword === data.confirmPassword, {
		message: "新しいパスワードと確認用パスワードが一致しません",
		path: ["confirmPassword"],
	})
	.refine((data) => data.currentPassword !== data.newPassword, {
		message: "現在のパスワードと新しいパスワードが同じです",
		path: ["newPassword"],
	});

type FormData = z.infer<typeof formSchema>;

function TeacherSettingsPage() {
	const { loginUser, isLoadingUser } = useLoginUser();
	const router = useRouter();
	const [showPasswordModal, setShowPasswordModal] = useState(false);
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			currentPassword: "",
			newPassword: "",
			confirmPassword: "",
		},
	});

	useEffect(() => {
		if (!isLoadingUser && !loginUser) {
			router.push("/login");
		}
	}, [loginUser, isLoadingUser, router]);

	const handlePasswordUpdate = () => {
		setShowPasswordModal(true);
		setSuccess(false);
		setErrorMessage("");
		form.reset();
	};

	const onSubmit = async (data: FormData) => {
		setLoading(true);
		setErrorMessage("");
		setSuccess(false);

		try {
			const params = {
				email: loginUser?.email,
				old_password: data.currentPassword,
				new_password: data.newPassword,
			};

			const response = await axios.post("/update_password", params);

			if (response.data.success) {
				setSuccess(true);
				form.reset();
				setTimeout(() => {
					setShowPasswordModal(false);
					setSuccess(false);
				}, 2000);
			} else {
				setErrorMessage(
					response.data.error_msg || "パスワードの更新に失敗しました",
				);
			}
		} catch (error: any) {
			console.error("Error updating password:", error);
			if (error.response?.status === 401) {
				setErrorMessage("現在のパスワードが正しくありません");
			} else {
				setErrorMessage("パスワードの更新に失敗しました");
			}
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
					<CardTitle className="text-2xl">ユーザー設定</CardTitle>
					<CardDescription>
						教師アカウント情報の確認と変更ができます
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-6">
						{/* ユーザー基本情報 */}
						<div className="space-y-4">
							<h3 className="text-lg font-semibold border-b pb-2">基本情報</h3>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
									<User className="h-5 w-5 text-gray-500" />
									<div>
										<h4 className="font-semibold text-sm text-gray-600">
											ユーザー名
										</h4>
										<p className="text-lg">{loginUser?.username}</p>
									</div>
								</div>

								<div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
									<Mail className="h-5 w-5 text-gray-500" />
									<div>
										<h4 className="font-semibold text-sm text-gray-600">
											メールアドレス
										</h4>
										<p className="text-lg">{loginUser?.email}</p>
									</div>
								</div>

								<div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
									<UserCheck className="h-5 w-5 text-gray-500" />
									<div>
										<h4 className="font-semibold text-sm text-gray-600">
											ユーザー種別
										</h4>
										<p className="text-lg">{loginUser?.kind_name}</p>
									</div>
								</div>

								<div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
									<User className="h-5 w-5 text-gray-500" />
									<div>
										<h4 className="font-semibold text-sm text-gray-600">
											ニックネーム
										</h4>
										<p className="text-lg">{loginUser?.username}</p>
									</div>
									<Button variant="ghost" size="sm" className="ml-auto">
										<Edit className="h-4 w-4" />
									</Button>
								</div>
							</div>
						</div>

						{/* セキュリティ設定 */}
						<div className="space-y-4">
							<h3 className="text-lg font-semibold border-b pb-2">
								セキュリティ設定
							</h3>

							<div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
								<div className="flex items-center space-x-3">
									<EyeOff className="h-5 w-5 text-gray-500" />
									<div>
										<h4 className="font-semibold text-sm text-gray-600">
											パスワード
										</h4>
										<p className="text-lg">●●●●●●●●</p>
									</div>
								</div>
								<Button variant="outline" onClick={handlePasswordUpdate}>
									<Edit className="h-4 w-4 mr-2" />
									パスワード変更
								</Button>
							</div>
						</div>

						{/* アカウント情報 */}
						<div className="space-y-4">
							<h3 className="text-lg font-semibold border-b pb-2">
								アカウント情報
							</h3>

							<div className="p-4 bg-blue-50 rounded-lg">
								<div className="flex items-start space-x-3">
									<div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
									<div>
										<h4 className="font-semibold text-blue-800">教師権限</h4>
										<p className="text-sm text-blue-700 mt-1">
											このアカウントは教師権限を持っています。科目・コースの作成、編集、学生の成績管理など、教師向けの全機能を利用できます。
										</p>
									</div>
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* パスワード変更モーダル */}
			<Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>パスワードの変更</DialogTitle>
						<DialogDescription>
							セキュリティのため、定期的にパスワードを変更することをお勧めします
						</DialogDescription>
					</DialogHeader>

					{success && (
						<Alert className="mb-4 border-green-200 bg-green-50">
							<CheckCircle className="h-4 w-4 text-green-600" />
							<AlertDescription className="text-green-800">
								パスワードが正常に更新されました
							</AlertDescription>
						</Alert>
					)}

					{errorMessage && (
						<Alert variant="destructive" className="mb-4">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{errorMessage}</AlertDescription>
						</Alert>
					)}

					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
							<FormField
								control={form.control}
								name="currentPassword"
								render={({ field }) => (
									<FormItem>
										<FormLabel>現在のパスワード</FormLabel>
										<FormControl>
											<Input
												type="password"
												placeholder="現在のパスワードを入力"
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
								name="newPassword"
								render={({ field }) => (
									<FormItem>
										<FormLabel>新しいパスワード</FormLabel>
										<FormControl>
											<Input
												type="password"
												placeholder="新しいパスワードを入力"
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
								name="confirmPassword"
								render={({ field }) => (
									<FormItem>
										<FormLabel>新しいパスワード（確認）</FormLabel>
										<FormControl>
											<Input
												type="password"
												placeholder="新しいパスワードを再度入力"
												{...field}
												disabled={loading}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="flex justify-end gap-3">
								<Button
									type="button"
									variant="outline"
									onClick={() => setShowPasswordModal(false)}
									disabled={loading}
								>
									キャンセル
								</Button>
								<Button type="submit" disabled={loading}>
									{loading ? "更新中..." : "パスワードを変更"}
								</Button>
							</div>
						</form>
					</Form>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default TeacherSettingsPage;
