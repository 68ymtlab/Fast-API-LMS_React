"use client";

import {
	MathJax as BetterMathJax,
	MathJaxContext,
} from "better-react-mathjax";
import {
	type FC,
	memo,
	type ReactNode,
	useEffect,
	useMemo,
	useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
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
		"*": [
			...(defaultSchema.attributes?.["*"] || []),
			"className",
			"style",
			"align",
		],
		table: ["width", "height", "border", "cellspacing", "cellpadding"],
		td: ["width", "height", "colspan", "rowspan", "align"],
		th: ["width", "height", "colspan", "rowspan", "align"],
		tr: ["height"],
		img: [
			...(defaultSchema.attributes?.img || []),
			"width",
			"height",
			"style",
		],
	},
	clobberPrefix: defaultSchema.clobberPrefix,
};

const filterMathJaxTestContent = (content: string): string => {
	let filteredContent = content;

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

	return filteredContent.replace(/\n{3,}/g, "\n\n").trim();
};

const normalizeImageUrls = (content: string): string => {
	let normalized = content;

	if (config.apiBaseUrl) {
		normalized = normalized.replace(
			/!\[([^\]]*)\]\((\/api\/images\/\d+)\)/g,
			(_, alt, src) => `![${alt}](${config.apiBaseUrl}${src})`,
		);
		normalized = normalized.replace(
			/<img([^>]*?)src=["'](\/api\/images\/\d+)["']([^>]*)>/gi,
			(_, before, src, after) =>
				`<img${before}src="${config.apiBaseUrl}${src}"${after}>`,
		);
	}

	normalized = normalized.replace(
		/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
		(_, alt, src) => {
			const sizeMatch = alt.match(/^(.*)\s*=(\d+)x(\d*)\s*$/);
			if (sizeMatch) {
				const cleanAlt = sizeMatch[1].trim();
				const widthAttr = sizeMatch[2] ? ` width="${sizeMatch[2]}"` : "";
				const heightAttr = sizeMatch[3] ? ` height="${sizeMatch[3]}"` : "";
				const styleAttr =
					sizeMatch[2] || sizeMatch[3]
						? ` style="width:${sizeMatch[2] ? `${sizeMatch[2]}px` : "auto"};height:${sizeMatch[3] ? `${sizeMatch[3]}px` : "auto"};"`
						: "";
				return `<img src="${src}" alt="${cleanAlt}"${widthAttr}${heightAttr}${styleAttr} />`;
			}
			return `<img src="${src}" alt="${alt}" />`;
		},
	);

	normalized = normalized.replace(
		/!\[([^\]]*)\]\((\/api\/images\/\d+)\)/g,
		(_, alt, src) => `<img src="${src}" alt="${alt}" />`,
	);

	return normalized;
};

const markdownComponents: Components = {
	img: ({ src, alt, ...rest }) => {
		const imageSrc = typeof src === "string" ? src : undefined;
		const sizeMatch = alt?.match(/^(.*)\s*=(\d+)x(\d*)\s*$/);
		if (sizeMatch) {
			const cleanAlt = sizeMatch[1].trim();
			const width = sizeMatch[2] ? `${sizeMatch[2]}px` : undefined;
			const height = sizeMatch[3] ? `${sizeMatch[3]}px` : undefined;
			return (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={imageSrc}
					alt={cleanAlt}
					width={width}
					height={height}
					style={{ width, height }}
					{...rest}
				/>
			);
		}
		// eslint-disable-next-line @next/next/no-img-element
		return <img src={imageSrc} alt={alt || ""} {...rest} />;
	},
	td: ({ node: _node, ...props }) => {
		const { vAlign: _vAlign, ...safeProps } = props as typeof props & {
			vAlign?: string;
		};
		return <td {...safeProps} />;
	},
	th: ({ node: _node, ...props }) => {
		const { vAlign: _vAlign, ...safeProps } = props as typeof props & {
			vAlign?: string;
		};
		return <th {...safeProps} />;
	},
	tr: ({ node: _node, ...props }) => {
		const { vAlign: _vAlign, ...safeProps } = props as typeof props & {
			vAlign?: string;
		};
		return <tr {...safeProps} />;
	},
};

/** MathJaxGroup 内で使う Markdown 本体（タイプセットは親が担当） */
export const MathJaxContent: FC<MathJaxProps> = memo(function MathJaxContent({
	text,
}) {
	const normalizedText = useMemo(
		() => normalizeImageUrls(filterMathJaxTestContent(text)),
		[text],
	);

	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema]]}
			components={markdownComponents}
		>
			{normalizedText}
		</ReactMarkdown>
	);
});

/** 複数ブロックをまとめて 1 回だけタイプセットする */
export const MathJaxGroup: FC<Props> = ({ children }) => (
	<BetterMathJax hideUntilTypeset="first">{children}</BetterMathJax>
);

type DebouncedMathJaxProps = MathJaxProps & {
	delayMs?: number;
};

/** 編集プレビュー向け。入力のたびにタイプセットしない */
export const DebouncedMathJax: FC<DebouncedMathJaxProps> = ({
	text,
	delayMs = 400,
}) => {
	const [debouncedText, setDebouncedText] = useState(text);

	useEffect(() => {
		const timer = window.setTimeout(() => setDebouncedText(text), delayMs);
		return () => window.clearTimeout(timer);
	}, [text, delayMs]);

	return <MathJax text={debouncedText} />;
};

export const MathJax: FC<MathJaxProps> = (props) => {
	const { text } = props;
	const normalizedText = useMemo(
		() => normalizeImageUrls(filterMathJaxTestContent(text)),
		[text],
	);

	return (
		<BetterMathJax dynamic hideUntilTypeset="first">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema]]}
				components={markdownComponents}
			>
				{normalizedText}
			</ReactMarkdown>
		</BetterMathJax>
	);
};
