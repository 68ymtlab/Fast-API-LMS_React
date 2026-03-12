"use client";

import { ArrowLeft } from "lucide-react";
import { type FC, memo } from "react";
import { cn } from "@/lib/utils";

type BreadcrumbBackButtonProps = {
	onClick: () => void;
	className?: string;
};

export const BreadcrumbBackButton: FC<BreadcrumbBackButtonProps> = memo(
	({ onClick, className }) => {
		return (
			<button
				type="button"
				onClick={onClick}
				className={cn(
					"inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-100/80 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300/70",
					className,
				)}
				aria-label="前のページに戻る"
			>
				<ArrowLeft className="size-3.5" />
				<span>戻る</span>
			</button>
		);
	},
);
