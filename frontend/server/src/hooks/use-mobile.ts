import * as React from "react";

// 1024px 未満（スマホ・iPad縦）ではサイドバーをオーバーレイ表示にする。
// 820px の iPad で常時 256px を占有すると本文が 2/3 になってしまうため。
const MOBILE_BREAKPOINT = 1024;

export function useIsMobile() {
	const [isMobile, setIsMobile] = React.useState<boolean>(false);

	React.useEffect(() => {
		if (typeof window === "undefined") return;

		const checkIsMobile = () =>
			setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);

		// 初期値を設定
		checkIsMobile();

		const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
		mql.addEventListener("change", checkIsMobile);

		return () => mql.removeEventListener("change", checkIsMobile);
	}, []);

	return isMobile;
}
