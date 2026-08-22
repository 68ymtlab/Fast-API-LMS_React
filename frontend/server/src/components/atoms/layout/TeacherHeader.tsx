"use client";

import { Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type FC, memo } from "react";
import { Button } from "@/components/ui/button";
import { TeacherBreadcrumb } from "@/components/atoms/layout/TeacherBreadcrumb";
import { useSidebar } from "@/components/ui/sidebar";

export const TeacherHeader: FC = memo(() => {
	const { toggleSidebar } = useSidebar();
	const router = useRouter();
	const pathname = usePathname();
	const isHome = pathname === "/t/home";

	return (
		<header className="fixed inset-x-0 flex h-12 pt-2 bg-transparent z-30 transition-colors duration-200">
			{/* 左エリア：サイドバー幅に合わせた領域（≡ + システム名） */}
			<div
				className="shrink-0 flex items-center gap-2 px-2 sm:px-4 lg:w-[var(--sidebar-width,16rem)]"
			>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => toggleSidebar()}
					className="text-gray-500 hover:bg-gray-200/70 h-9 w-9"
					aria-label="サイドバーの開閉"
				>
					<Menu className="size-6" />
				</Button>
				<button
					onClick={() => router.push("/t/home")}
					className="hidden sm:block text-base text-gray-400 hover:text-gray-600 transition-colors cursor-pointer font-medium truncate"
				>
					学習支援システム
				</button>
			</div>

			{/* 右エリア：コンテンツ幅（パンくず左寄せ + ユーザー情報右寄せ） */}
			<div className="flex-1 flex items-center justify-between gap-2 px-2 sm:px-4 min-w-0">
				{/* パンくずリスト（ホーム以外で表示・左寄せ） */}
				{!isHome ? <TeacherBreadcrumb /> : <div />}

				{/* 右側ラベル（学生側のユーザー情報枠と揃える） */}
				<div className="flex items-center gap-3 shrink-0">
					<span className="text-xs font-medium text-gray-500 max-w-[120px] truncate">
						教師画面
					</span>
				</div>
			</div>
		</header>
	);
});
