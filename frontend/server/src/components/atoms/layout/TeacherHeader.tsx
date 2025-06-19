"use client";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Menu } from "lucide-react";
import { type FC, memo } from "react";

export const TeacherHeader: FC = memo(() => {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="fixed flex justify-between px-8 w-screen h-16 bg-primary text-primary-foreground items-center drop-shadow-2xl border-b border-gray-300 shadow-md z-30">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => toggleSidebar()}
        className="text-primary-foreground hover:bg-primary/80"
        aria-label="サイドバーの開閉"
      >
        <Menu className="size-6" />
      </Button>
      <div className="flex gap-3">
        <h1 className="font-bold text-2xl">学習支援システム</h1>
      </div>
    </header>
  );
});
