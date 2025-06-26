import { jwtDecode } from "jwt-decode";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useCookies } from "react-cookie";
import axios from "../lib/axios";

import { roleRedirectMap } from "@/router/router";
import type { User } from "@/types/api/auth/user";
import { useLoginUser } from "./useLoginUser";

interface DecodedToken {
  sub: string;
  kind_name: string;
  exp: number;
}

export const useAuth = () => {
  const { setLoginUser } = useLoginUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cookies, setCookie, removeCookie] = useCookies(["token"]);
  const router = useRouter();

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      setError(null);
      const params = { email, password };
      axios
        .post("/token", params)
        .then((res) => {
          if (res.status === 200 && res.data.access_token) {
            const token = res.data.access_token;
            console.log("[useAuth] Setting token cookie:", token.substring(0, 20) + "...");
            
            // より確実なCookie設定
            setCookie("token", token, {
              path: "/",
              maxAge: 60 * 60 * 24 * 7, // 7日間
              sameSite: "strict",
              secure: false, // 開発環境用
            });

            // Cookieが設定されるまで少し待つ
            setTimeout(() => {
              // Cookieが正しく設定されたか確認
              const allCookies = document.cookie;
              console.log("[useAuth] All cookies after setting:", allCookies);
              
              try {
                const decoded = jwtDecode<DecodedToken>(token);
                const userRole = decoded.kind_name;
                const redirectPath = roleRedirectMap[userRole] || roleRedirectMap.default;
                console.log(`[useAuth] Login successful. User role: ${userRole}, Redirecting to: ${redirectPath}`);
                router.replace(redirectPath);
              } catch (e) {
                console.error("Failed to decode token", e);
                setError("ログイン処理中に予期せぬエラーが発生しました。");
              }
            }, 200); // 200ms待機
          } else {
            setError("メールアドレスまたはパスワードが正しくありません．");
          }
        })
        .catch((err) => {
          if (err?.response?.data?.detail) {
            setError(err.response.data.detail);
          } else {
            setError("ログインに失敗しました。");
          }
        })
        .finally(() => setIsLoading(false));
    },
    [setCookie, router],
  );

  const logout = useCallback(() => {
    setIsLoading(true);
    setError(null);
    axios
      .post("/logout")
      .then(() => {
        removeCookie("token", { path: "/" });
        setLoginUser(null);
        router.push("/login");
      })
      .catch(() => {
        removeCookie("token", { path: "/" });
        setLoginUser(null);
        setError("ログアウトに失敗しました");
        router.push("/login");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [setLoginUser, router, removeCookie]);

  return { login, logout, isLoading, error };
};
