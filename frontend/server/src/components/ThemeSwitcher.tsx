"use client";

import { Moon, Palette, Sun } from "lucide-react"; // アイコンの例
import { Button } from "@/components/ui/button"; // shadcn/ui の Button を使用する例
import { useTheme } from "@/providers/ThemeProviders"; // パスは適宜調整

export const ThemeSwitcher = () => {
	const { theme, setTheme, mode, toggleMode, setMode } = useTheme();

	return (
		<div className="flex items-center space-x-2">
			{/* モード切り替えボタン */}
			<Button variant="outline" size="icon" onClick={toggleMode}>
				{mode === "light" ? (
					<Moon className="h-[1.2rem] w-[1.2rem]" />
				) : (
					<Sun className="h-[1.2rem] w-[1.2rem]" />
				)}
				<span className="sr-only">Toggle theme mode</span>
			</Button>

			{/* テーマ選択 */}
			<div className="flex items-center space-x-1">
				<select
					value={theme}
					onChange={(e) =>
						setTheme(
							e.target.value as
								| "default"
								| "theme1"
								| "theme2"
								| "theme3"
								| "theme4"
								| "theme5"
								| "theme6"
								| "theme7"
								| "theme8"
								| "theme9",
						)
					}
					className="p-1 text-sm border rounded-md bg-background text-foreground border-border"
				>
					<option value="default">デフォルト</option>
					<option value="theme1">テーマ1</option>
					<option value="theme2">テーマ2</option>
					<option value="theme3">テーマ3</option>
					<option value="theme4">テーマ4</option>
					<option value="theme5">テーマ5</option>
					<option value="theme6">テーマ6</option>
					<option value="theme7">テーマ7</option>
					<option value="theme8">テーマ8</option>
					<option value="theme9">テーマ9</option>
				</select>
			</div>
		</div>
	);
};
