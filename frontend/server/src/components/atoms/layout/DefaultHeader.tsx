import { Button } from "@/components/ui/button";
import { type FC, memo } from "react";

export const DefaultHeader: FC = memo(() => {
  return (
    <header className="fixed flex justify-between px-8 w-screen h-16 bg-primary text-primary-foreground items-center drop-shadow-2xl border-b border-gray-300 shadow-md">
      {/* <h1 className="font-bold text-2xl"></h1> */}

      <Button variant="default">
        <a
          href="https://www.notion.so/68ymtlab-fast-api-lms/14a5fee5aec08025bf59f497d42c5ccd"
          target="_blank"
          rel="noopener noreferrer"
        >
          マニュアル
        </a>
      </Button>
      <div className="flex gap-3">
        <h1 className="font-bold text-2xl">学習支援システム</h1>
      </div>
    </header>
  );
});
