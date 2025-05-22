import axios from "axios";

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
  (error) => {
    const config_ = error.config || {};

    if (config.debug && config.debugLevel >= LogLevel.ERROR) {
      debug.apiError(config_.method?.toUpperCase() || "UNKNOWN", config_.url || "unknown URL", error);
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
