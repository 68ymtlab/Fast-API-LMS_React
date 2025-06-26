import { type Dispatch, type SetStateAction, createContext, useContext, useEffect, useState } from "react";
import axios from "../lib/axios";
import type { User } from "../types/api/auth/user";

export type LoginUserContextType = {
  loginUser: User | null;
  setLoginUser: Dispatch<SetStateAction<User | null>>;
  isLoadingUser: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
};

export const LoginUserContext = createContext<LoginUserContextType>({} as LoginUserContextType);

export const useLoginUser = () => {
  const context = useContext(LoginUserContext);
  if (!context) {
    throw new Error("useLoginUser must be used within LoginUserProvider");
  }
  return context;
};

export const LoginUserProvider = (props: { children: React.ReactNode }) => {
  const { children } = props;
  const [loginUser, setLoginUser] = useState<User | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  // 初期化時にlocalStorageから認証情報を復元
  useEffect(() => {
    const initAuth = async () => {
      console.log("[Auth] Initializing...");
      
      const token = localStorage.getItem("token");
      const userData = localStorage.getItem("userData");
      
      if (token && userData) {
        try {
          const user = JSON.parse(userData);
          console.log("[Auth] Restored user from localStorage:", user.kind_name);
          setLoginUser(user);
        } catch (error) {
          console.error("[Auth] Failed to parse stored user data:", error);
          localStorage.removeItem("token");
          localStorage.removeItem("userData");
        }
      } else {
        console.log("[Auth] No stored authentication found");
      }
      
      setIsLoadingUser(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    console.log("[Auth] Login attempt for:", email);
    
    try {
      // 1. トークンを取得
      const tokenResponse = await axios.post("/token", { email, password });
      
      if (tokenResponse.status !== 200 || !tokenResponse.data.access_token) {
        console.error("[Auth] Token request failed");
        return false;
      }
      
      const token = tokenResponse.data.access_token;
      console.log("[Auth] Token received");
      
      // 2. ユーザー情報を取得
      const userResponse = await axios.get("/home_profile", {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (userResponse.status !== 200 || !userResponse.data) {
        console.error("[Auth] User profile request failed");
        return false;
      }
      
      const user = userResponse.data;
      console.log("[Auth] Login successful for user:", user.kind_name);
      
      // 3. 認証情報をlocalStorageに保存
      localStorage.setItem("token", token);
      localStorage.setItem("userData", JSON.stringify(user));
      
      // 4. axiosのデフォルトヘッダーに設定
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      // 5. 状態を更新
      setLoginUser(user);
      
      return true;
    } catch (error) {
      console.error("[Auth] Login failed:", error);
      return false;
    }
  };

  const logout = () => {
    console.log("[Auth] Logging out");
    
    // 1. localStorageをクリア
    localStorage.removeItem("token");
    localStorage.removeItem("userData");
    
    // 2. axiosのヘッダーをクリア
    delete axios.defaults.headers.common['Authorization'];
    
    // 3. 状態をクリア
    setLoginUser(null);
  };

  return (
    <LoginUserContext.Provider value={{ 
      loginUser, 
      setLoginUser, 
      isLoadingUser, 
      login, 
      logout 
    }}>
      {children}
    </LoginUserContext.Provider>
  );
};
