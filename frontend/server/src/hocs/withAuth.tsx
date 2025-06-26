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
      console.log("[withAuth] Simple check:", { 
        pathname, 
        isLoadingUser, 
        hasUser: !!loginUser
      });

      if (isLoadingUser) {
        console.log("[withAuth] Loading user, waiting...");
        return; // ユーザー情報読み込み中は待機
      }

      if (!loginUser) {
        console.log("[withAuth] No user, redirecting to login");
        router.push("/login"); // 未ログインならログインページへ
        return;
      }

      console.log("[withAuth] User found, allowing access");
    }, [loginUser, isLoadingUser, pathname, router]);

    if (isLoadingUser) {
      console.log("[withAuth] Showing loading screen");
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

    if (!loginUser) {
      console.log("[withAuth] No user found, showing loading (should redirect soon)");
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

    // ログインしていれば、権限に関係なくコンポーネントを描画
    return <WrappedComponent {...props} />;
  };
  return AuthComponent;
};

export default withAuth;
