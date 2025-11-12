"use client";
// import dynamic from "next/dynamic";
import { CookiesProvider } from "react-cookie";

import { SessionProvider } from "next-auth/react";

// import { ThemeProvider } from "./ThemeProviders";

// // MathJaxの設定を動的にインポート
// const MathJaxSetup = dynamic(
// 	() => import("../components/shared/MathJax").then((m) => m.MathJaxSetup),
// 	{ ssr: false },
// );

export default function Providers({ children }: { children: React.ReactNode }, session: any) {
	return (
		<SessionProvider session={session} >
			<CookiesProvider>
			{/* <MathJaxSetup>
				<ThemeProvider> */}
					<main>{children}</main>
				{/* </ThemeProvider>
			</MathJaxSetup> */}
		</CookiesProvider>
		</SessionProvider>
		
	);
}
