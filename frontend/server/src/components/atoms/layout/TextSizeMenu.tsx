"use client";

import { ALargeSmall } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * 文字サイズ（表示倍率）の切り替えメニュー。
 *
 * html 要素の font-size を変えることで、rem 基準の文字・余白を一括で
 * 拡大縮小する。設定は端末ごとに localStorage に保存し、初回描画前の
 * 反映は app/layout.tsx のインラインスクリプトが行う。
 * Tailwind のブレークポイントは初期フォントサイズ基準で評価されるため、
 * 倍率を変えてもレスポンシブの切り替え位置は動かない。
 */
export const TEXT_SCALE_STORAGE_KEY = "lms-text-scale";

const OPTIONS = [
	{ value: "0.9", label: "小さめ (90%)" },
	{ value: "1", label: "標準 (100%)" },
	{ value: "1.1", label: "大きめ (110%)" },
	{ value: "1.25", label: "特大 (125%)" },
] as const;

const applyTextScale = (scale: string) => {
	document.documentElement.style.fontSize =
		scale === "1" ? "" : `${Number.parseFloat(scale) * 100}%`;
};

export const TextSizeMenu = () => {
	const [scale, setScale] = useState("1");

	useEffect(() => {
		try {
			const saved = window.localStorage.getItem(TEXT_SCALE_STORAGE_KEY);
			if (saved && OPTIONS.some((option) => option.value === saved)) {
				setScale(saved);
			}
		} catch {
			// プライベートブラウズ等で localStorage が使えない場合は標準のまま
		}
	}, []);

	const handleChange = (value: string) => {
		setScale(value);
		applyTextScale(value);
		try {
			window.localStorage.setItem(TEXT_SCALE_STORAGE_KEY, value);
		} catch {
			// 保存できなくてもこのタブ内では反映される
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="text-gray-500 hover:bg-gray-200/70 h-7 w-7"
					aria-label="文字サイズの変更"
				>
					<ALargeSmall className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={8}>
				<DropdownMenuLabel>文字サイズ</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={scale} onValueChange={handleChange}>
					{OPTIONS.map((option) => (
						<DropdownMenuRadioItem key={option.value} value={option.value}>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
