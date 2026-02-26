import { ChevronUp, LogOut, User2 } from "lucide-react";
import Link from "next/link";
import { type FC, memo, useEffect, useState } from "react";
import { signOut } from "next-auth/react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import axios from "@/lib/axios";
import type { SidebarGroups } from "@/types/sidebarGroups";

type Props = {
	sidebarGroups: SidebarGroups[];
	showGroupLabels?: boolean;
};

type UserProfile = {
	username?: string | null;
	display_name?: string | null;
};

export const AppSidebar: FC<Props> = memo((props) => {
	const { sidebarGroups, showGroupLabels = false } = props;
	const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

	const bottomGroupLabels = new Set(["アカウント", "サポート"]);
	const contentGroups = sidebarGroups.filter(
		(group) => !bottomGroupLabels.has(group.groupLabel ?? ""),
	);
	const footerGroups = sidebarGroups.filter((group) =>
		bottomGroupLabels.has(group.groupLabel ?? ""),
	);

	useEffect(() => {
		const fetchUser = async () => {
			try {
				const res = await axios.get("/users/me");
				setUserProfile(res.data);
			} catch (error) {
				console.error("サイドバー用ユーザー情報の取得に失敗しました:", error);
			}
		};

		fetchUser();
	}, []);

	const handleLogout = async () => {
		await signOut({ callbackUrl: "/login" });
	};

	const renderGroup = (group: SidebarGroups, groupIndex: number) => (
		<SidebarGroup
			key={`${group.groupLabel ?? "group"}-${groupIndex}`}
			className={groupIndex === 0 ? "pt-0 pb-0" : "pt-0 pb-0 mt-3"}
		>
			{showGroupLabels && group.groupLabel ? (
				<div className="px-2 pb-1 text-xs text-muted-foreground">{group.groupLabel}</div>
			) : null}
			<SidebarGroupContent>
				<SidebarMenu>
					{group.groupItems.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton asChild>
								{item.externalUrl ? (
									<a
										href={item.externalUrl}
										target={item.newTab ? "_blank" : "_self"}
										rel={item.newTab ? "noopener noreferrer" : undefined}
									>
										<item.icon />
										<span>{item.title}</span>
									</a>
								) : (
									<Link href={item.url || "#"}>
										<item.icon />
										<span>{item.title}</span>
									</Link>
								)}
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);

	return (
		<Sidebar>
			<SidebarContent className="pt-4 gap-0">
				{contentGroups.map((group, groupIndex) => renderGroup(group, groupIndex))}
			</SidebarContent>
			<SidebarFooter>
				{footerGroups.map((group, groupIndex) =>
					renderGroup(group, contentGroups.length + groupIndex),
				)}
				<SidebarMenu>
					<SidebarMenuItem>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<SidebarMenuSubButton>
									<User2 /> {userProfile?.display_name || userProfile?.username || "ユーザー"}
									<ChevronUp className="ml-auto" />
								</SidebarMenuSubButton>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								side="top"
								className="w-[--radix-popper-anchor-width]"
							>
								<DropdownMenuItem onClick={handleLogout}>
									<LogOut />
									<span>ログアウト</span>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
});
