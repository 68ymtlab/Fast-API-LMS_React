import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import axios from "../lib/axios";

import { roleRedirectMap } from "@/router/router";
import type { User } from "@/types/api/auth/user";
import { useLoginUser } from "./useLoginUser";

export const useAuth = () => {
  const { setLoginUser } = useLoginUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
            axios.get("/home_profile").then((res) => {
              if (res.status === 200) {
                const user = res.data as User;
                setLoginUser(user);
                const redirectPath = roleRedirectMap[user.kind_name] || roleRedirectMap.default;
                router.push(redirectPath);
              } else {
                setError("ユーザー情報の取得に失敗しました．");
              }
            });
          } else {
            setError("メールアドレスまたはパスワードが正しくありません．");
          }
        })
        .catch((error) => {
          if (error?.response?.data?.detail) {
            setError(error.response.data.detail);
          } else {
            setError("ログインに失敗しました");
          }
        })
        .finally(() => setIsLoading(false));
    },
    [setLoginUser, router],
  );

  const logout = useCallback(() => {
    setIsLoading(true);
    setError(null);
    axios
      .post("/logout")
      .then(() => {
        setLoginUser(null);
        router.push("/login");
      })
      .catch(() => {
        setError("ログアウトに失敗しました");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [setLoginUser, router]);

  return { login, logout, isLoading, error };
};
