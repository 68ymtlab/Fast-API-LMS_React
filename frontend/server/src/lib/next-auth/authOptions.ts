import axios from "axios";
import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import qs from "qs";
import type { LoginResponse } from "@/types/api/auth/user";
import config from "../utils/config";

const DEFAULT_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000;

/**
 * JWT文字列からexpを読み取り、ミリ秒のUNIX時刻に変換する
 */
function getJwtExpiryMs(jwtToken?: string): number {
	if (!jwtToken) {
		return Date.now() + DEFAULT_ACCESS_TOKEN_TTL_MS;
	}

	try {
		const payloadBase64Url = jwtToken.split(".")[1];
		if (!payloadBase64Url) {
			return Date.now() + DEFAULT_ACCESS_TOKEN_TTL_MS;
		}

		const payloadBase64 = payloadBase64Url
			.replace(/-/g, "+")
			.replace(/_/g, "/")
			.padEnd(Math.ceil(payloadBase64Url.length / 4) * 4, "=");

		const decoded = JSON.parse(
			Buffer.from(payloadBase64, "base64").toString("utf-8"),
		) as { exp?: number };

		if (typeof decoded.exp === "number") {
			return decoded.exp * 1000;
		}
	} catch (error) {
		console.warn("[NextAuth] Failed to parse JWT exp:", error);
	}

	return Date.now() + DEFAULT_ACCESS_TOKEN_TTL_MS;
}

/**
 * リフレッシュトークンを使用して新しいアクセストークンを取得
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
	try {
		const response = await axios.post(
			`${config.internalApiBaseUrl}/api/refresh`,
			{ refresh_token: token.refreshToken },
			{
				headers: { "Content-Type": "application/json" },
			},
		);

		const { access_token, refresh_token } = response.data;

		return {
			...token,
			accessToken: access_token,
			refreshToken: refresh_token ?? token.refreshToken, // フォールバック
			accessTokenExpires: getJwtExpiryMs(access_token),
			error: undefined,
		};
	} catch (error) {
		console.error("[NextAuth] Failed to refresh access token:", error);

		return {
			...token,
			error: "RefreshAccessTokenError",
		};
	}
}

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
			// 初回ログイン時
			if (user) {
				token.id = user.id;
				token.name = user.name;
				token.email = user.email;

				token.fastApiUser = user.fastApiUser;

				token.accessToken = user.accessToken;
				token.refreshToken = user.refreshToken;
				// アクセストークンの有効期限はJWTのexpを使用
				token.accessTokenExpires = getJwtExpiryMs(user.accessToken);
				token.error = undefined;

				return token;
			}

			// アクセストークンがまだ有効な場合はそのまま返す
			if (Date.now() < (token.accessTokenExpires as number)) {
				return token;
			}

			// アクセストークンが期限切れの場合、リフレッシュを試行
			console.log("[NextAuth] Access token expired, refreshing...");
			return await refreshAccessToken(token);
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
			session.error = token.error; // エラー情報も伝達

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
