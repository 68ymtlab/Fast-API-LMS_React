"use client";

import { Loader2 } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FC, type FormEvent, memo, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

// import { EmailForm } from "@/components/molecules/EmailForm";
import { EmailInput } from "@/components/atoms/input/EmailInput";
import { PasswordInput } from "@/components/atoms/input/PasswordInput";
import { DefaultHeader } from "@/components/atoms/layout/DefaultHeader";

export const Login: FC = memo(() => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: session, status } = useSession();

  useEffect(() => {
    if (session) {
      router.push("/home");
    }
    const errorQuery = searchParams.get("error");
    if (errorQuery) {
      setError("認証に失敗しました。再度お試しください。");
    }
  }, [session, router, searchParams]);

  // ログイン処理
  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      redirect: false,
      email: email,
      password: password,
    });

    setIsLoading(false);

    if (result?.error) {
      // 認証失敗時
      setError("メールアドレスまたはパスワードが正しくありません。");
    } else if (result?.ok) {
      // 認証成功時
      router.push("/home");
      // ページをリフレッシュしてサーバーコンポーネントのセッション情報を更新
      router.refresh();
    }
  };

  if (status === "loading") {
    return (
      <div className="flex flex-col w-full min-h-screen">
        <DefaultHeader />
        <div className="flex flex-col flex-grow item-center justify-center space-y-2">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">認証情報を確認しています．．．</p>
        </div>
      </div>
    );
  }

  // 未認証の場合のみログインフォームを表示
  if (status === "unauthenticated") {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <DefaultHeader />
        <main className="flex flex-grow items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold tracking-tight">学習支援システム</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent>
              {error && (
                <div className="mb-4 p-3 bg-destructive/15 border border-destructive text-destructive rounded-md text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleLogin}>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="email">メールアドレス</Label>
                    <EmailInput email={email} setEmail={setEmail} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">パスワード</Label>
                    <PasswordInput password={password} setPassword={setPassword} />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    ログイン
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // 認証済みの場合は何も表示しない（useEffectでリダイレクトされる）
  return null;
});

export default Login;
