import config from "./config";

/**
 * デバッグログのレベル
 */
export enum LogLevel {
	ERROR = 0,
	WARN = 1,
	INFO = 2,
	DEBUG = 3,
}

/**
 * デバッグログを出力する
 * @param message ログメッセージ
 * @param data 追加データ（オプション）
 * @param level ログレベル（デフォルト: INFO）
 */
export function debugLog(
	_message: string,
	data?: unknown,
	level: LogLevel = LogLevel.INFO,
): void {
	// デバッグモードがオフの場合は何もしない
	if (!config.debug) return;

	// 設定されたデバッグレベルより高いレベルのログは出力しない
	if (level > config.debugLevel) return;

	const _timestamp = new Date().toISOString();
	const _prefix = getLogPrefix(level);

	// メッセージのみの場合
	if (data === undefined) {
		return;
	}

	// データの種類に応じて適切な出力方法を選択
	if (typeof data === "object" && data !== null) {
		console.dir(data, { depth: null, colors: true });
	} else {
	}
}

/**
 * エラーログを出力する
 * @param message エラーメッセージ
 * @param error エラーオブジェクト（オプション）
 */
export function debugError(message: string, error?: unknown): void {
	debugLog(message, error, LogLevel.ERROR);
}

/**
 * 警告ログを出力する
 * @param message 警告メッセージ
 * @param data 追加データ（オプション）
 */
export function debugWarn(message: string, data?: unknown): void {
	debugLog(message, data, LogLevel.WARN);
}

/**
 * 情報ログを出力する
 * @param message 情報メッセージ
 * @param data 追加データ（オプション）
 */
export function debugInfo(message: string, data?: unknown): void {
	debugLog(message, data, LogLevel.INFO);
}

/**
 * 詳細ログを出力する
 * @param message 詳細メッセージ
 * @param data 追加データ（オプション）
 */
export function debugVerbose(message: string, data?: unknown): void {
	debugLog(message, data, LogLevel.DEBUG);
}

/**
 * ログレベルに応じたプレフィックスを取得する
 * @param level ログレベル
 * @returns プレフィックス文字列
 */
function getLogPrefix(level: LogLevel): string {
	switch (level) {
		case LogLevel.ERROR:
			return "🔴 ERROR";
		case LogLevel.WARN:
			return "🟠 WARN";
		case LogLevel.INFO:
			return "🔵 INFO";
		case LogLevel.DEBUG:
			return "🟢 DEBUG";
		default:
			return "LOG";
	}
}

/**
 * APIリクエストのデバッグログを出力する
 * @param method HTTPメソッド
 * @param url リクエストURL
 * @param data リクエストデータ（オプション）
 */
export function debugRequest(
	method: string,
	url: string,
	data?: unknown,
): void {
	debugVerbose(`API Request: ${method} ${url}`, data);
}

/**
 * APIレスポンスのデバッグログを出力する
 * @param method HTTPメソッド
 * @param url リクエストURL
 * @param response レスポンスデータ
 * @param time 処理時間（ミリ秒）
 */
export function debugResponse(
	method: string,
	url: string,
	response: unknown,
	time?: number,
): void {
	const timeInfo = time ? ` (${time}ms)` : "";
	debugVerbose(`API Response: ${method} ${url}${timeInfo}`, response);
}

/**
 * APIエラーのデバッグログを出力する
 * @param method HTTPメソッド
 * @param url リクエストURL
 * @param error エラーオブジェクト
 */
export function debugApiError(
	method: string,
	url: string,
	error: unknown,
): void {
	debugError(`API Error: ${method} ${url}`, error);
}

export default {
	log: debugLog,
	error: debugError,
	warn: debugWarn,
	info: debugInfo,
	verbose: debugVerbose,
	request: debugRequest,
	response: debugResponse,
	apiError: debugApiError,
};
