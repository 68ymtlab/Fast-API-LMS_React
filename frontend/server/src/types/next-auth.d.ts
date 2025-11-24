import NextAuth, { DefaultSession, type DefaultUser } from "next-auth";
import { JWT } from "next-auth/jwt";
import { de } from "zod/v4/locales";
import type {
	FastApiUser,
	LoginResponse,
	Role,
	ThemeSettings,
} from "@/types/api/auth/user";

declare module "next-auth" {
	interface User extends DefaultUser {
		id: string;
		name: string | null;
		email: string | null;

		fastApiUser: FastApiUser;

		accessToken?: string;
		refreshToken?: string;
	}

	interface Session {
		user: FastApiUser;
		accessToken?: string;
		refreshToken?: string;
		error?: string;
	}
}

declare module "next-auth/jwt" {
	interface JWT {
		fastApiUser: FastApiUser;
		accessToken?: string;
		refreshToken?: string;
		accessTokenExpires?: number;
		error?: string;
	}
}
