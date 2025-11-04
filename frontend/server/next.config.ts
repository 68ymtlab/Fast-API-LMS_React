import type { NextConfig } from "next";
import debug from "./src/lib/utils/debug"; // @/libs/utils/debug でも可

const nextConfig: NextConfig = {
	/* config options here */
	eslint: {
		ignoreDuringBuilds: true,
	},
	// パフォーマンス最適化
	compiler: {
		removeConsole:
			process.env.NODE_ENV === "production"
				? {
						exclude: ["error", "warn"],
					}
				: false,
	},
	experimental: {
		optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
	},
	// 画像最適化
	images: {
		dangerouslyAllowSVG: true,
		contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
	},
	// Webpack設定
	webpack: (config, { dev }) => {
		if (dev) {
			// WSL2でのファイルウォッチングを改善
			config.watchOptions = {
				poll: 1000,
				aggregateTimeout: 300,
			};
		}

		// バンドルサイズの最適化
		// config.optimization = {
		//   ...config.optimization,
		//   splitChunks: {
		//     chunks: 'all',
		//     cacheGroups: {
		//       vendor: {
		//         test: /[\\/]node_modules[\\/]/,
		//         name: 'vendors',
		//         chunks: 'all',
		//       },
		//       mathjax: {
		//         test: /[\\/]node_modules[\\/](mathjax|better-react-mathjax)[\\/]/,
		//         name: 'mathjax',
		//         chunks: 'all',
		//         priority: 10,
		//       },
		//     },
		//   },
		// };

		return config;
	},
};

const fs = require("fs-extra");
const path = require("node:path");

const mathjaxSource = path.join(__dirname, "node_modules", "mathjax", "es5");
const mathjaxDest = path.join(__dirname, "public", "libs", "MathJax", "es5");

// Storybook実行中かどうかを判定 (npm_lifecycle_event を見る)
const isStorybookLifecycle =
	process.env.npm_lifecycle_event === "storybook" ||
	process.env.npm_lifecycle_script?.includes("storybook");

if (!isStorybookLifecycle) {
	debug.info("[next.config.ts] Copying MathJax files for Next.js build/dev...");
	try {
		fs.ensureDirSync(mathjaxDest); // コピー先のディレクトリが存在することを確認
		// アクセス権限エラーを回避するため、既存ファイルを削除してからコピー
		if (fs.existsSync(mathjaxDest)) {
			fs.removeSync(mathjaxDest);
			fs.ensureDirSync(mathjaxDest);
		}
		fs.copySync(mathjaxSource, mathjaxDest, { overwrite: true }); // 同期的にコピー
		debug.info("[next.config.ts] MathJax files copied successfully.");
	} catch (err) {
		debug.error("[next.config.ts] Error copying MathJax files:", err);
		// エラーが発生してもNext.jsの起動を継続
		debug.warn("[next.config.ts] Continuing without MathJax copy...");
	}
} else {
	debug.info(
		"[next.config.ts] Storybook execution detected, skipping MathJax copy to public directory.",
	);
	// Storybookは main.ts の staticDirs 設定で node_modules から直接 MathJax を配信するため、
	// public ディレクトリへのコピーは不要です。
	// public/libs/MathJax ディレクトリ自体は存在確認だけしておく（他のものが依存している可能性を考慮）
	try {
		fs.ensureDirSync(path.join(__dirname, "public", "libs", "MathJax"));
	} catch (err) {
		debug.error(
			"[next.config.ts] Error ensuring MathJax base directory for Storybook:",
			err,
		);
	}
}

export default nextConfig;
