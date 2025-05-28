import { type Dispatch, type SetStateAction, createContext, useEffect, useState } from "react";
import { useCookies } from "react-cookie";
import axios from "../lib/axios";

import type { User } from "../types/api/auth/user";

export type LoginUserContextType = {
  loginUser: User | null;
  setLoginUser: Dispatch<SetStateAction<User | null>>;
  isLoadingUser: boolean;
  // isAuthenticated: boolean; 認証状況フラグ
};

export const LoginUserContext = createContext<LoginUserContextType>({} as LoginUserContextType);

export const LoginUserProvider = (props: { children: React.ReactNode }) => {
  const { children } = props;
  const [loginUser, setLoginUser] = useState<User | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [cookies] = useCookies(["token"]);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      // 既にチェック済みの場合はスキップ
      if (hasChecked) {
        return;
      }

      setIsLoadingUser(true);
      try {
        const res = await axios.get("/home_profile");
        if (res.status === 200) {
          setLoginUser(res.data);
        }
      } catch (error) {
        console.error("LoginUserProvider: Error fetching user data:", error);
        // 認証エラーの場合はユーザー情報をクリア
        setLoginUser(null);
      } finally {
        setIsLoadingUser(false);
        setHasChecked(true);
      }
    };

    fetchUser();
  }, []); // 初回のみ実行

  return <LoginUserContext value={{ loginUser, setLoginUser, isLoadingUser }}>{children}</LoginUserContext>;
};
