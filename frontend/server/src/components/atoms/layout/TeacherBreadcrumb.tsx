"use client";

import {
	ArrowLeft,
	Book,
	ChevronRight,
	ClipboardList,
	FileText,
	Home,
	Settings,
	Users,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { memo } from "react";
import { Button } from "@/components/ui/button";

export const TeacherBreadcrumb = memo(() => {
	const pathname = usePathname();
	const router = useRouter();

	const paths = pathname.split("/").filter(Boolean);

	if (pathname === "/t/home") return null;

	return (
		<nav className="flex items-center text-xs text-gray-400 gap-0.5">
			<Button
				variant="ghost"
				size="icon"
				onClick={() => router.back()}
				className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 h-7 w-7 mr-1"
				aria-label="前のページに戻る"
			>
				<ArrowLeft className="size-3.5" />
			</Button>

			<button
				onClick={() => router.push("/t/home")}
				className="flex items-center gap-1 hover:text-gray-600 transition-colors"
			>
				<Home className="size-3.5" />
				<span className="hidden sm:inline">ホーム</span>
			</button>

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
							{paths[3] === "assignments" && (
								<span className="flex items-center gap-1 text-gray-600 font-medium">
									<ClipboardList className="size-3.5" />
									課題管理
								</span>
							)}
						</>
					)}
				</>
			)}

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

			{paths[1] === "exercises" && (
				<>
					<ChevronRight className="size-3.5 mx-0.5" />
					<span className="flex items-center gap-1 text-gray-600 font-medium">
						<ClipboardList className="size-3.5" />
						演習問題管理
					</span>
				</>
			)}

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
