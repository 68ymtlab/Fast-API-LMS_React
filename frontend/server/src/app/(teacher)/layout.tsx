"use client";

import { TeacherHeader } from "@/components/atoms/layout/TeacherHeader";
import { AppSidebar } from "@/components/atoms/sidebar/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { SidebarGroups } from "@/types/sidebarGroups";
import { Book, Home, Settings, ShieldQuestion, Users } from "lucide-react";
import { type ReactNode, memo } from "react";

const sidebarGroups: SidebarGroups[] = [
  {
    groupLabel: "メインメニュー",
    groupItems: [
      {
        title: "ホーム",
        url: "/t/home",
        icon: Home,
      },
      {
        title: "コース",
        url: "/t/courses",
        icon: Book,
      },
    ],
  },
  {
    groupLabel: "ユーザー設定",
    groupItems: [
      {
        title: "プロフィール",
        url: "/t/profile",
        icon: Users,
      },
      {
        title: "アカウント設定",
        url: "/t/account-settings",
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

export const TeacherLayoutInner = memo(({ children }: { children: ReactNode }) => {
  return (
    <div className="flex h-screen pt-16">
      <AppSidebar sidebarGroups={sidebarGroups} />
      <SidebarInset>
        <main className="flex-1 w-full">{children}</main>
      </SidebarInset>
    </div>
  );
});

export const TeacherLayout = memo(({ children }: { children: ReactNode }) => {
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
