"use client";

import { AdminHeader } from "@/components/atoms/layout/AdminHeader";
import { AppSidebar } from "@/components/atoms/sidebar/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { SidebarGroups } from "@/types/sidebarGroups";
import { Book, FileType, Home, LogIn, Settings, ShieldQuestion, Users } from "lucide-react";
import { type ReactNode, memo } from "react";

const sidebarGroups: SidebarGroups[] = [
  {
    groupLabel: "メインメニュー",
    groupItems: [
      {
        title: "ホーム",
        url: "/admin/home",
        icon: Home,
      },
      {
        title: "コース",
        url: "/admin/courses",
        icon: Book,
      },
    ],
  },
  {
    groupLabel: "ログ管理",
    groupItems: [
      {
        title: "ログイン履歴",
        url: "/admin/login-history",
        icon: LogIn,
      },
      {
        title: "演習問題ログ",
        url: "/admin/flow-log",
        icon: FileType,
      },
    ],
  },
  {
    groupLabel: "ユーザー設定",
    groupItems: [
      {
        title: "プロフィール",
        url: "/admin/profile",
        icon: Users,
      },
      {
        title: "アカウント設定",
        url: "/admin/account-settings",
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

export const AdminLayoutInner = memo(({ children }: { children: ReactNode }) => {
  return (
    <div className="flex h-screen pt-16">
      <AppSidebar sidebarGroups={sidebarGroups} />
      <SidebarInset>
        <main className="flex-1 w-full">{children}</main>
      </SidebarInset>
    </div>
  );
});

export const AdminLayout = memo(({ children }: { children: ReactNode }) => {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex flex-col min-h-screen w-full">
        <AdminHeader />
        <AdminLayoutInner>{children}</AdminLayoutInner>
      </div>
    </SidebarProvider>
  );
});

export default AdminLayout;
