"use client";

import { DefaultHeader } from "@/components/atoms/layout/DefaultHeader";
import { useLoginUser } from "@/hooks/useLoginUser";
import { pageAccessRules, roleRedirectMap } from "@/router/router";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type ComponentType, useEffect } from "react";

const withAuth = <P extends object>(WrappedComponent: ComponentType<P>, requiredRoles?: string[]) => {
  const AuthComponent = (props: P) => {
    const { loginUser, isLoadingUser } = useLoginUser();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
      if (isLoadingUser) {
        return; // ユーザー情報読み込み中は待機
      }

      if (!loginUser) {
        router.push("/login"); // 未ログインならログインページへ
        return;
      }

      const userRole = loginUser.kind_name;

      // ログイン直後のリダイレクト（ログインページから遷移してきた場合など）
      // また，ログインしているが，現在のページが "/"のような共有ページだった場合
      if (pathname === "/login") {
        const redirectPath = roleRedirectMap[userRole] || roleRedirectMap.default;
        if (pathname !== redirectPath) {
          router.push(redirectPath);
          return;
        }
      }

      // 権限チェック
      if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(userRole)) {
        // このページに必要なロールを持っていない場合
        alert("このページにアクセスする権限がありません．");
        const fallbackRedirectPath = roleRedirectMap[userRole] || roleRedirectMap.default;
        router.push(fallbackRedirectPath);
        return;
      }

      // URL直打ちなどによるアクセス制御
      const allowedPaths = pageAccessRules[userRole] || [];
      const isAllowed = allowedPaths.some((allowedPaths) => pathname.startsWith(allowedPaths));

      if (!isAllowed && !pathname.startsWith("/login")) {
        alert("このページにアクセスする権限がありません．");
        const fallbackRedirectPath = roleRedirectMap[userRole] || roleRedirectMap.default;
        router.push(fallbackRedirectPath);
        return;
      }
    }, [loginUser, isLoadingUser, pathname, router, requiredRoles]);

    if (isLoadingUser || !loginUser) {
      return (
        <div className="flex flex-col min-h-screen">
          <DefaultHeader />
          <div className="flex flex-1 flex-col items-center justify-center space-y-4 p-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">認証情報を確認しています．．．</p>
          </div>
        </div>
      );
    }

    // 権限チェックを通過した場合のみコンポーネントを描画
    return <WrappedComponent {...props} />;
  };
  return AuthComponent;
};

export default withAuth;
