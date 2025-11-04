import { type JWTPayload, jwtVerify } from "jose";
import { type NextRequest, NextResponse } from "next/server";
import appConfig from "@/lib/config"; // インポート名を appConfig に変更 (debugLevelアクセス用)
import { ALGORITHM, SECRET_KEY } from "@/lib/secrets"; // secrets.tsからインポート
import debug, { LogLevel } from "@/lib/utils/debug"; // src/libs/utils/debug をインポート
import {
	authPages,
	maintenanceExclusionPaths,
	protectedRoutesWithRoles,
	roleRedirectMap,
} from "./router/router"; // router.ts からのインポートパスを確認してください

const isMaintenanceMode: boolean =
	process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";

const isAuthPage = (pathname: string) =>
	authPages.some((page) => pathname.startsWith(page));

/**
 * JWTトークンからデコードされたペイロードの型定義。
 * バックエンドの /token エンドポイントで生成されるJWTの内容に基づきます。
 */
interface DecodedTokenPayload extends JWTPayload {
	sub?: string;
	kind_name?: string;
	exp?: number;
}

async function verifyToken(token: string): Promise<DecodedTokenPayload | null> {
	if (!token) {
		return null;
	}

	const secretKey = SECRET_KEY; // secrets.ts の SECRET_KEY を使用
	const algorithm = ALGORITHM; // secrets.ts の ALGORITHM を使用

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
	} catch (error: any) {
		if (error?.code === "ERR_JWT_EXPIRED") {
			debug.warn("[Middleware] JWT token has expired");
		} else if (error?.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") {
			debug.warn("[Middleware] JWT signature verification failed");
		} else {
			debug.error("[Middleware] JWT verification error:", error?.message);
		}
		return null;
	}
}

export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

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
				: new URL("/maintenance", request.url).toString();
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
			request.nextUrl.pathname = "/404";
			return NextResponse.rewrite(request.nextUrl);
		}
	}

	// 認証チェックは一切行わず、すべてのページへのアクセスを許可
	if (appConfig.debugLevel >= LogLevel.DEBUG) {
		debug.verbose(
			`[Middleware] Allowing access to '${pathname}' without authentication check.`,
		);
	}
	return NextResponse.next();
}

// This export is for Next.js middleware configuration and should not be confused with the imported appConfig.
export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|favicon.ico|libs/MathJax|maintenance).*)",
	],
};
