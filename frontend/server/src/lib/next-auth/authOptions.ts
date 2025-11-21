import axios from "axios";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import qs from "qs";
import type { LoginResponse } from "@/types/api/auth/user";
import config from "../utils/config";

export const authOptions: NextAuthOptions = {
	// シークレットキーの設定
	secret: process.env.NEXTAUTH_SECRET,

	// ログの差し込み
	logger: {
		error(code, metadata) {
			console.error(code, metadata);
		},
		warn(code) {
			console.warn(code);
		},
	},
	providers: [
		// 認証プロバイダーの設定
		CredentialsProvider({
			name: "credentials",
			credentials: {
				username: {
					label: "メールアドレス",
					type: "email",
					placeholder: "c0000000@st.kanazawa-it.ac.jp",
				},
				password: { label: "パスワード", type: "password" },
			},
			// 認証処理の実装
			async authorize(credentials, _req) {
				if (!credentials) return null;
				const res = await axios.post<LoginResponse>(
					`${config.internalApiBaseUrl}/api/login`,
					qs.stringify({
						username: credentials.username,
						password: credentials.password,
					}),
					{
						headers: { "Content-Type": "application/x-www-form-urlencoded" },
					},
				);

				const data = res.data;

				const fastUser = data.user;

				return {
					id: String(fastUser.id),
					name: fastUser.username,
					email: fastUser.email,
					image: null,

					username: fastUser.username,
					role_id: fastUser.role_id,
					is_active: fastUser.is_active,
					theme_settings: fastUser.theme_settings,
					created_at: fastUser.created_at,
					updated_at: fastUser.updated_at,
					role: fastUser.role,

					accessToken: res.data.access_token,
					refreshToken: res.data.refresh_token,
				};
			},
		}),
	],
	callbacks: {
		async jwt({ token, user }) {
			if (user) {
				token.user = user;
				token.accessToken = user.accessToken;
				token.refreshToken = user.refreshToken;
			}
			return token;
		},

		async session({ session, token }) {
			session.user = token.user as any;
			session.accessToken = token.accessToken;
			session.refreshToken = token.refreshToken;
			return session;
		},
	},

	pages: {
		signIn: "/login",
	},
	session: {
		strategy: "jwt",
		maxAge: 30 * 24 * 60 * 60, // 30 days
	},
};
