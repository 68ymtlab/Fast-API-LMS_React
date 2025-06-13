import appConfig from "@/lib/config"; // インポート名を appConfig に変更 (debugLevelアクセス用)
import debug, { LogLevel } from "@/lib/utils/debug"; // src/libs/utils/debug をインポート
import { getToken } from "next-auth/jwt";
import { type NextRequest, NextResponse } from "next/server";
import { maintenanceExclusionPaths, pageAccessRules, publicPaths, roleRedirectMap } from "./router/router"; // router.ts からのインポートパスを確認してください

const isMaintenanceMode: boolean = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. メンテナンスモードの処理
  if (isMaintenanceMode) {
    if (appConfig.debugLevel >= LogLevel.DEBUG) {
      // meintenanceモードのデバッグログ
      debug.verbose(`[Middleware] Maintenance mode is ON. Pathname: ${pathname}`);
    }
    const isExcluded = maintenanceExclusionPaths.some((path) => pathname.startsWith(path));
    if (!isExcluded) {
      return NextResponse.redirect(new URL("/maintenance", request.url));
    }
  } else {
    // メンテナンスモードOFFの時に/maintenanceにアクセスされた場合は、404ページにリダイレクト
    if (pathname.startsWith("/maintenance")) {
      return NextResponse.rewrite(new URL("/404", request.url));
    }
  }

  // 2. 公開ページへのアクセスは常に許可
  if (publicPaths.includes(pathname)) {
    return NextResponse.next();
  }

  // 3. 認証トークンを取得
  const token = await getToken({ req: request, secret: process.env.JWT_SECRET_KEY });

  // 4. 認証されていないユーザーの処理
  if (!token) {
    // ログインページ以外へのアクセスは、ログインページにリダイレクト
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 5. 認証済みユーザーの処理
  const userRole = token.role as keyof typeof roleRedirectMap;

  // ログインページにアクセスしようとした場合、ロール別のホームページにリダイレクト
  if (pathname.startsWith("/login")) {
    const homePath = roleRedirectMap[userRole] || "/home";
    return NextResponse.redirect(new URL(homePath, request.url));
  }

  // 汎用的なホームページ二アクセスした場合、ロールに応じて振り分け
  if (pathname === "/home") {
    const homePath = roleRedirectMap[userRole] || "/home";
    return NextResponse.redirect(new URL(homePath, request.url));
  }

  // 6. ロールに基づいたアクセス制御
  const allowedPaths = pageAccessRules[userRole];
  // 許可リストが定義されていて、かつ現在のパスが許可リストのいずれにも含まれない場合
  if (allowedPaths && !allowedPaths.some((path) => pathname.startsWith(path))) {
    // 許可されていないページへのアクセスは、ロール別のホームページにリダイレクト
    const homePath = roleRedirectMap[userRole] || "/home";
    return NextResponse.redirect(new URL(homePath, request.url));
  }

  // すべてのチェックを通過した場合、リクエストを次に進める
  return NextResponse.next();
}

// This export is for Next.js middleware configuration and should not be confused with the imported appConfig.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|libs/MathJax|maintenance).*)"],
};
