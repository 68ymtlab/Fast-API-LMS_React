"use client";

import {
	Book,
	ClipboardList,
	FileType,
	Home,
	LogIn,
	Megaphone,
	Settings,
	ShieldQuestion,
	Users,
	LayoutList,
} from "lucide-react";
import { memo, type ReactNode, useEffect, useState } from "react";
import { AdminHeader } from "@/components/atoms/layout/AdminHeader";
import { AppSidebar } from "@/components/atoms/sidebar/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { SidebarGroups } from "@/types/sidebarGroups";

const sidebarGroups: SidebarGroups[] = [
	{
		groupLabel: "管理者メニュー",
		groupItems: [
			{
				title: "管理者ホーム",
				url: "/admin/home",
				icon: Home,
			},
			{
				title: "科目・コース管理",
				url: "/admin/courses",
				icon: LayoutList,
			},
			{
				title: "ログイン履歴",
				url: "/admin/login-history",
				icon: LogIn,
			},
			{
				title: "ユーザー管理",
				url: "/admin/users",
				icon: Users,
			},
			{
				title: "演習問題ログ",
				url: "/admin/flow-log",
				icon: FileType,
			},
		],
	},
	{
		groupLabel: "授業管理（教師同等）",
		groupItems: [
			{
				title: "科目",
				url: "/t/home",
				icon: Book,
			},
			{
				title: "お知らせ管理",
				url: "/t/announcements",
				icon: Megaphone,
			},
			{
				title: "演習問題管理",
				url: "/t/exercises",
				icon: ClipboardList,
			},
			{
				title: "ユーザー登録",
				url: "/t/users/add",
				icon: Users,
			},
		],
	},
	{
		groupLabel: "アカウント",
		groupItems: [
			{
				title: "アカウント設定",
				url: "/t/settings",
				icon: Settings,
			},
		],
	},
	{
		groupLabel: "サポート",
		groupItems: [
			{
				title: "ヘルプ",
				externalUrl: "/manuals/teacher_manual.pdf",
				icon: ShieldQuestion, // 適切なアイコンに変更
				newTab: true,
			},
		],
	},
];

const AdminLayoutInner = memo(
	({ children }: { children: ReactNode }) => {
		return (
			<div className="flex min-h-screen">
				<AppSidebar sidebarGroups={sidebarGroups} showGroupLabels />
				<SidebarInset className="bg-gray-100 min-h-screen">
					<main className="flex-1 w-full bg-gray-100 min-h-screen pt-14">
						{children}
					</main>
				</SidebarInset>
			</div>
		);
	},
);

const AdminLayout = memo(({ children }: { children: ReactNode }) => {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return null;
	}

	return (
		<SidebarProvider defaultOpen={false}>
			<div className="flex flex-col min-h-screen w-full bg-gray-100">
				<AdminHeader />
				<AdminLayoutInner>{children}</AdminLayoutInner>
			</div>
		</SidebarProvider>
	);
});

export default AdminLayout;
