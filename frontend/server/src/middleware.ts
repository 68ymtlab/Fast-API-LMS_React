import appConfig from "@/lib/config"; // インポート名を appConfig に変更 (debugLevelアクセス用)
import debug, { LogLevel } from "@/lib/utils/debug"; // src/libs/utils/debug をインポート
import { type JWTPayload, jwtVerify } from "jose";
import { type NextRequest, NextResponse } from "next/server";
import { authPages, maintenanceExclusionPaths, protectedRoutesWithRoles, roleRedirectMap } from "./router/router"; // router.ts からのインポートパスを確認してください

const isMaintenanceMode: boolean = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";

const isAuthPage = (pathname: string) => authPages.some((page) => pathname.startsWith(page));

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

  const secretKey = process.env.JWT_SECRET_KEY;
  const algorithm = process.env.JWT_ALGORITHM || "HS256";

  if (!secretKey) {
    debug.error("[Middleware] JWT_SECRET_KEY is not defined in environment variables.");
    return null;
  }

  try {
    const secret = new TextEncoder().encode(secretKey);
    const { payload } = await jwtVerify<DecodedTokenPayload>(token, secret, {
      algorithms: [algorithm],
    });
    return payload;
  } catch (error) {
    if (error.code === "ERR_JWT_EXPIRED") {
      debug.warn("[Middleware] JWT token has expired");
    } else if (error.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") {
      debug.warn("[Middleware] JWT signature verification failed");
    } else {
      debug.error("[Middleware] JWT verification error:", error.message);
    }
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const tokenCookie = request.cookies.get("token");
  const token = tokenCookie?.value;

  // メンテナンスモード時のログ出力 (debugLevel が DEBUG 以上の場合)
  if (isMaintenanceMode && appConfig.debugLevel >= LogLevel.DEBUG) {
    // config を appConfig に変更
    debug.verbose(`[Middleware] Maintenance mode is ON. Pathname: ${pathname}`);
  }

  // 1. メンテナンスモードの処理
  if (isMaintenanceMode) {
    const isExcluded = maintenanceExclusionPaths.includes(pathname);
    if (!isExcluded && !pathname.startsWith("/maintenance")) {
      if (appConfig.debugLevel >= LogLevel.INFO) {
        // config を appConfig に変更
        debug.info(`[Middleware] Maintenance mode: Redirecting to /maintenance from ${pathname}`);
      }
      const maintenanceUrl = process.env.NEXT_PUBLIC_APP_BASE_URL
        ? `${process.env.NEXT_PUBLIC_APP_BASE_URL}/maintenance`
        : new URL("/maintenance", request.url).toString();
      return NextResponse.redirect(maintenanceUrl);
    }
    if (pathname.startsWith("/maintenance")) {
      if (appConfig.debugLevel >= LogLevel.DEBUG) {
        // config を appConfig に変更
        debug.verbose(`[Middleware] Maintenance mode: Allowing access to ${pathname}`);
      }
      return NextResponse.next();
    }
  } else {
    if (pathname.startsWith("/maintenance")) {
      if (appConfig.debugLevel >= LogLevel.INFO) {
        // config を appConfig に変更
        debug.info(`[Middleware] Maintenance mode is OFF. Rewriting ${pathname} to /404`);
      }
      request.nextUrl.pathname = "/404";
      return NextResponse.rewrite(request.nextUrl);
    }
  }

  // 2. トークン検証と役割取得
  const decodedPayload = await verifyToken(token || "");
  const userRole = decodedPayload?.kind_name || null;

  // デバッグログ (debugLevel が INFO 以上の場合)
  if (appConfig.debugLevel >= LogLevel.INFO) {
    // config を appConfig に変更
    debug.info(`[Middleware] Pathname: ${pathname}`);
    debug.info(`[Middleware] Token: ${token ? "Exists" : "Does not exist"}`);
    debug.info(`[Middleware] User Role: ${userRole || "N/A"}`);
  }
  // より詳細なペイロード情報は DEBUG レベルで出力
  if (appConfig.debugLevel >= LogLevel.DEBUG) {
    // config を appConfig に変更
    debug.verbose("[Middleware] Decoded Payload:", decodedPayload);
  }

  // 3. 認証ページ (例: /login) の処理
  if (isAuthPage(pathname)) {
    if (decodedPayload && userRole) {
      const userDefaultPath = roleRedirectMap[userRole] || roleRedirectMap.default;
      if (appConfig.debugLevel >= LogLevel.INFO) {
        // config を appConfig に変更
        debug.info(`[Middleware] Authenticated user on auth page '${pathname}'. Redirecting to: ${userDefaultPath}`);
      }
      return NextResponse.redirect(new URL(userDefaultPath, request.url));
    }
    if (appConfig.debugLevel >= LogLevel.INFO) {
      // config を appConfig に変更
      debug.info(`[Middleware] Unauthenticated user on auth page '${pathname}'. Allowing.`);
    }
    return NextResponse.next();
  }

  // 4. 保護されたルートの処理
  let routeIsProtected = false;
  let requiredRolesForPath: string[] = [];
  let longestMatchedPrefix = "";

  for (const prefix in protectedRoutesWithRoles) {
    if (pathname.startsWith(prefix) && prefix.length >= longestMatchedPrefix.length) {
      routeIsProtected = true;
      requiredRolesForPath = protectedRoutesWithRoles[prefix];
      longestMatchedPrefix = prefix;
    }
  }

  if (routeIsProtected) {
    if (appConfig.debugLevel >= LogLevel.INFO) {
      // config を appConfig に変更
      debug.info(
        `[Middleware] Path '${pathname}' is protected. Required roles: ${requiredRolesForPath.length > 0 ? requiredRolesForPath.join(", ") : "Any authenticated user"}`,
      );
    }
    if (!decodedPayload || !userRole) {
      if (appConfig.debugLevel >= LogLevel.INFO) {
        // config を appConfig に変更
        debug.info("[Middleware] Not authenticated for protected route. Redirecting to login.");
      }
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (requiredRolesForPath.length > 0 && !requiredRolesForPath.includes(userRole)) {
      if (appConfig.debugLevel >= LogLevel.INFO) {
        // config を appConfig に変更
        debug.info(
          `[Middleware] Role mismatch for '${pathname}'. User role: '${userRole}', Required: '${requiredRolesForPath.join(", ")}'. Redirecting.`,
        );
      }
      const userDefaultPath = roleRedirectMap[userRole] || roleRedirectMap.default;
      return NextResponse.redirect(new URL(userDefaultPath, request.url));
    }
    if (appConfig.debugLevel >= LogLevel.INFO) {
      // config を appConfig に変更
      debug.info(`[Middleware] Authenticated and authorized for protected route '${pathname}'. Allowing.`);
    }
    return NextResponse.next();
  }

  // 5. 上記のいずれにも該当しない場合 (公開ページなど)
  if (appConfig.debugLevel >= LogLevel.INFO) {
    // config を appConfig に変更
    debug.info(`[Middleware] Path '${pathname}' is public or no specific rules matched. Allowing.`);
  }
  return NextResponse.next();
}

// This export is for Next.js middleware configuration and should not be confused with the imported appConfig.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|libs/MathJax|maintenance).*)"],
};
