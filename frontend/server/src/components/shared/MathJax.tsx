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
    inlineMath: [
      ["\\(", "\\)"],
    ],
    displayMath: [
      ["\\[", "\\]"],
    ],
    packages: {
      '[+]': ['ams', 'newcommand', 'configmacros', 'action', 'cancel']
    },
    processEscapes: true,
    processEnvironments: true,
  },
  options: {
    renderActions: {
      addMenu: [0, '', '']
    }
  },
  startup: {
    ready: () => {
      const MathJax = (window as any).MathJax;
      MathJax.startup.defaultReady();
      console.log('MathJax initialized successfully');
    }
  }
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

// HTMLコンテンツ用のMathJaxコンポーネント（数式処理済みHTMLを表示）
import { MathJax as MathJaxElement } from "better-react-mathjax";
import { useEffect, useRef } from "react";

type MathJaxHTMLProps = {
  html: string;
};

export const MathJaxHTML: FC<MathJaxHTMLProps> = (props) => {
  const { html } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // MathJaxの再処理を直接実行
    const processMathjax = async () => {
      if (typeof window !== 'undefined' && containerRef.current) {
        const mathJax = (window as any).MathJax;
        if (mathJax && mathJax.typesetPromise) {
          try {
            // 既存の数式をクリア
            await mathJax.typesetClear([containerRef.current]);
            // 新しい数式を処理
            await mathJax.typesetPromise([containerRef.current]);
            console.log('MathJax content processed successfully');
          } catch (err) {
            console.warn('MathJax typeset error:', err);
            // フォールバック：全体を再処理
            try {
              await mathJax.typesetPromise();
            } catch (fallbackErr) {
              console.error('MathJax fallback processing failed:', fallbackErr);
            }
          }
        } else {
          console.warn('MathJax not ready or not available');
        }
      }
    };

    // MathJaxが初期化されるまで待機
    const checkAndProcess = () => {
      const mathJax = (window as any).MathJax;
      if (mathJax && mathJax.startup && mathJax.startup.document) {
        processMathjax();
      } else {
        setTimeout(checkAndProcess, 200);
      }
    };

    // 少し遅延を入れて確実に実行
    const timer = setTimeout(checkAndProcess, 100);
    return () => clearTimeout(timer);
  }, [html]);

  return (
    <div 
      ref={containerRef}
      dangerouslySetInnerHTML={{ __html: html }}
      className="mathjax-content"
    />
  );
};
