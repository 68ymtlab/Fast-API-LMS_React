/**
 * アプリケーション全体の設定
 */
export const config = {
	/**
	 * APIのベースURL
	 */
	apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",

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
	// 認証チェックの無効化は開発ビルド限定。
	// 本番で誤って有効化すると全ページが未認証で通ってしまうため、
	// NODE_ENV=production ではフラグの値に関わらず必ず false になる。
	disableAuthCheck:
		process.env.NODE_ENV !== "production" &&
		(process.env.NEXT_PUBLIC_DISABLE_AUTH_CHECK === "true" ||
			process.env.NEXT_PUBLIC_DISABLE_AUTH_CHECK === "1"),
};

export default config;
