"use client";

import {
	Book,
	ClipboardList,
	FileType,
	Home,
	LayoutList,
	LogIn,
	Settings,
	ShieldQuestion,
	Users,
} from "lucide-react";
import { memo, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { AdminHeader } from "@/components/atoms/layout/AdminHeader";
import { TeacherHeader } from "@/components/atoms/layout/TeacherHeader";
import { AppSidebar } from "@/components/atoms/sidebar/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { SidebarGroups } from "@/types/sidebarGroups";

const sidebarGroups: SidebarGroups[] = [
	{
		groupLabel: "メイン",
		groupItems: [
			{
				title: "ホーム",
				url: "/t/home",
				icon: Home,
			},
		],
	},
	{
		groupLabel: "授業・教材管理",
		groupItems: [
			{
				title: "演習問題管理",
				url: "/t/exercises",
				icon: ClipboardList,
			},
		],
	},
	{
		groupLabel: "ユーザー管理",
		groupItems: [
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

const adminSidebarGroups: SidebarGroups[] = [
	{
		groupLabel: "管理者メニュー",
		groupItems: [
			{ title: "管理者ホーム", url: "/admin/home", icon: Home },
			{ title: "科目・コース管理", url: "/admin/courses", icon: LayoutList },
			{ title: "ログイン履歴", url: "/admin/login-history", icon: LogIn },
			{ title: "演習問題ログ", url: "/admin/flow-log", icon: FileType },
		],
	},
	{
		groupLabel: "授業管理（教師同等）",
		groupItems: [
			{ title: "科目", url: "/t/home", icon: Book },
			{ title: "演習問題管理", url: "/t/exercises", icon: ClipboardList },
			{ title: "ユーザー登録", url: "/t/users/add", icon: Users },
		],
	},
	{
		groupLabel: "アカウント",
		groupItems: [
			{ title: "アカウント設定", url: "/t/settings", icon: Settings },
		],
	},
	{
		groupLabel: "サポート",
		groupItems: [
			{ title: "ヘルプ", externalUrl: "/manuals/teacher_manual.pdf", icon: ShieldQuestion, newTab: true },
		],
	},
];

const TeacherLayoutInner = memo(
	({ children }: { children: ReactNode }) => {
		return (
			<div className="flex min-h-screen">
				<AppSidebar sidebarGroups={sidebarGroups} />
				<SidebarInset className="bg-gray-100 min-h-screen">
					<main className="flex-1 w-full bg-gray-100 min-h-screen pt-14">{children}</main>
				</SidebarInset>
			</div>
		);
	},
);

const TeacherLayout = memo(({ children }: { children: ReactNode }) => {
	const { data: session } = useSession();
	const isAdmin = session?.user?.role?.name === "admin";

	if (isAdmin) {
		return (
			<SidebarProvider defaultOpen={false}>
				<div className="flex flex-col min-h-screen w-full bg-gray-100">
					<AdminHeader />
					<div className="flex min-h-screen">
						<AppSidebar sidebarGroups={adminSidebarGroups} showGroupLabels />
						<SidebarInset className="bg-gray-100 min-h-screen">
							<main className="flex-1 w-full bg-gray-100 min-h-screen pt-14">{children}</main>
						</SidebarInset>
					</div>
				</div>
			</SidebarProvider>
		);
	}

	return (
		<SidebarProvider defaultOpen={true}>
			<div className="flex flex-col min-h-screen w-full bg-gray-100">
				<TeacherHeader />
				<TeacherLayoutInner>{children}</TeacherLayoutInner>
			</div>
		</SidebarProvider>
	);
});

export default TeacherLayout;
