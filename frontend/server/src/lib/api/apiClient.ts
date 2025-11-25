import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { getSession, signOut } from "next-auth/react";
import config from "@/lib/utils/config";

const apiClient = axios.create({
	baseURL: `${config.apiBaseUrl}/api`,
	withCredentials: true,
});

// ✅ リクエスト前に Authorization ヘッダを注入
apiClient.interceptors.request.use(async (cfg) => {
	const session = await getSession();
	const token = session?.accessToken;

	if (token) {
		cfg.headers.Authorization = `Bearer ${token}`;
	}
	return cfg;
});

// ✅ レスポンスインターセプター: 401エラー時のリトライ処理
apiClient.interceptors.response.use(
	(response) => response,
	async (error: AxiosError) => {
		const originalRequest = error.config as InternalAxiosRequestConfig & {
			_retry?: boolean;
		};

		// 401エラーでリトライ未実施の場合
		if (error.response?.status === 401 && !originalRequest._retry) {
			originalRequest._retry = true;

			try {
				// セッションを再取得（NextAuthのjwtコールバックでリフレッシュ処理が実行される）
				const session = await getSession();

				// リフレッシュトークンエラーの場合はログアウト
				if (session?.error === "RefreshAccessTokenError") {
					console.error("[apiClient] Refresh token expired, logging out...");
					await signOut({ callbackUrl: "/login" });
					return Promise.reject(error);
				}

				// 新しいトークンでリトライ
				if (session?.accessToken) {
					originalRequest.headers.Authorization = `Bearer ${session.accessToken}`;
					return apiClient(originalRequest);
				}
			} catch (refreshError) {
				console.error("[apiClient] Token refresh failed:", refreshError);
				await signOut({ callbackUrl: "/login" });
				return Promise.reject(error);
			}
		}

		return Promise.reject(error);
	},
);

export default apiClient;
