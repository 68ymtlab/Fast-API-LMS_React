import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
} from "@/components/ui/sidebar";
import { Home } from "lucide-react";

const items = [
	{
		title: "Home",
		url: "/home",
		icon: Home,
	},
];

export const AppSidebar = () => {
	return (
		<Sidebar>
			<SidebarHeader />
			<SidebarContent>
				<SidebarGroup />
				<SidebarGroup />
			</SidebarContent>
			<SidebarFooter />
		</Sidebar>
	);
};
