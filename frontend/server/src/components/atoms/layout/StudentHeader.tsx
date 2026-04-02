"use client";

import { Bell, Clock, Menu, Star, Target } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type FC, memo, useEffect, useState } from "react";
import { AnnouncementsDialog } from "@/components/students/AnnouncementsDialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import apiClient from "@/lib/api/apiClient";
import { useSidebar } from "@/components/ui/sidebar";
import { StudentBreadcrumbInline } from "@/app/(students)/layout";

export const StudentHeader: FC = memo(() => {
	const { toggleSidebar } = useSidebar();
	const router = useRouter();
	const pathname = usePathname();
	const [username, setUsername] = useState("");
	const [point, setPoint] = useState("0");
	const [loginNum, setLoginNum] = useState(0);
	const [isAnnouncementsOpen, setIsAnnouncementsOpen] = useState(false);
	const [unreadAnnouncementCount, setUnreadAnnouncementCount] = useState(0);

	const isHome = pathname === "/home";

	useEffect(() => {
		apiClient
			.get("/users/me")
			.then((res) => {
				if (res.status === 200) {
					setUsername(
						res.data.username ?? res.data.display_name ?? res.data.email ?? "",
					);
				}
			})
			.catch((error) => {
				console.error("ユーザー名の取得に失敗しました:", error);
			});

		apiClient
			.get("/progress/points")
			.then((res) => {
				if (res.status === 200) {
					setPoint(res.data?.toString());
				}
			})
			.catch((error) => {
				console.error("ポイントの取得に失敗しました:", error);
			});

		apiClient
			.get("/progress/logindays")
			.then((res) => {
				if (res.status === 200) {
					setLoginNum(res.data);
				}
			})
			.catch((error) => {
				console.error("ログイン日数の取得に失敗しました:", error);
			});

		apiClient
			.get("/announcements_list")
			.then((res) => {
				if (res.status !== 200) return;
				const currentTime = new Date();
				const unreadCount = (res.data as Array<{
					start_date_time: string;
					end_date_time: string;
					is_active: boolean;
					is_read: boolean;
				}>).filter((announcement) => {
					const startTime = new Date(announcement.start_date_time);
					const endTime = new Date(announcement.end_date_time);
					return (
						announcement.is_active &&
						currentTime >= startTime &&
						currentTime <= endTime &&
						!announcement.is_read
					);
				}).length;
				setUnreadAnnouncementCount(unreadCount);
			})
			.catch((error) => {
				console.error("お知らせの取得に失敗しました:", error);
			});
	}, []);

	return (
		<header className="fixed flex w-screen h-12 pt-2 bg-gray-100/95 backdrop-blur supports-[backdrop-filter]:bg-gray-100/80 border-b border-gray-200/70 z-30 transition-colors duration-200">
			{/* 左エリア：サイドバー幅に合わせた領域（≡ + システム名） */}
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
					onClick={() => router.push("/home")}
					className="text-base text-gray-400 hover:text-gray-600 transition-colors cursor-pointer font-medium truncate"
				>
					学習支援システム
				</button>
			</div>

			{/* 右エリア：コンテンツ幅（パンくず左寄せ + ユーザー情報右寄せ） */}
			<div className="flex-1 flex items-center justify-between px-4 min-w-0">
				{/* パンくずリスト（ホーム以外で表示・左寄せ） */}
				{!isHome ? (
					<StudentBreadcrumbInline />
				) : (
					<div />
				)}

				{/* ユーザー情報（右寄せ） */}
				<div className="flex items-center gap-3 shrink-0">
					{/* ログイン日数 */}
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex items-center gap-1 text-gray-400 cursor-default">
									<Clock className="size-3.5 flex-shrink-0" />
									<span className="text-xs font-medium">{loginNum}日</span>
								</div>
							</TooltipTrigger>
							<TooltipContent>
								<p>ログイン日数</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					{/* ポイント */}
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex items-center gap-1 text-gray-400 cursor-default">
									<Star className="size-3.5 flex-shrink-0 text-secondary" />
									<span className="text-xs font-medium">{point}pt</span>
								</div>
							</TooltipTrigger>
							<TooltipContent>
								<p>獲得ポイント</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					{/* お知らせ */}
					<DropdownMenu
						open={isAnnouncementsOpen}
						onOpenChange={setIsAnnouncementsOpen}
					>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="text-gray-500 hover:bg-gray-200/70 h-7 w-7 relative"
								aria-label="お知らせを開く"
							>
								<Bell className="size-4" />
								{unreadAnnouncementCount > 0 && (
									<span className="absolute right-1 top-1 inline-flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
								)}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							side="bottom"
							sideOffset={8}
							className="p-0"
						>
							<AnnouncementsDialog
								open={isAnnouncementsOpen}
								onUnreadChange={setUnreadAnnouncementCount}
							/>
						</DropdownMenuContent>
					</DropdownMenu>

					{/* 目標（TODO: 実装予定） */}
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="text-gray-300 cursor-not-allowed h-7 w-7"
									disabled
									aria-label="目標（実装予定）"
								>
									<Target className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>目標（実装予定）</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					{/* セパレーター */}
					<div className="w-px h-4 bg-gray-300" />

					{/* ユーザー名 */}
					{username && (
						<span className="text-xs font-medium text-gray-500 max-w-[120px] truncate">
							{username}
						</span>
					)}
				</div>
			</div>
		</header>
	);
});
