"use client";

//// 修正在り

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle } from "lucide-react";
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
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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

function TeacherPasswordUpdatePage() {
	const router = useRouter();
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

	const onSubmit = async (data: FormData) => {
		setLoading(true);
		setErrorMessage("");
		setSuccess(false);

		try {
			const params = {
				email: "example@example.com", // 仮のメールアドレス、必要に応じて実際のユーザーのメールアドレスに置き換えてください
				old_password: data.currentPassword,
				new_password: data.newPassword,
			};

			const response = await axios.post("/update_password", params);

			if (response.data.success) {
				setSuccess(true);
				form.reset();
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

	return (
		<div className="container mx-auto py-8 px-4 max-w-2xl">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">パスワードの更新</CardTitle>
					<CardDescription>
						セキュリティのため、定期的にパスワードを変更することをお勧めします
					</CardDescription>
				</CardHeader>
				<CardContent>
					{success && (
						<Alert className="mb-6 border-green-200 bg-green-50">
							<CheckCircle className="h-4 w-4 text-green-600" />
							<AlertDescription className="text-green-800">
								パスワードが正常に更新されました
							</AlertDescription>
						</Alert>
					)}

					{errorMessage && (
						<Alert variant="destructive" className="mb-6">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{errorMessage}</AlertDescription>
						</Alert>
					)}

					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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

							<div className="flex justify-center">
								<Button
									type="submit"
									disabled={loading}
									className="w-full max-w-xs"
								>
									{loading ? "更新中..." : "パスワードを変更する"}
								</Button>
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}

export default TeacherPasswordUpdatePage;
