"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function NotFound() {
	const router = useRouter();
	const handleBack = () => {
		router.back();
	};
	const handleHome = () => {
		router.push("/login");
	};

	return (
		<div className="flex flex-col items-center justify-center h-screen bg-black">
			<div className="flex items-center justify-center mb-8">
				<Globe className="w-16 h-16 text-white lotate_icon" />
				<h1 className="text-5xl font-bold text-white ml-3">404 Not Found</h1>
			</div>

			<p className="text-2xl mt-8 text-gray-200">
				指定されたページは存在しません
			</p>
			<p className="text-lg mt-6 text-gray-200">
				お探しのページは移動または削除された可能性がございます。
			</p>
			<p className="text-lg text-gray-200">
				URLを確認するか、以下からホームページに戻ってください。
			</p>
			<p className="text-lg text-gray-200">
				サイト内からのリンク切れの場合は、ご報告いただけますと幸いです。
			</p>
			<div className="mt-8 flex space-x-4">
				<Button
					variant="outline"
					className="text-white bg-black hover:bg-white"
					onClick={handleBack}
				>
					戻る
				</Button>
				<Button
					variant="outline"
					className="text-white bg-black hover:bg-white"
					onClick={handleHome}
				>
					ホームページに戻る
				</Button>
			</div>
		</div>
	);
}
