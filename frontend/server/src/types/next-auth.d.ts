import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

// theme_settingsの型を定義
interface ThemeSettings {
  mode: "light" | "dark";
  theme: string;
  font_size: string;
}

declare module "next-auth" {
  /**
   * `useSession` や `getSession` で返されるセッションオブジェクトの型
   */
  interface Session {
    user: {
      id: string;
      username: string;
      display_name: string;
      email: string;
      role: number;
      theme_settings: ThemeSettings;
    } & Omit<DefaultSession["user"], "id">;
  }

  /**
   * バックエンドのAPIから返されるユーザーオブジェクトの型
   * `authorize`コールバックで返されるオブジェクトと一致させる
   */
  interface User extends DefaultUser {
    username: string;
    display_name: string;
    role: number;
    theme_settings: ThemeSettings;
  }
}

declare module "next-auth/jwt" {
  /** JWTのペイロードの型 */
  interface JWT extends DefaultJWT {
    username: string;
    display_name: string;
    role: number;
    theme_settings: ThemeSettings;
  }
}
