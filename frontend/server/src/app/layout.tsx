import Providers from "../providers/AppProviders";
import "./globals.css";

export const metadata = {
	title: "学習支援システム",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="ja">
			<body color="background.default">
				{/* 保存済みの文字サイズ倍率を初回描画前に反映する（TextSizeMenu と対） */}
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: 静的文字列のみ
					dangerouslySetInnerHTML={{
						__html: `try{var s=localStorage.getItem("lms-text-scale");if(s&&s!=="1"){document.documentElement.style.fontSize=parseFloat(s)*100+"%"}}catch(e){}`,
					}}
				/>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
