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
	SidebarGroupLabel,
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
};

type UserProfile = {
	username?: string | null;
	display_name?: string | null;
};

export const AppSidebar: FC<Props> = memo((props) => {
	const { sidebarGroups } = props;
	const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

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

	return (
		<Sidebar>
			<SidebarHeader className="flex items-center justify-center">
				<h1 className="text-xl font-bold mt-2">学習支援システム</h1>
			</SidebarHeader>
			<SidebarContent>
				{sidebarGroups.map((group, groupIndex) => (
					<SidebarGroup key={group.groupLabel || `group-${groupIndex}`}>
						{group.groupLabel && (
							<SidebarGroupLabel>{group.groupLabel}</SidebarGroupLabel>
						)}
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
				))}
			</SidebarContent>
			<SidebarFooter>
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
