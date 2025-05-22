"use client";

import { MathJaxContext } from "better-react-mathjax";
import type { FC, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeMathjax from "rehype-mathjax";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

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

export const MathJax: FC<MathJaxProps> = (props) => {
  const { text } = props;
  return (
    <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeMathjax]}>
      {text}
    </ReactMarkdown>
  );
};
