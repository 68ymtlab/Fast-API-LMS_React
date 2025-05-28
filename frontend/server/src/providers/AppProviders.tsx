"use client";

import { CacheProvider } from "@emotion/react";
import dynamic from "next/dynamic";
import { CookiesProvider } from "react-cookie";

import createEmotionCache from "../utils/createEmotionCache";
import { LoginUserProvider } from "./LoginUserProvider";
import { ThemeProvider } from "./ThemeProviders";

// MathJaxの設定を動的にインポート
const MathJaxSetup = dynamic(() => import("../components/shared/MathJax").then((m) => m.MathJaxSetup), { ssr: false });

// Emotionのクライアントキャッシュを作成
const clientSideEmotionCache = createEmotionCache();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CacheProvider value={clientSideEmotionCache}>
      <CookiesProvider>
        <MathJaxSetup>
          <LoginUserProvider>
            <ThemeProvider>
              <main>{children}</main>
            </ThemeProvider>
          </LoginUserProvider>
        </MathJaxSetup>
      </CookiesProvider>
    </CacheProvider>
  );
}
