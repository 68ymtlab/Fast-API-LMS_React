import type { NextConfig } from "next";
import debug from "./src/lib/utils/debug"; // @/libs/utils/debug でも可

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
};

const fs = require("fs-extra");
const path = require("node:path");

const mathjaxSource = path.join(__dirname, "node_modules", "mathjax", "es5");
const mathjaxDest = path.join(__dirname, "public", "libs", "MathJax", "es5");

// Storybook実行中かどうかを判定 (npm_lifecycle_event を見る)
const isStorybookLifecycle =
  process.env.npm_lifecycle_event === "storybook" || process.env.npm_lifecycle_script?.includes("storybook");

if (!isStorybookLifecycle) {
  debug.info("[next.config.ts] Copying MathJax files for Next.js build/dev...");
  try {
    fs.ensureDirSync(mathjaxDest); // コピー先のディレクトリが存在することを確認
    fs.copySync(mathjaxSource, mathjaxDest, { overwrite: true }); // 同期的にコピー
    debug.info("[next.config.ts] MathJax files copied successfully.");
  } catch (err) {
    debug.error("[next.config.ts] Error copying MathJax files:", err);
  }
} else {
  debug.info("[next.config.ts] Storybook execution detected, skipping MathJax copy to public directory.");
  // Storybookは main.ts の staticDirs 設定で node_modules から直接 MathJax を配信するため、
  // public ディレクトリへのコピーは不要です。
  // public/libs/MathJax ディレクトリ自体は存在確認だけしておく（他のものが依存している可能性を考慮）
  try {
    fs.ensureDirSync(path.join(__dirname, "public", "libs", "MathJax"));
  } catch (err) {
    debug.error("[next.config.ts] Error ensuring MathJax base directory for Storybook:", err);
  }
}

export default nextConfig;
