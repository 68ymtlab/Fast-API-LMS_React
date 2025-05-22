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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
