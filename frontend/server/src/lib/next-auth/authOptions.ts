import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import qs from "qs";
import axios from "@/lib/axios";

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
				const res = await axios.post(
					"/api/login",
					qs.stringify({
						username: credentials.username,
						password: credentials.password,
					}),
					{ headers: { "Content-Type": "application/x-www-form-urlencoded" } },
				);

				return res.data;
			},
		}),
	],
	pages: {
		signIn: "/login",
	},
	session: {
		strategy: "jwt",
		maxAge: 30 * 24 * 60 * 60, // 30 days
	},
};
