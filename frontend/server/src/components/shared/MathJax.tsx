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
  return (
    <BetterMathJax>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema]]}>
        {text}
      </ReactMarkdown>
    </BetterMathJax>
  );
};
