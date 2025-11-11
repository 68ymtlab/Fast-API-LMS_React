import NextAuth from "next-auth";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    username: string;
    displayName: string;
    email: string;
    role_id: number;
    is_active: boolean;
    id: number;
    theme_settings: {
      mode: "light" | "dark" | "system";
      theme: string;
      font_size: string;
    };
    created_at: string;
    updated_at: string;
    role: {
      name: string;
      description: string;
      id: number;
    }
  }

  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}