"use client";

// チューター画面用の安全な数式描画。
// better-react-mathjax の <MathJax> は、MathJax の読み込み完了前に要素が unmount されると
// typesetClear([null]) で例外 → 未処理の Promise rejection になり、Next の開発オーバーレイに
// 「Typesetting failed: Cannot read properties of null (reading 'contains')」が積み上がる。
// 会話の切替・履歴の差し替え・ページ遷移で起きるので、unmount 済み／切替済みなら typeset しない版を使う。
import { MathJaxBaseContext } from "better-react-mathjax";
import { type FC, useContext, useEffect, useRef } from "react";
import { MathJaxContent } from "@/components/shared/MathJax";

type MJ = {
	startup: { promise: Promise<unknown> };
	typesetClear: (els: Element[]) => void;
	typesetPromise: (els: Element[]) => Promise<unknown>;
};

export const SafeMathJax: FC<{ text: string; className?: string }> = ({
	text,
	className,
}) => {
	const ref = useRef<HTMLDivElement>(null);
	const ctx = useContext(MathJaxBaseContext);

	// biome-ignore lint/correctness/useExhaustiveDependencies: text が変わるたびに typeset し直す（DOM は MathJaxContent が更新）
	useEffect(() => {
		const el = ref.current;
		if (!el || !ctx) return;
		let cancelled = false;
		(ctx.promise as unknown as Promise<MJ>)
			.then((mj) => {
				if (cancelled || !el.isConnected) return;
				return mj.startup.promise.then(() => {
					if (cancelled || !el.isConnected) return;
					mj.typesetClear([el]);
					return mj.typesetPromise([el]);
				});
			})
			.catch(() => {
				/* unmount 競合などの描画エラーは無視（本文はプレーンのまま表示される） */
			});
		return () => {
			cancelled = true;
		};
	}, [text, ctx]);

	return (
		<div ref={ref} className={className}>
			<MathJaxContent text={text} />
		</div>
	);
};
