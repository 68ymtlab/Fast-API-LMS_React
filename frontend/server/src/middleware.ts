import { type JWTPayload, jwtVerify } from "jose";
import { type NextRequest, NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import appConfig from "@/lib/config"; // インポート名を appConfig に変更 (debugLevelアクセス用)
import debug, { LogLevel } from "@/lib/utils/debug"; // src/libs/utils/debug をインポート
import { maintenanceExclusionPaths } from "./router/router"; // router.ts からのインポートパスを確認してください

// Treat the env value 'true' (or '1') as maintenance ON. Default to false when unset.
const isMaintenanceMode: boolean =
	String(process.env.NEXT_PUBLIC_MAINTENANCE_MODE).toLowerCase() === "true" ||
	String(process.env.NEXT_PUBLIC_MAINTENANCE_MODE) === "1";

/**
 * JWTトークンからデコードされたペイロードの型定義。
 * バックエンドの /token エンドポイントで生成されるJWTの内容に基づきます。
 */
interface DecodedTokenPayload extends JWTPayload {
	sub?: string;
	kind_name?: string;
	exp?: number;
}

export async function verifyToken(
	token: string,
): Promise<DecodedTokenPayload | null> {
	if (!token) {
		return null;
	}

	const secretKey = appConfig.secretKey; // secrets.ts の SECRET_KEY を使用
	const algorithm = appConfig.algorithm; // secrets.ts の ALGORITHM を使用

	if (!secretKey) {
		debug.error("[Middleware] JWT_SECRET_KEY is not defined in config.");
		return null;
	}

	try {
		const secret = new TextEncoder().encode(secretKey);
		const { payload } = await jwtVerify<DecodedTokenPayload>(token, secret, {
			algorithms: [algorithm],
		});
		return payload;
	} catch (err: unknown) {
		const errorObj = err as { code?: string; message?: string };
		if (errorObj?.code === "ERR_JWT_EXPIRED") {
			debug.warn("[Middleware] JWT token has expired");
		} else if (errorObj?.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") {
			debug.warn("[Middleware] JWT signature verification failed");
		} else {
			debug.error("[Middleware] JWT verification error:", errorObj?.message);
		}
		return null;
	}
}

export default withAuth(async function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;

	// メンテナンスモード時のログ出力 (debugLevel が DEBUG 以上の場合)
	if (isMaintenanceMode && appConfig.debugLevel >= LogLevel.DEBUG) {
		debug.verbose(`[Middleware] Maintenance mode is ON. Pathname: ${pathname}`);
	}

	// 1. メンテナンスモードの処理のみ
	if (isMaintenanceMode) {
		const isExcluded = maintenanceExclusionPaths.includes(pathname);
		if (!isExcluded && !pathname.startsWith("/maintenance")) {
			if (appConfig.debugLevel >= LogLevel.INFO) {
				debug.info(
					`[Middleware] Maintenance mode: Redirecting to /maintenance from ${pathname}`,
				);
			}
			const maintenanceUrl = process.env.NEXT_PUBLIC_APP_BASE_URL
				? `${process.env.NEXT_PUBLIC_APP_BASE_URL}/maintenance`
				: new URL("/maintenance", req.url).toString();
			return NextResponse.redirect(maintenanceUrl);
		}
		if (pathname.startsWith("/maintenance")) {
			if (appConfig.debugLevel >= LogLevel.DEBUG) {
				debug.verbose(
					`[Middleware] Maintenance mode: Allowing access to ${pathname}`,
				);
			}
			return NextResponse.next();
		}
	} else {
		if (pathname.startsWith("/maintenance")) {
			if (appConfig.debugLevel >= LogLevel.INFO) {
				debug.info(
					`[Middleware] Maintenance mode is OFF. Rewriting ${pathname} to /404`,
				);
			}
			req.nextUrl.pathname = "/404";
			return NextResponse.rewrite(req.nextUrl);
		}
	}

	// 認証チェックは一切行わず、すべてのページへのアクセスを許可
	if (appConfig.debugLevel >= LogLevel.DEBUG) {
		debug.verbose(
			`[Middleware] Allowing access to '${pathname}' without authentication check.`,
		);
	}
	return NextResponse.next();
});

// This export is for Next.js middleware configuration and should not be confused with the imported appConfig.
export const config = {
	matcher: [
		// Exclude api routes, next static assets, maintenance and the login page itself
		"/((?!api|_next/static|_next/image|favicon.ico|libs/MathJax|maintenance|login).*)",
	],
};
