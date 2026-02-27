"use client";

import { MathJax as BetterMathJax, MathJaxContext } from "better-react-mathjax";
import type { FC, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import config from "@/lib/utils/config";
import "./style.css";

type Props = {
	children: ReactNode;
};

const mathJaxConfig = {
	tex: {
		packages: { "[+]": ["html"] },
		inlineMath: [
			["$", "$"],
			["\\(", "\\)"],
		],
		displayMath: [
			["$$", "$$"],
			["\\[", "\\]"],
		],
	},
};

export const MathJaxSetup: FC<Props> = (props) => {
	const { children } = props;
	return (
		<MathJaxContext
			config={mathJaxConfig}
			version={3}
			src="/libs/MathJax/es5/tex-mml-chtml.js"
		>
			{children}
		</MathJaxContext>
	);
};

type MathJaxProps = {
	text: string;
};

const customSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		// グローバルにclassName, style, alignを許可
		"*": [
			...(defaultSchema.attributes?.["*"] || []),
			"className",
			"style",
			"align",
		],
		// テーブル関連要素でwidth/height属性を許可
		table: [
			...(defaultSchema.attributes?.table || []),
			"width",
			"height",
			"border",
			"cellspacing",
			"cellpadding",
		],
		td: [
			...(defaultSchema.attributes?.td || []),
			"width",
			"height",
			"colspan",
			"rowspan",
			"valign",
		],
		th: [
			...(defaultSchema.attributes?.th || []),
			"width",
			"height",
			"colspan",
			"rowspan",
			"valign",
		],
		tr: [
			...(defaultSchema.attributes?.tr || []),
			"height",
		],
		// img要素でwidth/height/style属性を明示的に許可
		img: [
			...(defaultSchema.attributes?.img || []),
			"width",
			"height",
			"style",
		],
	},
	// style属性の中身をプロパティレベルでフィルタしない
	// （デフォルトではrehype-sanitizeがstyle内のCSSプロパティを削除する場合がある）
	clobberPrefix: defaultSchema.clobberPrefix,
};


