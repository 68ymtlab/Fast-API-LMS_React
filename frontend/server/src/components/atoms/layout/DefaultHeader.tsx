import { type FC, memo } from "react";
import { Button } from "@/components/ui/button";

export const DefaultHeader: FC = memo(() => {
	return (
		<header className="fixed z-30 flex justify-between px-4 md:px-6 w-screen h-12 bg-gray-100/95 backdrop-blur supports-[backdrop-filter]:bg-gray-100/80 items-center border-b border-gray-200/70">
			<Button variant="outline" size="sm" className="h-8">
				<a
					href="https://www.notion.so/68ymtlab-fast-api-lms/14a5fee5aec08025bf59f497d42c5ccd"
					target="_blank"
					rel="noopener noreferrer"
				>
					マニュアル
				</a>
			</Button>
			<div className="flex gap-3 items-center">
				<h1 className="font-semibold text-sm md:text-base text-gray-600">
					学習支援システム
				</h1>
			</div>
		</header>
	);
});
