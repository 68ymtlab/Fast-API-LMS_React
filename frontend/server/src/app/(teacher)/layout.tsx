"use client";

import {
	ArrowLeft,
	Book,
	ClipboardList,
	ChevronRight,
	FileText,
	Home,
	Settings,
	ShieldQuestion,
	Users,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { memo, type ReactNode } from "react";
import { TeacherHeader } from "@/components/atoms/layout/TeacherHeader";
import { AppSidebar } from "@/components/atoms/sidebar/AppSidebar";
import { Button } from "@/components/ui/button";
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

// 教師用パンくずリスト（ヘッダー内インライン表示用）
export const TeacherBreadcrumb = memo(() => {
	const pathname = usePathname();
	const router = useRouter();

	const paths = pathname.split("/").filter(Boolean);

	// /t/home の場合は何も表示しない
	if (pathname === "/t/home") return null;

	return (
		<nav className="flex items-center text-xs text-gray-400 gap-0.5">
			{/* 戻るボタン */}
			<Button
				variant="ghost"
				size="icon"
				onClick={() => router.back()}
				className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 h-7 w-7 mr-1"
				aria-label="前のページに戻る"
			>
				<ArrowLeft className="size-3.5" />
			</Button>

			{/* ホーム */}
			<button
				onClick={() => router.push("/t/home")}
				className="flex items-center gap-1 hover:text-gray-600 transition-colors"
			>
				<Home className="size-3.5" />
				<span className="hidden sm:inline">ホーム</span>
			</button>

			{/* /t/subject/[subject_id] */}
			{paths[1] === "subject" && paths[2] && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<button
						onClick={() => router.push(`/t/subject/${paths[2]}`)}
						className="flex items-center gap-1 hover:text-gray-600 transition-colors"
					>
						<Book className="size-3.5" />
						<span className="hidden sm:inline">科目</span>
					</button>
				</>
			)}

			{/* /t/course/[course_id]/... */}
			{paths[1] === "course" && paths[2] && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<button
						onClick={() => router.push(`/t/course/${paths[2]}`)}
						className="flex items-center gap-1 hover:text-gray-600 transition-colors"
					>
						<FileText className="size-3.5" />
						<span className="hidden sm:inline">コース</span>
					</button>

					{paths.length > 3 && (
						<>
							<ChevronRight className="size-3.5 mx-0.5" />
							{paths[3] === "week" && paths[5] === "edit" && (
								<span className="flex items-center gap-1 text-gray-600 font-medium">
									<Settings className="size-3.5" />
									編集
								</span>
							)}
							{paths[3] === "week" && paths[5] !== "edit" && paths[4] && (
								<button
									onClick={() =>
										router.push(`/t/course/${paths[2]}/week/${paths[4]}`)
									}
									className="flex items-center gap-1 hover:text-gray-600 transition-colors"
								>
									<FileText className="size-3.5" />
									<span className="hidden sm:inline">週</span>
								</button>
							)}
							{paths[3] === "edit" && (
								<span className="flex items-center gap-1 text-gray-600 font-medium">
									<Settings className="size-3.5" />
									編集
								</span>
							)}
							{paths[3] === "preview" && (
								<span className="flex items-center gap-1 text-gray-600 font-medium">
									<FileText className="size-3.5" />
									プレビュー
								</span>
							)}
							{paths[3] === "enrollments" && (
								<span className="flex items-center gap-1 text-gray-600 font-medium">
									<Users className="size-3.5" />
									履修者登録
								</span>
							)}
						</>
					)}
				</>
			)}

			{/* /t/settings */}
			{paths[1] === "settings" && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<button
						onClick={() => router.push("/t/settings")}
						className="flex items-center gap-1 hover:text-gray-600 transition-colors"
					>
						<Settings className="size-3.5" />
						<span className="hidden sm:inline">設定</span>
					</button>
				</>
			)}

			{/* /t/exercises */}
			{paths[1] === "exercises" && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<span className="flex items-center gap-1 text-gray-600 font-medium">
						<ClipboardList className="size-3.5" />
						演習問題管理
					</span>
				</>
			)}

			{/* /t/users */}
			{paths[1] === "users" && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<span className="flex items-center gap-1 text-gray-600 font-medium">
						<Users className="size-3.5" />
						ユーザー登録
					</span>
				</>
			)}
		</nav>
	);
});

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
	console.log("[TeacherLayout] Layout rendered");
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
