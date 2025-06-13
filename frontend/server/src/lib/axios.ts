import axios, { isAxiosError } from "axios";

import config from "./config";
import debug, { LogLevel } from "./utils/debug";

const axiosInstance = axios.create({
  baseURL: config.apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// リクエスト前ログ
axiosInstance.interceptors.request.use((request) => {
  if (config.debug && config.debugLevel >= LogLevel.DEBUG) {
    debug.request(request.method?.toUpperCase() || "GET", request.url || "", request.data);
  }

  // 処理時間の計測用タイムスタンプ
  request.metadata = { startTime: new Date().getTime() };
  return request;
});

// レスポンス後ログ
axiosInstance.interceptors.response.use(
  (response) => {
    if (config.debug && config.debugLevel >= LogLevel.DEBUG) {
      const duration = response.config.metadata ? new Date().getTime() - response.config.metadata.startTime : undefined;

      debug.response(
        response.config.method?.toUpperCase() || "GET",
        response.config.url || "",
        response.data,
        duration,
      );
    }
    return response;
  },
  (error: unknown) => {
    if (isAxiosError(error)) {
      const config_ = error.config || { method: "UNKNOWN", url: "unknown URL" };
      const method = config_.method?.toUpperCase() || "UNKNOWN";
      const url = config_.url || "unknown URL";

      if (config.debug && config.debugLevel >= LogLevel.ERROR) {
        debug.apiError(method, url, error.response?.data || error.message);
      }
    } else {
      // Axios以外のエラーの場合
      if (config.debug && config.debugLevel >= LogLevel.ERROR) {
        debug.error("Unknown error occurred", error);
      }
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
