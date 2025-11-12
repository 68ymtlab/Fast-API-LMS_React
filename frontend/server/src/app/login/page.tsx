"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { type FC, memo, useEffect, useState } from "react";
// import { EmailForm } from "@/components/molecules/EmailForm";
import { EmailInput } from "@/components/atoms/input/EmailInput";
import { PasswordInput } from "@/components/atoms/input/PasswordInput";
import { DefaultHeader } from "@/components/atoms/layout/DefaultHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { roleRedirectMap } from "@/router/router";

export const Login: FC = memo(() => {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLogging, setIsLogging] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();
	const { data: session } = useSession();

	// ログイン済みユーザーのリダイレクト
	// useEffect(() => {
	// 	if (!isLoadingUser && loginUser) {
	// 		const redirectPath =
	// 			roleRedirectMap[loginUser.kind_name] || roleRedirectMap.default;
	// 		console.log("[Login] Already logged in, redirecting to:", redirectPath);
	// 		router.replace(redirectPath);
	// 	}
	// }, [loginUser, isLoadingUser, router]);

	const onClickLogin = async () => {
		if (!email || !password) {
			setError("メールアドレスとパスワードを入力してください");
			return;
		}

		setIsLogging(true);
		setError(null);

		signIn("credentials", {
			callbackUrl: "/home",
			username: email,
			password: password,
		});
	};

	return (
		<div className="flex flex-col min-h-screen bg-background">
			<DefaultHeader />
			<main className="flex flex-grow items-center justify-center p-4">
				<Card className="w-full max-w-md shadow-lg">
					<CardHeader className="text-center">
						<CardTitle className="text-3xl font-bold tracking-tight">
							学習支援システム
						</CardTitle>
					</CardHeader>
					<Separator />
					<CardContent>
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