export const MathJax: FC<MathJaxProps> = (props) => {
	const { text } = props;

	// MathJaxテストセクションを除去するフィルタリング関数
	const filterMathJaxTestContent = (content: string): string => {
		console.log(
			"[MathJax] Filtering content, original length:",
			content.length,
		);

		let filteredContent = content;

		// MathJaxテストセクションを見つけて削除
		// #### MathJaxテスト から次のセクションまでを削除
		filteredContent = filteredContent.replace(
			/#### MathJaxテスト[\s\S]*?(?=####|###|##|#|$)/g,
			"",
		);
		filteredContent = filteredContent.replace(
			/### MathJaxテスト[\s\S]*?(?=####|###|##|#|$)/g,
			"",
		);
		filteredContent = filteredContent.replace(
			/## MathJaxテスト[\s\S]*?(?=####|###|##|#|$)/g,
			"",
		);
		filteredContent = filteredContent.replace(
			/# MathJaxテスト[\s\S]*?(?=####|###|##|#|$)/g,
			"",
		);

		// HTMLタグの場合
		filteredContent = filteredContent.replace(
			/<h4[^>]*>MathJaxテスト<\/h4>[\s\S]*?(?=<h[1-6]|$)/gi,
			"",
		);
		filteredContent = filteredContent.replace(
			/<h3[^>]*>MathJaxテスト<\/h3>[\s\S]*?(?=<h[1-6]|$)/gi,
			"",
		);
		filteredContent = filteredContent.replace(
			/<h2[^>]*>MathJaxテスト<\/h2>[\s\S]*?(?=<h[1-6]|$)/gi,
			"",
		);
		filteredContent = filteredContent.replace(
			/<h1[^>]*>MathJaxテスト<\/h1>[\s\S]*?(?=<h[1-6]|$)/gi,
			"",
		);

		// 空行を整理
		filteredContent = filteredContent.replace(/\n{3,}/g, "\n\n");

		console.log("[MathJax] Filtered content length:", filteredContent.length);
		console.log(
			"[MathJax] Content was reduced by:",
			content.length - filteredContent.length,
			"chars",
		);

		return filteredContent.trim();
	};

	// テキストをフィルタリング
	const filteredText = filterMathJaxTestContent(text);

	// Markdown/HTML内の画像URLが Next 側 (/api/...) を向いて404になるため、APIサーバへ向け直す
	const normalizeImageUrls = (content: string): string => {
		let normalized = content;

		console.log("[MathJax] apiBaseUrl:", config.apiBaseUrl);
		console.log("[MathJax] Input content snippet:", content.substring(0, 200));

		// ステップ1: Markdown画像記法 ![alt](/api/images/XX) のURLをAPIサーバーへ書き換え
		if (config.apiBaseUrl) {
			normalized = normalized.replace(
				/!\[([^\]]*)\]\((\/api\/images\/\d+)\)/g,
				(_, alt, src) => `![${alt}](${config.apiBaseUrl}${src})`,
			);
			// HTML <img>タグのsrcも同様に書き換え
			normalized = normalized.replace(
				/<img([^>]*?)src=["'](\/api\/images\/\d+)["']([^>]*)>/gi,
				(_, before, src, after) =>
					`<img${before}src="${config.apiBaseUrl}${src}"${after}>`,
			);
		}

		// ステップ2: Markdown画像記法（http/https URL）を<img>タグへ変換する
		// Markdownパーサーは<td>などHTMLブロック内のMarkdown記法を処理しないため、
		// 事前に<img>タグへ変換しておく
		normalized = normalized.replace(
			/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
			(_, alt, src) => {
				const sizeMatch = alt.match(/^(.*)\s*=(\d+)x(\d*)\s*$/);
				if (sizeMatch) {
					const cleanAlt = sizeMatch[1].trim();
					const widthAttr = sizeMatch[2] ? ` width="${sizeMatch[2]}"` : "";
					const heightAttr = sizeMatch[3] ? ` height="${sizeMatch[3]}"` : "";
					const styleAttr = sizeMatch[2] || sizeMatch[3]
						? ` style="width:${sizeMatch[2] ? `${sizeMatch[2]}px` : "auto"};height:${sizeMatch[3] ? `${sizeMatch[3]}px` : "auto"};"`
						: "";
					return `<img src="${src}" alt="${cleanAlt}"${widthAttr}${heightAttr}${styleAttr} />`;
				}
				return `<img src="${src}" alt="${alt}" />`;
			},
		);

		// ステップ3: apiBaseURLが未設定の場合も含め、残った /api/images/XX 形式を<img>タグへ変換
		// （/api/images/XX はNext.jsルートではなくバックエンドAPIなので、そのままでも動く環境もあるが念のため）
		normalized = normalized.replace(
			/!\[([^\]]*)\]\((\/api\/images\/\d+)\)/g,
			(_, alt, src) => `<img src="${src}" alt="${alt}" />`,
		);

		console.log("[MathJax] Normalized snippet:", normalized.substring(0, 200));

		return normalized;
	};


	const normalizedText = normalizeImageUrls(filteredText);

	return (
		<BetterMathJax>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema]]}
				components={{
					// Markdown画像のaltテキストに =幅x高さ を指定してサイズ調整できるようにする
					// 例: ![説明文 =200x](url) → width=200px
					// 例: ![説明文 =200x100](url) → width=200px, height=100px
					img: ({ src, alt, ...rest }) => {
						const sizeMatch = alt?.match(/^(.*)\s*=(\d+)x(\d*)\s*$/);
						if (sizeMatch) {
							const cleanAlt = sizeMatch[1].trim();
							const width = sizeMatch[2] ? `${sizeMatch[2]}px` : undefined;
							const height = sizeMatch[3] ? `${sizeMatch[3]}px` : undefined;
							return (
								// eslint-disable-next-line @next/next/no-img-element
								<img
									src={src}
									alt={cleanAlt}
									width={width}
									height={height}
									style={{ width, height }}
									{...rest}
								/>
							);
						}
						// eslint-disable-next-line @next/next/no-img-element
						return <img src={src} alt={alt || ""} {...rest} />;
					},
				}}
			>
				{normalizedText}
			</ReactMarkdown>
		</BetterMathJax>
	);
};
