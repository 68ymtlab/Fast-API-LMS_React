import NextAuth, { DefaultSession, DefaultUser } from "next-auth";
import { JWT } from "next-auth/jwt";
import type {
	FastAouUser as User,
	ThemeSettings,
	Role,
} from "@/types/api/auth/user";
import type { LoginResponse } from "@/types/api/auth/user";
import { de } from "zod/v4/locales";
declare module "next-auth" {
	interface User extends DefaultUser {
		id: string;

		username: string;
		role_id: number;
		is_active: boolean;
		theme_settings: ThemeSettings;
		created_at: string;
		updated_at: string;
		role: Role;

		accessToken?: string;
		refreshToken?: string;
	}

	interface Session {
		user: User;
		accessToken?: string;
		refreshToken?: string;
	}
}

declare module "next-auth/jwt" {
	interface JWT {
		user?: FastApiUser;
		accessToken?: string;
		refreshToken?: string;
	}
}
