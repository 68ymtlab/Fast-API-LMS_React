import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { getSession, signOut } from "next-auth/react";

import config from "./utils/config";
import debug, { LogLevel } from "./utils/debug";

const axiosInstance = axios.create({
	baseURL: `${config.apiBaseUrl}/api`,
	headers: {
		"Content-Type": "application/json",
	},
	withCredentials: true,
});

const SESSION_CACHE_MS = 60 * 1000;
let cachedAccessToken: string | null = null;
let lastSessionFetchedAt = 0;
let sessionPromise: Promise<Awaited<ReturnType<typeof getSession>>> | null = null;

const getAccessTokenCached = async (forceRefresh = false) => {
	const now = Date.now();
	if (
		!forceRefresh &&
		cachedAccessToken &&
		now - lastSessionFetchedAt < SESSION_CACHE_MS
	) {
		return cachedAccessToken;
	}

	if (!sessionPromise) {
		sessionPromise = getSession()
			.then((session) => {
				cachedAccessToken = session?.accessToken ?? null;
				lastSessionFetchedAt = Date.now();
				return session;
			})
			.finally(() => {
				sessionPromise = null;
			});
	}

	const session = await sessionPromise;
	return session?.accessToken ?? null;
};

// リクエスト前: Authorization ヘッダ注入 + ログ
axiosInstance.interceptors.request.use(async (request) => {
	// セッションからアクセストークンを取得して注入
	try {
		const token = await getAccessTokenCached();
		if (token) {
			request.headers.Authorization = `Bearer ${token}`;
		}
	} catch (e) {
		// セッション取得失敗時はトークンなしで続行
		console.warn("[axios] Failed to get session for auth header:", e);
	}

	if (config.debug && config.debugLevel >= LogLevel.DEBUG) {
		debug.request(
			request.method?.toUpperCase() || "GET",
			request.url || "",
			request.data,
		);
	}

	// 処理時間の計測用タイムスタンプ
	request.metadata = { startTime: new Date().getTime() };
	return request;
});

// レスポンス後ログ
axiosInstance.interceptors.response.use(
	(response) => {
		if (config.debug && config.debugLevel >= LogLevel.DEBUG) {
			const duration = response.config.metadata
				? new Date().getTime() - response.config.metadata.startTime
				: undefined;

			debug.response(
				response.config.method?.toUpperCase() || "GET",
				response.config.url || "",
				response.data,
				duration,
			);
		}
		return response;
	},
	async (error: AxiosError) => {
		const config_ = error.config || {} as InternalAxiosRequestConfig;
		const isAccessHistory404 =
			error.response?.status === 404 &&
			((config_ as InternalAxiosRequestConfig).url || "").includes(
				"/add_access_history",
			);

		if (config.debug && config.debugLevel >= LogLevel.ERROR && !isAccessHistory404) {
			debug.apiError(
				(config_ as InternalAxiosRequestConfig).method?.toUpperCase() || "UNKNOWN",
				(config_ as InternalAxiosRequestConfig).url || "unknown URL",
				error,
			);
		}

		// 401エラー時のリトライ処理
		const originalRequest = error.config as InternalAxiosRequestConfig & {
			_retry?: boolean;
		};

		if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
			originalRequest._retry = true;

			try {
				const session = await getSession();

				if (session?.error === "RefreshAccessTokenError") {
					console.error("[axios] Refresh token expired, logging out...");
					await signOut({ callbackUrl: "/login" });
					return Promise.reject(error);
				}

				const token = await getAccessTokenCached(true);
				if (token) {
					originalRequest.headers.Authorization = `Bearer ${token}`;
					return axiosInstance(originalRequest);
				}
			} catch (refreshError) {
				console.error("[axios] Token refresh failed:", refreshError);
				await signOut({ callbackUrl: "/login" });
				return Promise.reject(error);
			}
		}

		return Promise.reject(error);
	},
);

export default axiosInstance;
