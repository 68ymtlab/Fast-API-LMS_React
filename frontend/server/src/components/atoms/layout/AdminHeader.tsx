"use client";

import { Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FC, memo } from "react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

export const AdminHeader: FC = memo(() => {
	const { toggleSidebar } = useSidebar();
	const router = useRouter();

	return (
		<header className="fixed flex w-screen h-12 pt-2 bg-gray-100/95 backdrop-blur supports-[backdrop-filter]:bg-gray-100/80 z-30 border-b border-gray-200/70">
			<div
				className="shrink-0 flex items-center gap-2 px-4"
				style={{ width: "var(--sidebar-width, 16rem)" }}
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
					onClick={() => router.push("/admin/home")}
					className="text-base text-gray-400 hover:text-gray-600 transition-colors cursor-pointer font-medium truncate"
				>
					学習支援システム
				</button>
			</div>

			<div className="flex-1 flex items-center justify-end px-4 min-w-0">
				<span className="text-xs font-medium text-gray-500 max-w-[120px] truncate">
					管理者画面
				</span>
			</div>
		</header>
	);
});
