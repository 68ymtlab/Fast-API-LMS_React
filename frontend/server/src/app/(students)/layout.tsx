"use client";

import { StudentHeader } from "@/components/atoms/layout/StudentHeader";
import { AppSidebar } from "@/components/atoms/sidebar/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { SidebarGroups } from "@/types/sidebarGroups";
import { Book, Home, Settings, ShieldQuestion, Users } from "lucide-react";
import { type ReactNode, memo } from "react";

const sidebarGroups: SidebarGroups[] = [
  {
    groupLabel: "メインメニュー",
    groupItems: [
      {
        title: "ホーム",
        url: "/home",
        icon: Home,
      },
      {
        title: "コース",
        url: "/courses",
        icon: Book,
      },
    ],
  },
  {
    groupLabel: "ユーザー設定",
    groupItems: [
      {
        title: "プロフィール",
        url: "/profile",
        icon: Users,
      },
      {
        title: "アカウント設定",
        url: "/account-settings",
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

export const StudentLayoutInner = memo(({ children }: { children: ReactNode }) => {
  return (
    <div className="flex h-screen pt-16">
      <AppSidebar sidebarGroups={sidebarGroups} />
      <main className="flex-1 overflow-auto p-4 transition-all duration-300 ease-in-out">{children}</main>
    </div>
  );
});

export const StudentLayout = memo(({ children }: { children: ReactNode }) => {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex flex-col min-h-screen">
        <StudentHeader />
        <StudentLayoutInner>{children}</StudentLayoutInner>
      </div>
    </SidebarProvider>
  );
});

export default StudentLayout;
