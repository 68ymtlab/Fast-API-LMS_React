"use client";

import { Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FC, memo } from "react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

export const TeacherHeader: FC = memo(() => {
	const { toggleSidebar } = useSidebar();
	const router = useRouter();

	return (
		<header className="fixed flex justify-between px-4 w-screen h-11 bg-white items-center z-30">
			{/* 左端：サイドバートグル + システム名 */}
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					onClick={() => toggleSidebar()}
					className="text-gray-500 hover:bg-gray-100 h-8 w-8"
					aria-label="サイドバーの開閉"
				>
					<Menu className="size-5" />
				</Button>
				<button
					onClick={() => router.push("/t/home")}
					className="text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer font-medium"
				>
					学習支援システム
				</button>
			</div>
			{/* 右側スペース確保 */}
			<div className="w-8" />
		</header>
	);
});
