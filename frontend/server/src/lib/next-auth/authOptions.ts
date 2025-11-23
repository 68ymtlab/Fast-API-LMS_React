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
				try {
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

					const { user, access_token, refresh_token } = res.data;

					return {
						id: String(user.id),
						name: user.username,
						email: user.email,
						image: null,

						fastApiUser: {
							id: user.id,
							username: user.username,
							display_name: user.display_name,
							role_id: user.role_id,
							is_active: user.is_active,
							created_at: user.created_at,
							updated_at: user.updated_at,
							role: user.role,
							theme_settings: user.theme_settings,
						},

						accessToken: access_token,
						refreshToken: refresh_token,
					};
				} catch (_err) {
					return null;
				}
			},
		}),
	],

	callbacks: {
		async jwt({ token, user }) {
			if (user) {
				token.id = user.id;
				token.name = user.name;
				token.email = user.email;

				token.fastApiUser = user.fastApiUser;

				token.accessToken = user.accessToken;
				token.refreshToken = user.refreshToken;
			}
			return token;
		},

		async session({ session, token }) {
			session.user = {
				id: token.fastApiUser.id,
				username: token.fastApiUser.username,
				display_name: token.fastApiUser.display_name,
				email: token.email,
				role_id: token.fastApiUser.role_id,
				role: token.fastApiUser.role,
				theme_settings: token.fastApiUser.theme_settings,
				is_active: token.fastApiUser.is_active,
				created_at: token.fastApiUser.created_at,
				updated_at: token.fastApiUser.updated_at,
			};

			session.accessToken = token.accessToken;
			session.refreshToken = token.refreshToken;

			return session;
		},
	},

	pages: {
		signIn: "/login",
		error: "/login",
	},
	session: {
		strategy: "jwt",
		maxAge: 30 * 24 * 60 * 60, // 30 days
	},
};
