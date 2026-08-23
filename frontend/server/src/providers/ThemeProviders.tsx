"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

type Theme =
	| "default"
	| "theme1"
	| "theme2"
	| "theme3"
	| "theme4"
	| "theme5"
	| "theme6"
	| "theme7"
	| "theme8"
	| "theme9"; // 利用可能なベーステーマ
type Mode = "light" | "dark";

interface ThemeContextType {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	mode: Mode;
	setMode: (mode: Mode) => void;
	toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
	// 重要（hydration）: 初期値は SSR とクライアント初回レンダーで必ず同じにする。
	// 以前は useState の初期化関数内で typeof window 分岐 + localStorage/matchMedia を読んでいたため、
	// ダークモードや別テーマを保存しているユーザーだけ SSR と初回レンダーが食い違い、
	// React の「A tree hydrated but some attributes ... didn't match」警告が出ていた
	// （実際に描画が分岐するのは ThemeSwitcher の太陽/月アイコン）。
	// 保存値の反映はマウント後の useEffect で行う（テーマ属性はもともと effect でしか適用されないので見た目の挙動は同じ）。
	const [theme, setThemeState] = useState<Theme>("default");
	const [mode, setModeState] = useState<Mode>("light");
	const initialized = useRef(false);

	useEffect(() => {
		// マウント後に保存値／OS 設定を読み込んで反映
		const storedTheme =
			(localStorage.getItem("app-theme") as Theme) || "default";
		const storedMode =
			(localStorage.getItem("app-mode") as Mode) ||
			(window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light");
		const root = window.document.documentElement;
		root.setAttribute("data-theme", storedTheme);
		root.setAttribute("data-mode", storedMode);
		setThemeState(storedTheme);
		setModeState(storedMode);
		initialized.current = true;
	}, []);

	useEffect(() => {
		if (!initialized.current) return; // 初期読み込み前に既定値で localStorage を上書きしない
		const root = window.document.documentElement;
		root.setAttribute("data-theme", theme);
		localStorage.setItem("app-theme", theme);
	}, [theme]);

	useEffect(() => {
		if (!initialized.current) return;
		const root = window.document.documentElement;
		root.setAttribute("data-mode", mode);
		localStorage.setItem("app-mode", mode);
	}, [mode]);

	// システムのテーマ変更を関し
	// biome-ignore lint/correctness/useExhaustiveDependencies: マウント時に1回だけ購読する（setMode は安定参照）
	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleChange = () => {
			// ユーザーが明示的にモードを選択していない場合のみシステムに追従
			if (!localStorage.getItem("app-mode-explicitly-set")) {
				setMode(mediaQuery.matches ? "dark" : "light");
			}
		};
		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, []);

	const setTheme = (newTheme: Theme) => {
		setThemeState(newTheme);
	};

	const setMode = (newMode: Mode) => {
		setModeState(newMode);
		localStorage.setItem("app-mode-explicitly-set", "true");
	};

	const toggleMode = () => {
		setMode(mode === "light" ? "dark" : "light");
	};

	return (
		<ThemeContext.Provider
			value={{ theme, setTheme, mode, setMode, toggleMode }}
		>
			{children}
		</ThemeContext.Provider>
	);
};

export const useTheme = () => {
	const context = useContext(ThemeContext);
	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
};
