import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import appConfig from "@/lib/utils/config";
import debug, { LogLevel } from "@/lib/utils/debug";
import {
	maintenanceExclusionPaths,
	protectedRoutesWithRoles,
	roleRedirectMap,
} from "./router/router";

// Treat the env value 'true' (or '1') as maintenance ON. Default to false when unset.
const isMaintenanceMode: boolean =
	String(process.env.NEXT_PUBLIC_MAINTENANCE_MODE).toLowerCase() === "true" ||
	String(process.env.NEXT_PUBLIC_MAINTENANCE_MODE) === "1";

export default withAuth(
	async function middleware(req) {
		const { pathname } = req.nextUrl;
		const token = req.nextauth.token;

		// メンテナンスモード時のログ出力 (debugLevel が DEBUG 以上の場合)
		if (isMaintenanceMode && appConfig.debugLevel >= LogLevel.DEBUG) {
			debug.verbose(
				`[Middleware] Maintenance mode is ON. Pathname: ${pathname}`,
			);
		}

		// 1. メンテナンスモードの処理
		if (isMaintenanceMode) {
			const isExcluded = maintenanceExclusionPaths.includes(pathname);
			if (!isExcluded && !pathname.startsWith("/maintenance")) {
				if (appConfig.debugLevel >= LogLevel.INFO) {
					debug.info(
						`[Middleware] Maintenance mode: Redirecting to /maintenance from ${pathname}`,
					);
				}
				return NextResponse.redirect(new URL("/maintenance", req.url));
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

		// 2. 認証チェックのスキップ（開発・テスト環境用）
		if (appConfig.disableAuthCheck) {
			if (appConfig.debugLevel >= LogLevel.WARN) {
				debug.warn(
					`[Middleware] ⚠️ Auth check is DISABLED. Allowing access to '${pathname}' without authentication.`,
				);
			}
			return NextResponse.next();
		}

		// 3. 認証チェック
		if (!token) {
			if (appConfig.debugLevel >= LogLevel.WARN) {
				debug.warn(`[Middleware] No token found for ${pathname}`);
			}
			return NextResponse.redirect(new URL("/login", req.url));
		}

		// 4. ロールベースのアクセス制御
		const userRole = token.fastApiUser?.role?.name as string;

		if (appConfig.debugLevel >= LogLevel.DEBUG) {
			debug.verbose(
				`[Middleware] User role: ${userRole}, accessing: ${pathname}`,
			);
		}

		// パスに対する権限チェック
		for (const [pathPrefix, allowedRoles] of Object.entries(
			protectedRoutesWithRoles,
		)) {
			if (pathname.startsWith(pathPrefix)) {
				if (!allowedRoles.includes(userRole)) {
					if (appConfig.debugLevel >= LogLevel.WARN) {
						debug.warn(
							`[Middleware] Access denied: User role '${userRole}' not allowed for path '${pathname}'`,
						);
					}
					// 適切なホームページにリダイレクト
					const redirectPath =
						roleRedirectMap[userRole] || roleRedirectMap.default;
					return NextResponse.redirect(new URL(redirectPath, req.url));
				}
			}
		}

		if (appConfig.debugLevel >= LogLevel.DEBUG) {
			debug.verbose(
				`[Middleware] Access granted to '${pathname}' for role: ${userRole}`,
			);
		}

		return NextResponse.next();
	},
	{
		callbacks: {
			// 認証が必要かどうかを判定
			authorized: ({ req, token }) => {
				const { pathname } = req.nextUrl;

				// 認証チェックが無効化されている場合は全て許可
				if (appConfig.disableAuthCheck) {
					return true;
				}

				// ログインページは認証不要
				if (pathname === "/login") {
					return true;
				}

				// メンテナンスページは認証不要
				if (pathname.startsWith("/maintenance")) {
					return true;
				}

				// その他のページは認証が必要
				return !!token;
			},
		},
		pages: {
			signIn: "/login",
		},
	},
);

// This export is for Next.js middleware configuration and should not be confused with the imported appConfig.
export const config = {
	matcher: [
		// Exclude api routes, next static assets, and specific files
		"/((?!api|_next/static|_next/image|favicon.ico|libs/MathJax).*)",
	],
};
