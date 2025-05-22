"use client";

import { Button } from "@/components/ui/button"; // shadcn/ui の Button を使用する例
import { useTheme } from "@/providers/ThemeProviders"; // パスは適宜調整
import { Moon, Palette, Sun } from "lucide-react"; // アイコンの例

export const ThemeSwitcher = () => {
  const { theme, setTheme, mode, toggleMode, setMode } = useTheme();

  return (
    <div className="flex items-center space-x-2 p-4">
      {/* モード切り替えボタン */}
      <Button variant="outline" size="icon" onClick={toggleMode}>
        {mode === "light" ? <Moon className="h-[1.2rem] w-[1.2rem]" /> : <Sun className="h-[1.2rem] w-[1.2rem]" />}
        <span className="sr-only">Toggle theme mode</span>
      </Button>

      {/* テーマ選択 (例: ドロップダウンやラジオボタンで実装) */}
      <div className="flex items-center space-x-1">
        <Palette className="h-5 w-5 mr-1" />
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
          className="p-2 border rounded-md bg-background text-foreground border-border"
        >
          <option value="default">Default</option>
          <option value="theme1">Theme1</option>
          <option value="theme2">Theme2</option>
          <option value="theme3">Theme3</option>
          <option value="theme4">Theme4</option>
          <option value="theme5">Theme5</option>
          <option value="theme6">Theme6</option>
          <option value="theme7">Theme7</option>
          <option value="theme8">Theme8</option>
          <option value="theme9">Theme9</option>
        </select>
      </div>

      {/* モードを直接選択するボタンの例 (オプション) */}
      <Button variant={mode === "light" ? "secondary" : "ghost"} onClick={() => setMode("light")}>
        Light
      </Button>
      <Button variant={mode === "dark" ? "secondary" : "ghost"} onClick={() => setMode("dark")}>
        Dark
      </Button>
    </div>
  );
};
