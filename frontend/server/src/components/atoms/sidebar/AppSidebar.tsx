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
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
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

	const renderMenuItems = (items: SidebarGroups["groupItems"]) =>
		items.map((item) => (
			<SidebarMenuItem key={item.title}>
				<SidebarMenuButton asChild className="h-9 px-2.5 justify-start">
					{item.externalUrl ? (
						<a
							href={item.externalUrl}
							target={item.newTab ? "_blank" : "_self"}
							rel={item.newTab ? "noopener noreferrer" : undefined}
						>
							<item.icon className="size-4 shrink-0" />
							<span className="leading-none">{item.title}</span>
						</a>
					) : (
						<Link href={item.url || "#"}>
							<item.icon className="size-4 shrink-0" />
							<span className="leading-none">{item.title}</span>
						</Link>
					)}
				</SidebarMenuButton>
			</SidebarMenuItem>
		));

	const renderGroup = (group: SidebarGroups, groupIndex: number) => (
		<SidebarGroup
			key={`${group.groupLabel ?? "group"}-${groupIndex}`}
			className={showGroupLabels ? "pt-0 pb-0" : "p-0"}
		>
			{showGroupLabels && group.groupLabel ? (
				<div className="px-2.5 pb-1.5 text-xs text-muted-foreground">
					{group.groupLabel}
				</div>
			) : null}
			<SidebarGroupContent>
				<SidebarMenu className="gap-2">
					{renderMenuItems(group.groupItems)}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);

	return (
		<Sidebar>
			<SidebarContent className={showGroupLabels ? "pt-3 gap-2" : "pt-3 gap-0"}>
				{showGroupLabels ? (
					contentGroups.map((group, groupIndex) => renderGroup(group, groupIndex))
				) : (
					<SidebarGroup className="p-0">
						<SidebarGroupContent>
							<SidebarMenu className="gap-2">
								{renderMenuItems(contentGroups.flatMap((group) => group.groupItems))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>
			<SidebarFooter className="gap-2">
				{footerGroups.map((group, groupIndex) =>
					renderGroup(group, contentGroups.length + groupIndex),
				)}
				<SidebarMenu>
					<SidebarMenuItem>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<SidebarMenuButton className="h-9 px-2.5 justify-start">
									<User2 className="size-4 shrink-0" />
									<span className="leading-none">
										{userProfile?.display_name || userProfile?.username || "ユーザー"}
									</span>
									<ChevronUp className="ml-auto" />
								</SidebarMenuButton>
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
