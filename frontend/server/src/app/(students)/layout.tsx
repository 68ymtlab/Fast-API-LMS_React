"use client";

import {
	BarChart2,
	Book,
	ChevronRight,
	FileText,
	Home,
	ListChecks,
	MessageCircle,
	Pencil,
	Settings,
	ShieldQuestion,
	Users,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { memo, type ReactNode, useEffect, useState } from "react";
import { BreadcrumbBackButton } from "@/components/atoms/layout/BreadcrumbBackButton";
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
		],
	},
	{
		groupLabel: "ユーザー設定",
		groupItems: [
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
				icon: ShieldQuestion,
				newTab: true,
			},
		],
	},
];

// パンくずリストのロジック（ヘッダー内に表示するためexport）
export const useBreadcrumb = () => {
	const pathname = usePathname();
	const router = useRouter();
	const [courseId, setCourseId] = useState<string | null>(null);
	const [currentLessonId, setCurrentLessonId] = useState<string | null>(null);
	const paths = pathname.split("/").filter(Boolean);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const currentPaths = pathname.split("/").filter(Boolean);

		if (currentPaths[0] === "course" && currentPaths[1]) {
			window.sessionStorage.setItem("currentCourseId", currentPaths[1]);
		}
		if (currentPaths[0] === "lesson" && currentPaths[1] && currentPaths[2]) {
			window.sessionStorage.setItem("currentCourseId", currentPaths[1]);
			window.sessionStorage.setItem("currentLessonId", currentPaths[2]);
		}

		setCourseId(window.sessionStorage.getItem("currentCourseId"));
		setCurrentLessonId(window.sessionStorage.getItem("currentLessonId"));
	}, [pathname]);

	if (pathname === "/home") return null;

	return { paths, courseId, currentLessonId, router };
};

