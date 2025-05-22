"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FC, memo, useEffect, useState } from "react";
import { useCookies } from "react-cookie";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

// import { EmailForm } from "@/components/molecules/EmailForm";
import { EmailInput } from "@/components/atoms/input/EmailInput";
import { PasswordInput } from "@/components/atoms/input/PasswordInput";

import { DefaultHeader } from "@/components/atoms/layout/DefaultHeader";
import { useAuth } from "@/hooks/useAuth";
import { useLoginUser } from "@/hooks/useLoginUser";

export const Login: FC = memo(() => {
  const { login, isLoading, error } = useAuth();
  const { loginUser, isLoadingUser } = useLoginUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cookies] = useCookies(["access_token"]);
  const router = useRouter();

  useEffect(() => {
    if (!isLoadingUser && cookies.access_token && loginUser) {
      router.push("/home");
    }
  }, [cookies.access_token, loginUser, isLoadingUser, router]);

  const onClickLogin = () => {
    if (email && password) {
      login(email, password);
    }
  };

  if (isLoadingUser || (cookies.access_token && !loginUser && !error)) {
    return (
      <div className="flex flex-col min-h-screen">
        <DefaultHeader />
        <div className="flex flex-col flex-grow item-center justify-center space-y-2">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">認証情報を確認しています．．．</p>
        </div>
      </div>
    );
  }

  if (cookies.access_token && loginUser) {
    return null;
  }

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
});

export default Login;
