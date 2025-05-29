import { type Dispatch, type SetStateAction, createContext, useEffect, useState } from "react";
// import { useCookies } from "react-cookie"; // HttpOnlyの場合、クライアントでのトークン読み取りは不要
import axios from "../lib/axios";
import type { User } from "../types/api/auth/user";

export type LoginUserContextType = {
  loginUser: User | null;
  setLoginUser: Dispatch<SetStateAction<User | null>>;
  isLoadingUser: boolean;
};

export const LoginUserContext = createContext<LoginUserContextType>({} as LoginUserContextType);

export const LoginUserProvider = (props: { children: React.ReactNode }) => {
  const { children } = props;
  const [loginUser, setLoginUser] = useState<User | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  // const [cookies] = useCookies(["token"]); // HttpOnly の場合は不要

  useEffect(() => {
    let isMounted = true;

    const attemptFetchUser = async () => {
      if (!loginUser && isLoadingUser) {
        // 初期ロード時など、ユーザー未取得かつローディング中の場合のみ
        try {
          const res = await axios.get("/home_profile");
          if (isMounted) {
            if (res.status === 200 && res.data) {
              setLoginUser(res.data);
            } else {
              setLoginUser(null);
            }
          }
        } catch (error) {
          console.error("[LoginUserProvider HttpOnly Aware] Error fetching user data:", error);
          if (isMounted) {
            setLoginUser(null);
          }
        } finally {
          if (isMounted) {
            setIsLoadingUser(false);
          }
        }
      } else if (loginUser && isLoadingUser) {
        if (isMounted) setIsLoadingUser(false);
      } else if (!loginUser && !isLoadingUser) {
        // この状態は何もしないか、特定の条件下で再試行するなどのロジックを検討
      }
    };

    attemptFetchUser();

    return () => {
      isMounted = false;
    };
  }, [loginUser, isLoadingUser]); // loginUser, isLoadingUserを依存関係に含め、状態変化に対応
  return (
    <LoginUserContext.Provider value={{ loginUser, setLoginUser, isLoadingUser }}>{children}</LoginUserContext.Provider>
  );
};