// パンくずリストコンポーネント（ヘッダー内埋め込み用・コンパクト版）
export const StudentBreadcrumbInline = memo(() => {
	const pathname = usePathname();
	const router = useRouter();
	const [courseId, setCourseId] = useState<string | null>(null);
	const [currentLessonId, setCurrentLessonId] = useState<string | null>(null);
	const paths = pathname.split("/").filter(Boolean);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const currentPaths = pathname.split("/").filter(Boolean);

		if (currentPaths[0] === "course" && currentPaths[1]) {
			window.sessionStorage.setItem("currentCourseId", currentPaths[1]);
		}
		if (currentPaths[0] === "lesson" && currentPaths[1] && currentPaths[2]) {
			window.sessionStorage.setItem("currentCourseId", currentPaths[1]);
			window.sessionStorage.setItem("currentLessonId", currentPaths[2]);
		}

		setCourseId(window.sessionStorage.getItem("currentCourseId"));
		setCurrentLessonId(window.sessionStorage.getItem("currentLessonId"));
	}, [pathname]);

	if (pathname === "/home") return null;

	return (
		<nav className="flex items-center text-xs text-gray-400 gap-1">
			{/* 戻るボタン */}
			<BreadcrumbBackButton onClick={() => router.back()} className="mr-1" />

			{/* ホーム */}
			<button
				onClick={() => router.push("/home")}
				className="flex items-center gap-1 hover:text-gray-600 transition-colors"
			>
				<Home className="size-3.5" />
				<span className="hidden sm:inline">ホーム</span>
			</button>

			{/* /course/[course_id] */}
			{paths[0] === "course" && paths[1] && paths.length === 2 && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<span className="flex items-center gap-1 text-gray-600 font-medium">
						<Book className="size-3.5" />
						コース
					</span>
				</>
			)}

			{/* /course/[course_id]/assignments */}
			{paths[0] === "course" && paths[1] && paths[2] === "assignments" && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<button
						onClick={() => router.push(`/course/${paths[1]}`)}
						className="flex items-center gap-1 hover:text-gray-600 transition-colors"
					>
						<Book className="size-3.5" />コース
					</button>
					<ChevronRight className="size-3.5 mx-0.5" />
					<span className="flex items-center gap-1 text-gray-600 font-medium">
						<FileText className="size-3.5" />課題提出
					</span>
				</>
			)}

			{/* /lesson/[lesson_id]/[page] */}
			{paths[0] === "lesson" && paths[1] && paths[2] && courseId && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<button
						onClick={() => router.push(`/course/${courseId}`)}
						className="flex items-center gap-1 hover:text-gray-600 transition-colors"
					>
						<Book className="size-3.5" />コース
					</button>
					<ChevronRight className="size-3.5 mx-0.5" />
					<span className="flex items-center gap-1 text-gray-600 font-medium">
						<FileText className="size-3.5" />教科書ページ
					</span>
				</>
			)}

			{/* /weekflows/[course_id]/[week_id] */}
			{paths[0] === "weekflows" && paths[1] && paths[2] && !paths[3] && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<button
						onClick={() => router.push(`/course/${paths[1]}`)}
						className="flex items-center gap-1 hover:text-gray-600 transition-colors"
					>
						<Book className="size-3.5" />コース
					</button>
					{courseId && currentLessonId && (
						<>
							<ChevronRight className="size-3.5 mx-0.5" />
							<button
								onClick={() => router.push(`/lesson/${courseId}/${currentLessonId}/1`)}
								className="flex items-center gap-1 hover:text-gray-600 transition-colors"
							>
								<FileText className="size-3.5" />教科書ページ
							</button>
						</>
					)}
					<ChevronRight className="size-3.5 mx-0.5" />
					<span className="flex items-center gap-1 text-gray-600 font-medium">
						<ListChecks className="size-3.5" />演習問題一覧
					</span>
				</>
			)}

			{/* /weekflows/[course_id]/[week_id]/[flow_id]/session */}
			{paths[0] === "weekflows" && paths[1] && paths[2] && paths[3] && paths[4] === "session" && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<button
						onClick={() => router.push(`/course/${paths[1]}`)}
						className="flex items-center gap-1 hover:text-gray-600 transition-colors"
					>
						<Book className="size-3.5" />コース
					</button>
					{courseId && currentLessonId && (
						<>
							<ChevronRight className="size-3.5 mx-0.5" />
							<button
								onClick={() => router.push(`/lesson/${courseId}/${currentLessonId}/1`)}
								className="flex items-center gap-1 hover:text-gray-600 transition-colors"
							>
								<FileText className="size-3.5" />教科書ページ
							</button>
						</>
					)}
					<ChevronRight className="size-3.5 mx-0.5" />
					<button
						onClick={() => router.push(`/weekflows/${paths[1]}/${paths[2]}`)}
						className="flex items-center gap-1 hover:text-gray-600 transition-colors"
					>
						<ListChecks className="size-3.5" />演習問題一覧
					</button>
					<ChevronRight className="size-3.5 mx-0.5" />
					<span className="flex items-center gap-1 text-gray-600 font-medium">
						<Pencil className="size-3.5" />演習問題
					</span>
				</>
			)}

			{/* /weekflows/[course_id]/[week_id]/[flow_id]/completion/[session_id] */}
			{paths[0] === "weekflows" && paths[1] && paths[2] && paths[3] && paths[4] === "completion" && paths[5] && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<button
						onClick={() => router.push(`/course/${paths[1]}`)}
						className="flex items-center gap-1 hover:text-gray-600 transition-colors"
					>
						<Book className="size-3.5" />コース
					</button>
					{courseId && currentLessonId && (
						<>
							<ChevronRight className="size-3.5 mx-0.5" />
							<button
								onClick={() => router.push(`/lesson/${courseId}/${currentLessonId}/1`)}
								className="flex items-center gap-1 hover:text-gray-600 transition-colors"
							>
								<FileText className="size-3.5" />教科書ページ
							</button>
						</>
					)}
					<ChevronRight className="size-3.5 mx-0.5" />
					<button
						onClick={() => router.push(`/weekflows/${paths[1]}/${paths[2]}`)}
						className="flex items-center gap-1 hover:text-gray-600 transition-colors"
					>
						<ListChecks className="size-3.5" />演習問題一覧
					</button>
					<ChevronRight className="size-3.5 mx-0.5" />
					<button
						onClick={() => router.push(`/weekflows/${paths[1]}/${paths[2]}/${paths[3]}/session`)}
						className="flex items-center gap-1 hover:text-gray-600 transition-colors"
					>
						<Pencil className="size-3.5" />演習問題
					</button>
					<ChevronRight className="size-3.5 mx-0.5" />
					<span className="flex items-center gap-1 text-gray-600 font-medium">
						<MessageCircle className="size-3.5" />フィードバック
					</span>
				</>
			)}

			{/* /coursescore/[course_id] */}
			{paths[0] === "coursescore" && paths[1] && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<button
						onClick={() => router.push(`/course/${paths[1]}`)}
						className="flex items-center gap-1 hover:text-gray-600 transition-colors"
					>
						<Book className="size-3.5" />コース
					</button>
					<ChevronRight className="size-3.5 mx-0.5" />
					<span className="flex items-center gap-1 text-gray-600 font-medium">
						<BarChart2 className="size-3.5" />学習状況照会
					</span>
				</>
			)}

			{/* /profile */}
			{paths[0] === "profile" && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<span className="flex items-center gap-1 text-gray-600 font-medium">
						<Users className="size-3.5" />プロフィール
					</span>
				</>
			)}

			{/* /settings */}
			{paths[0] === "settings" && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<span className="flex items-center gap-1 text-gray-600 font-medium">
						<Settings className="size-3.5" />設定
					</span>
				</>
			)}
		</nav>
	);
});

const StudentLayoutInner = memo(
	({ children }: { children: ReactNode }) => {
		return (
			<div className="flex h-screen">
				<AppSidebar sidebarGroups={sidebarGroups} />
				<SidebarInset className="bg-gray-100">
					<main className="flex-1 w-full">{children}</main>
				</SidebarInset>
			</div>
		);
	},
);

const StudentLayout = memo(({ children }: { children: ReactNode }) => {
	return (
		<SidebarProvider defaultOpen={true}>
			<div className="flex flex-col min-h-screen w-full bg-gray-100">
				<StudentHeader />
				<StudentLayoutInner>{children}</StudentLayoutInner>
			</div>
		</SidebarProvider>
	);
});

export default StudentLayout;
