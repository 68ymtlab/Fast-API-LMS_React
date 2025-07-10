"use client";

import { MathJax as BetterMathJax, MathJaxContext } from "better-react-mathjax";
import type { FC, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import "./style.css";

type Props = {
  children: ReactNode;
};

const config = {
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
    <MathJaxContext config={config} version={3} src="/libs/MathJax/es5/tex-mml-chtml.js">
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
    "*": [...(defaultSchema.attributes?.["*"] || []), "className"],
  },
};

export const MathJax: FC<MathJaxProps> = (props) => {
  const { text } = props;

  // MathJaxテストセクションを除去するフィルタリング関数
  const filterMathJaxTestContent = (content: string): string => {
    console.log("[MathJax] Filtering content, original length:", content.length);

    let filteredContent = content;

    // MathJaxテストセクションを見つけて削除
    // #### MathJaxテスト から次のセクションまでを削除
    filteredContent = filteredContent.replace(/#### MathJaxテスト[\s\S]*?(?=####|###|##|#|$)/g, "");
    filteredContent = filteredContent.replace(/### MathJaxテスト[\s\S]*?(?=####|###|##|#|$)/g, "");
    filteredContent = filteredContent.replace(/## MathJaxテスト[\s\S]*?(?=####|###|##|#|$)/g, "");
    filteredContent = filteredContent.replace(/# MathJaxテスト[\s\S]*?(?=####|###|##|#|$)/g, "");

    // HTMLタグの場合
    filteredContent = filteredContent.replace(/<h4[^>]*>MathJaxテスト<\/h4>[\s\S]*?(?=<h[1-6]|$)/gi, "");
    filteredContent = filteredContent.replace(/<h3[^>]*>MathJaxテスト<\/h3>[\s\S]*?(?=<h[1-6]|$)/gi, "");
    filteredContent = filteredContent.replace(/<h2[^>]*>MathJaxテスト<\/h2>[\s\S]*?(?=<h[1-6]|$)/gi, "");
    filteredContent = filteredContent.replace(/<h1[^>]*>MathJaxテスト<\/h1>[\s\S]*?(?=<h[1-6]|$)/gi, "");

    // 空行を整理
    filteredContent = filteredContent.replace(/\n{3,}/g, "\n\n");

    console.log("[MathJax] Filtered content length:", filteredContent.length);
    console.log("[MathJax] Content was reduced by:", content.length - filteredContent.length, "chars");

    return filteredContent.trim();
  };

  // テキストをフィルタリング
  const filteredText = filterMathJaxTestContent(text);

  return (
    <BetterMathJax>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema]]}>
        {filteredText}
      </ReactMarkdown>
    </BetterMathJax>
  );
};
