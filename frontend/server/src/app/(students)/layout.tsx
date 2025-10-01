"use client";

import {
	ArrowLeft,
	ChevronRight,
	Home,
	Settings,
	ShieldQuestion,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { memo, type ReactNode } from "react";
import { StudentHeader } from "@/components/atoms/layout/StudentHeader";
import { AppSidebar } from "@/components/atoms/sidebar/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { SidebarGroups } from "@/types/sidebarGroups";

const sidebarGroups: SidebarGroups[] = [
	{
		groupLabel: "メインメニュー",
		groupItems: [
			{
				title: "ホーム",
				url: "/home",
				icon: Home,
			},
			/*
      {
        title: "コース",
        url: "/courses",
        icon: Book,
      },
      */
		],
	},
	{
		groupLabel: "ユーザー設定",
		groupItems: [
			/*
      {
        title: "プロフィール",
        url: "/profile",
        icon: Users,
      },*/
			{
				title: "アカウント設定",
				url: "/settings",
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
const StudentBreadcrumb = memo(() => {
	const pathname = usePathname();
	const router = useRouter();

	if (pathname === "/home") return null;

	const paths = pathname.split("/").filter(Boolean);

	// /lesson/[lesson_id]/[page] の場合、course_idはクエリや状態管理から取得する必要があるが、
	// ここではURLの遷移順を優先し、コースIDを仮にlocalStorageやセッション等から取得する想定で記述
	// 実際の運用ではpropsやcontext等でcourse_idを渡すことを推奨
	let courseId;
	if (paths[0] === "lesson" && typeof window !== "undefined") {
		courseId = window.sessionStorage.getItem("currentCourseId");
	} else if (paths[0] === "course" && paths[1]) {
		courseId = paths[1];
		if (typeof window !== "undefined") {
			window.sessionStorage.setItem("currentCourseId", courseId);
		}
	}

	return (
		<div className="bg-white border-b border-gray-200 shadow-sm">
			<div className="container mx-auto px-8 py-3 max-w-7xl">
				<div className="flex items-center gap-4">
					<button
						type="button"
						onClick={() => router.back()}
						className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
					>
						<ArrowLeft className="size-4" />
						戻る
					</button>
					<nav className="flex items-center text-sm text-gray-500">
						<button
							onClick={() => router.push("/home")}
							className="flex items-center gap-1 hover:text-gray-700 transition-colors"
						>
							<Home className="size-4" />
							ホーム
						</button>
						{/* /course/[course_id] の場合（教科書ページは含めない） */}
						{paths[0] === "course" && paths[1] && paths.length === 2 && (
							<>
								<ChevronRight className="size-4 mx-2" />
								<span className="flex items-center gap-1 text-gray-800 font-medium">
									<Book className="size-4" />
									コース
								</span>
							</>
						)}
						{/* /lesson/[lesson_id]/[page] → 教科書ページ */}
						{paths[0] === "lesson" && paths[1] && paths[2] && courseId && (
							<>
								<ChevronRight className="size-4 mx-2" />
								<button
									onClick={() => router.push(`/course/${courseId}`)}
									className="flex items-center gap-1 hover:text-gray-700 transition-colors"
								>
									<Book className="size-4" />
									コース
								</button>
								<ChevronRight className="size-4 mx-2" />
								<span className="flex items-center gap-1 text-gray-800 font-medium">
									<FileText className="size-4" />
									教科書ページ
								</span>
							</>
						)}
						{/* /weekflows/[course_id]/[week_id] → 教科書ページからの遷移も考慮 */}
						{paths[0] === "weekflows" && paths[1] && paths[2] && !paths[3] && (
							<>
								<ChevronRight className="size-4 mx-2" />
								<button
									onClick={() => router.push(`/course/${paths[1]}`)}
									className="flex items-center gap-1 hover:text-gray-700 transition-colors"
								>
									<Book className="size-4" />
									コース
								</button>
								{/* 教科書ページへのリンク（sessionStorageからlesson_id取得） */}
								{typeof window !== "undefined" &&
									window.sessionStorage.getItem("currentLessonId") && (
										<>
											<ChevronRight className="size-4 mx-2" />
											<button
												onClick={() =>
													router.push(
														`/lesson/${window.sessionStorage.getItem("currentLessonId")}/1`,
													)
												}
												className="flex items-center gap-1 hover:text-gray-700 transition-colors"
											>
												<FileText className="size-4" />
												教科書ページ
											</button>
										</>
									)}
								<ChevronRight className="size-4 mx-2" />
								<span className="flex items-center gap-1 text-gray-800 font-medium">
									<ListChecks className="size-4" />
									演習問題一覧
								</span>
							</>
						)}
						{/* /weekflows/[course_id]/[week_id]/[flow_id]/session → 教科書ページ・演習問題一覧からの流れも考慮 */}
						{paths[0] === "weekflows" &&
							paths[1] &&
							paths[2] &&
							paths[3] &&
							paths[4] === "session" && (
								<>
									<ChevronRight className="size-4 mx-2" />
									<button
										onClick={() => router.push(`/course/${paths[1]}`)}
										className="flex items-center gap-1 hover:text-gray-700 transition-colors"
									>
										<Book className="size-4" />
										コース
									</button>
									{/* 教科書ページへのリンク（sessionStorageからlesson_id取得） */}
									{typeof window !== "undefined" &&
										window.sessionStorage.getItem("currentLessonId") && (
											<>
												<ChevronRight className="size-4 mx-2" />
												<button
													onClick={() =>
														router.push(
															`/lesson/${window.sessionStorage.getItem("currentLessonId")}/1`,
														)
													}
													className="flex items-center gap-1 hover:text-gray-700 transition-colors"
												>
													<FileText className="size-4" />
													教科書ページ
												</button>
											</>
										)}
									<ChevronRight className="size-4 mx-2" />
									<button
										onClick={() =>
											router.push(`/weekflows/${paths[1]}/${paths[2]}`)
										}
										className="flex items-center gap-1 hover:text-gray-700 transition-colors"
									>
										<ListChecks className="size-4" />
										演習問題一覧
									</button>
									<ChevronRight className="size-4 mx-2" />
									<span className="flex items-center gap-1 text-gray-800 font-medium">
										<Pencil className="size-4" />
										演習問題
									</span>
								</>
							)}
						{/* /weekflows/[course_id]/[week_id]/[flow_id]/completion/[session_id] → フィードバック */}
						{paths[0] === "weekflows" &&
							paths[1] &&
							paths[2] &&
							paths[3] &&
							paths[4] === "completion" &&
							paths[5] && (
								<>
									<ChevronRight className="size-4 mx-2" />
									<button
										onClick={() => router.push(`/course/${paths[1]}`)}
										className="flex items-center gap-1 hover:text-gray-700 transition-colors"
									>
										<Book className="size-4" />
										コース
									</button>
									{/* 教科書ページへのリンク（sessionStorageからlesson_id取得） */}
									{typeof window !== "undefined" &&
										window.sessionStorage.getItem("currentLessonId") && (
											<>
												<ChevronRight className="size-4 mx-2" />
												<button
													onClick={() =>
														router.push(
															`/lesson/${window.sessionStorage.getItem("currentLessonId")}/1`,
														)
													}
													className="flex items-center gap-1 hover:text-gray-700 transition-colors"
												>
													<FileText className="size-4" />
													教科書ページ
												</button>
											</>
										)}
									<ChevronRight className="size-4 mx-2" />
									<button
										onClick={() =>
											router.push(`/weekflows/${paths[1]}/${paths[2]}`)
										}
										className="flex items-center gap-1 hover:text-gray-700 transition-colors"
									>
										<ListChecks className="size-4" />
										演習問題一覧
									</button>
									<ChevronRight className="size-4 mx-2" />
									<button
										onClick={() =>
											router.push(
												`/weekflows/${paths[1]}/${paths[2]}/${paths[3]}/session`,
											)
										}
										className="flex items-center gap-1 hover:text-gray-700 transition-colors"
									>
										<Pencil className="size-4" />
										演習問題
									</button>
									<ChevronRight className="size-4 mx-2" />
									<span className="flex items-center gap-1 text-gray-800 font-medium">
										<MessageCircle className="size-4" />
										フィードバック
									</span>
								</>
							)}
						{/* /coursescore/[course_id] の場合 */}
						{paths[0] === "coursescore" && paths[1] && (
							<>
								<ChevronRight className="size-4 mx-2" />
								<span className="flex items-center gap-1 text-gray-800 font-medium">
									<Book className="size-4" />
									コース
								</span>
								<ChevronRight className="size-4 mx-2" />
								<span className="flex items-center gap-1 text-gray-800 font-medium">
									<BarChart2 className="size-4" />
									学習状況照会
								</span>
							</>
						)}
						{/* プロフィール・設定など */}
						{paths[0] === "profile" && (
							<>
								<ChevronRight className="size-4 mx-2" />
								<span className="flex items-center gap-1 text-gray-800 font-medium">
									<Users className="size-4" />
									プロフィール
								</span>
							</>
						)}
						{paths[0] === "settings" && (
							<>
								<ChevronRight className="size-4 mx-2" />
								<span className="flex items-center gap-1 text-gray-800 font-medium">
									<Settings className="size-4" />
									設定
								</span>
							</>
						)}
						{/* 必要に応じて他の階層も追加 */}
					</nav>
				</div>
			</div>
		</div>
	);
});

export const StudentLayoutInner = memo(
	({ children }: { children: ReactNode }) => {
		return (
			<div className="flex h-screen pt-16">
				<AppSidebar sidebarGroups={sidebarGroups} />
				<SidebarInset>
					<div className="flex flex-col w-full">
						<StudentBreadcrumb />
						<main className="flex-1 w-full">{children}</main>
					</div>
				</SidebarInset>
			</div>
		);
	},
);

export const StudentLayout = memo(({ children }: { children: ReactNode }) => {
	return (
		<SidebarProvider defaultOpen={true}>
			<div className="flex flex-col min-h-screen w-full">
				<StudentHeader />
				<StudentLayoutInner>{children}</StudentLayoutInner>
			</div>
		</SidebarProvider>
	);
});

export default StudentLayout;
