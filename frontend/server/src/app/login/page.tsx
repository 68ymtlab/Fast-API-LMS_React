"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { getSession, signIn, useSession } from "next-auth/react";
import { type FC, memo, useEffect, useState } from "react";
import { EmailInput } from "@/components/atoms/input/EmailInput";
import { PasswordInput } from "@/components/atoms/input/PasswordInput";
import { DefaultHeader } from "@/components/atoms/layout/DefaultHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { roleRedirectMap } from "@/router/router";

const Login: FC = memo(() => {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLogging, setIsLogging] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();
	const { data: session, status } = useSession();

	// ログイン済みユーザーのリダイレクト
	useEffect(() => {
		if (status === "loading") return;

		if (status === "authenticated" && session?.user) {
			const userRole = session.user.role?.name;
			const redirectPath = roleRedirectMap[userRole] || roleRedirectMap.default;
			console.log(
				`[Login] Already logged in, redirecting to: ${redirectPath} (role: ${userRole})`,
			);
			router.replace(redirectPath);
		}
	}, [session, status, router]);

	const onClickLogin = async () => {
		if (!email || !password) {
			setError("メールアドレスとパスワードを入力してください");
			return;
		}

		setIsLogging(true);
		setError(null);

		try {
			const result = await signIn("credentials", {
				username: email,
				password: password,
				redirect: false,
			});

			if (!result?.ok) {
				setError("メールアドレスまたはパスワードが正しくありません");
				setIsLogging(false);
				return;
			}

			// ログイン成功 - セッションからユーザー情報を取得してリダイレクト
			const newSession = await getSession();
			const userRole = newSession?.user?.role?.name;
			const redirectPath = roleRedirectMap[userRole] || roleRedirectMap.default;

			console.log(
				`[Login] Login successful, redirecting to: ${redirectPath} (role: ${userRole})`,
			);
			router.push(redirectPath);
		} catch (err) {
			console.error("[Login] Login error:", err);
			setError("ログイン処理中にエラーが発生しました。");
			setIsLogging(false);
		}
	};

	return (
		<div className="flex flex-col min-h-screen bg-gray-100">
			<DefaultHeader />
			<main className="flex flex-grow items-center justify-center p-4 pt-16 md:pt-20">
				<Card className="w-full max-w-md shadow-md border-gray-200">
					<CardHeader className="text-center">
						<CardTitle className="text-2xl font-bold tracking-tight text-gray-800">
							学習支援システム
						</CardTitle>
					</CardHeader>
					<Separator />
					<CardContent className="pt-6">
						{error && (
							<div className="mb-4 p-3 bg-destructive/15 border border-destructive text-destructive rounded-md text-sm">
								{error}
							</div>
						)}
						<form
							onSubmit={(e) => {
								e.preventDefault();
								onClickLogin();
							}}
						>
							<div className="space-y-6">
								<div className="space-y-2">
									<Label htmlFor="email">メールアドレス</Label>
									<EmailInput email={email} setEmail={setEmail} />
								</div>
								<div className="space-y-2">
									<Label htmlFor="password">パスワード</Label>
									<PasswordInput
										password={password}
										setPassword={setPassword}
									/>
								</div>
								<Button type="submit" className="w-full" disabled={isLogging}>
									{isLogging ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											ログイン中
										</>
									) : (
										"ログイン"
									)}
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			</main>
		</div>
	);
});

export default Login;
