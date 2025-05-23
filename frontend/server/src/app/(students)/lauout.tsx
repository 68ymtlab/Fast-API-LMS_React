"use client";

import { StudentHeader } from "@/components/atoms/layout/StudentHeader";
import { AppSidebar } from "@/components/atoms/sidebar/AppSidebar";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { memo, type ReactNode } from "react";

export const StudentLayoutInner = memo(
	({ children }: { children: ReactNode }) => {
		console.log("[StudentLayoutInner] Attempting to useSidebar...");
		const { open } = useSidebar();
		console.log("[StudentLayoutInner] useSidebar successful.");

		return (
			<div className="flex h-screen pt-16">
				<AppSidebar />
				<main
					className={cn(
						"flex-1 overflow-auto p-4 transition-all duration-300 ease-in-out",
						{ "lg:ml-64": open },
						{ "lg:ml-0": !open },
					)}
				>
					{children}
				</main>
			</div>
		);
	},
);

export const StudentLayout = memo(({ children }: { children: ReactNode }) => {
	console.log("[StudentLayout] Rendering. Wrapping with SidebarProvider.");
	return (
		<SidebarProvider defaultOpen={false}>
			<div className="flex flex-col min-h-screen">
				<StudentHeader />
				<StudentLayoutInner>{children}</StudentLayoutInner>
			</div>
		</SidebarProvider>
	);
});
