import { isAxiosError } from "axios";
import NextAuth, { type User, type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import axios from "@/lib/axios";
import debug from "@/lib/utils/debug";

interface UserProfile {
  id: number;
  username: string;
  display_name?: string;
  email: string;
  role: number;
  theme_settings: {
    mode: "light" | "dark";
    theme: string;
    font_size: string;
  };
}

export const authOptions: AuthOptions = {
  // プロバイダーの設定
  providers: [
    CredentialsProvider({
      // ログインフォームに表示される名前
      name: "Credentials",
      // ログインフォームの入力フィールドを定義
      credentials: {
        email: { label: "メールアドレス", type: "email", placeholder: "c0000000@st.kanazawa-it.ac.jp" },
        password: { label: "パスワード", type: "password", placeholder: "パスワードを入力" },
      },
      // 認証ロジック
      async authorize(credentials): Promise<User | null> {
        // credentialsにemailかpasswordがなければnullを返す
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // バックエンドの認証APIにリクエストを送信
          const tokenRes = await axios.post("/token", {
            email: credentials.email,
            password: credentials.password,
          });

          // 認証が失敗した場合 (axiosは2xx以外のステータスで例外を出力)
          if (tokenRes.status !== 200) {
            debug.warn("Backend authentication failed", {
              status: tokenRes.status,
              data: tokenRes.data,
            });
            return null;
          }

          // ユーザー情報の取得
          const profileRes = await axios.get("/home_profile");

          if (profileRes.status !== 200 || !profileRes.data) {
            debug.warn("Failed to fetch user profile", {
              status: profileRes.status,
              data: profileRes.data,
            });
            return null;
          }

          const user_profile: UserProfile = profileRes.data;

          if (user_profile) {
            debug.info("User successfully authenticated", user_profile);
            const user: User = {
              id: String(user_profile.id),
              name: user_profile.display_name || user_profile.username,
              email: user_profile.email,
              username: user_profile.username,
              display_name: user_profile.display_name || "",
              role: user_profile.role,
              theme_settings: user_profile.theme_settings,
            };
            return user;
          }
          return null;
        } catch (error: unknown) {
          if (isAxiosError(error)) {
            const method = error.config?.method?.toUpperCase() || "UNKNOWN";
            const url = error.config?.url || "unknown URL";
            debug.apiError(method, url, error.response?.data || error.message);
          }
          // 他の種類のエラーの場合もnullを返す
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // セッションの有効期限を設定
    maxAge: 24 * 60 * 60, // 24時間
  },
  callbacks: {
    // JWTが作成・更新されるたびに呼ばれる
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.username = user.username;
        token.display_name = user.display_name || "";
        token.role = user.role;
        token.theme_settings = user.theme_settings;
      }
      return token;
    },
    // セッションがアクセスされるたびに呼ばれる
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = String(token.id);
        session.user.email = String(token.email);
        session.user.username = String(token.username);
        session.user.display_name = String(token.display_name ?? "");
        session.user.role = Number(token.role);
        session.user.theme_settings = token.theme_settings ?? { mode: "light", theme: "default", font_size: "medium" };
      }
      return session;
    },
  },
  pages: {
    signIn: "login", // ログインページのパス
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
