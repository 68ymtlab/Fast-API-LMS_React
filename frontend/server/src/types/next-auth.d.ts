import type { DefaultUser } from "next-auth";
import type { FastApiUser } from "@/types/api/auth/user";

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
