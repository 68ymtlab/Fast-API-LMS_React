/**
 * アプリケーション全体の設定
 */
export const config = {
	/**
	 * APIのベースURL
	 */
	apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
	internalApiBaseUrl: process.env.INTERNAL_API_BASE_URL ?? "",

	/**
	 * デバッグモード
	 * true: デバッグログを出力する
	 * false: デバッグログを出力しない
	 */
	debug: process.env.NODE_ENV === "development",

	/**
	 * デバッグレベル
	 * 0: エラーのみ
	 * 1: 警告とエラー
	 * 2: 情報、警告、エラー
	 * 3: すべて（詳細情報を含む）
	 */
	debugLevel: Number(process.env.NEXT_PUBLIC_DEBUG_LEVEL) || 0,

	/**
	 * 認証チェックを無効化するかどうか
	 * true: 認証チェックをスキップ（開発・テスト環境用）
	 * false: 認証チェックを実施（本番環境用）
	 * ⚠️ セキュリティ上の理由から、本番環境では必ずfalseにしてください
	 */
	disableAuthCheck:
		process.env.NEXT_PUBLIC_DISABLE_AUTH_CHECK === "true" ||
		process.env.NEXT_PUBLIC_DISABLE_AUTH_CHECK === "1",

	/**
	 * JWTのシークレットキー
	 * 認証トークンの署名と検証に使用される
	 */
	secretKey: process.env.NEXTAUTH_SECRET ?? "",

	/**
	 * JWTのアルゴリズム
	 * 認証トークンの署名と検証に使用されるアルゴリズム
	 * HS256: HMAC using SHA-256 hash algorithm
	 */
	algorithm: process.env.JWT_ALGORITHM ?? "HS256",
};

export default config;
