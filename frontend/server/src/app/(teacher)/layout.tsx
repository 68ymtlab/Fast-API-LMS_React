"use client";

import {
	ArrowLeft,
	Book,
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
		groupLabel: "メインメニュー",
		groupItems: [
			{
				title: "ホーム",
				url: "/t/home",
				icon: Home,
			},
		],
	},
	{
		groupLabel: "ユーザー設定",
		groupItems: [
			{
				title: "アカウント設定",
				url: "/t/settings",
				icon: Settings,
			},
		],
	},
	{
		groupLabel: undefined,
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

// パンくずリストコンポーネント
const TeacherBreadcrumb = memo(() => {
	const pathname = usePathname();
	const router = useRouter();

	// ホームページの場合は表示しない
	if (pathname === "/t/home") return null;

	const paths = pathname.split("/").filter(Boolean);

	return (
		<div className="bg-white border-b border-gray-200 shadow-sm">
			<div className="container mx-auto px-8 py-3 max-w-7xl">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => router.back()}
							className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
						>
							<ArrowLeft className="size-4" />
							戻る
						</Button>

						{/* パンくずリスト */}
						<nav className="flex items-center text-sm text-gray-500">
							<button
								onClick={() => router.push("/t/home")}
								className="flex items-center gap-1 hover:text-gray-700 transition-colors"
							>
								<Home className="size-4" />
								ホーム
							</button>

							{paths.length > 2 && (
								<>
									<ChevronRight className="size-4 mx-2" />
									{paths[1] === "subject" && (
										<>
											<button
												onClick={() => router.push(`/t/subject/${paths[2]}`)}
												className="flex items-center gap-1 hover:text-gray-700 transition-colors text-gray-800 font-medium"
											>
												<Book className="size-4" />
												科目
											</button>

											{/* 深い階層の処理 */}
											{paths.length > 3 && (
												<>
													<ChevronRight className="size-4 mx-2" />
													{paths[3] === "course" && (
														<button
															onClick={() =>
																router.push(`/t/course/${paths[4]}`)
															}
															className="flex items-center gap-1 hover:text-gray-700 transition-colors text-gray-800 font-medium"
														>
															<FileText className="size-4" />
															コース
														</button>
													)}
												</>
											)}
										</>
									)}

									{paths[1] === "course" && (
										<>
											{/* 科目を表示 */}
											<button
												onClick={() => router.push("/t/subject/1")}
												className="flex items-center gap-1 hover:text-gray-700 transition-colors"
											>
												<Book className="size-4" />
												科目
											</button>
											<ChevronRight className="size-4 mx-2" />

											<button
												onClick={() => router.push(`/t/course/${paths[2]}`)}
												className="flex items-center gap-1 hover:text-gray-700 transition-colors text-gray-800 font-medium"
											>
												<FileText className="size-4" />
												コース
											</button>

											{/* コースの深い階層 */}
											{paths.length > 3 && (
												<>
													<ChevronRight className="size-4 mx-2" />
													{paths[3] === "week" && paths[5] === "edit" && (
														<span className="flex items-center gap-1 text-gray-800 font-medium">
															<Settings className="size-4" />
															編集
														</span>
													)}
													{paths[3] === "week" && paths[5] !== "edit" && (
														<button
															onClick={() =>
																router.push(
																	`/t/course/${paths[2]}/week/${paths[4]}`,
																)
															}
															className="flex items-center gap-1 hover:text-gray-700 transition-colors text-gray-800 font-medium"
														>
															<FileText className="size-4" />週
														</button>
													)}
													{paths[3] === "edit" && (
														<span className="flex items-center gap-1 text-gray-800 font-medium">
															<Settings className="size-4" />
															編集
														</span>
													)}
													{paths[3] === "preview" && (
														<span className="flex items-center gap-1 text-gray-800 font-medium">
															<FileText className="size-4" />
															プレビュー
														</span>
													)}
												</>
											)}
										</>
									)}

									{paths[1] === "settings" && (
										<button
											onClick={() => router.push("/t/settings")}
											className="flex items-center gap-1 hover:text-gray-700 transition-colors text-gray-800 font-medium"
										>
											<Settings className="size-4" />
											設定
										</button>
									)}
								</>
							)}
						</nav>
					</div>

					{/* 右側の情報 */}
					<div className="flex items-center gap-4 text-sm text-gray-600">
						<div className="flex items-center gap-2">
							<Users className="size-4" />
							<span>教師</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
});

export const TeacherLayoutInner = memo(
	({ children }: { children: ReactNode }) => {
		return (
			<div className="flex h-screen pt-16">
				<AppSidebar sidebarGroups={sidebarGroups} />
				<SidebarInset>
					<div className="flex flex-col w-full">
						<TeacherBreadcrumb />
						<main className="flex-1 w-full overflow-auto">{children}</main>
					</div>
				</SidebarInset>
			</div>
		);
	},
);

const TeacherLayout = memo(({ children }: { children: ReactNode }) => {
	console.log("[TeacherLayout] Layout rendered");
	return (
		<SidebarProvider defaultOpen={false}>
			<div className="flex flex-col min-h-screen w-full">
				<TeacherHeader />
				<TeacherLayoutInner>{children}</TeacherLayoutInner>
			</div>
		</SidebarProvider>
	);
});

export default TeacherLayout;
