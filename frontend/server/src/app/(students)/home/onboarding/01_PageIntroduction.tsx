"use client";

import { Card } from "@/components/ui/card";

const PageIntroduction = () => {
	return (
		<div className="space-y-6 text-center">
			<h1 className="text-4xl font-bold text-blue-800">ようこそ！</h1>
			<p className="text-lg text-gray-600">
				このシステムは、あなたの学習をサポートするために設計されています。
				<br />
				日々の進捗確認や目標設定、新しいコースへの挑戦など、ここから始めましょう。
			</p>
			<Card className="mt-6 p-6 text-center bg-blue-100 rounded-lg">
				<h2 className="text-xl font-bold text-blue-600">
					まずは、いくつかの初期設定を行いましょう。
				</h2>
				<p className="text-sm text-blue-800">
					簡単なステップで、あなたに最適な学習環境を整えることができます。
				</p>
			</Card>
		</div>
	);
};

export default PageIntroduction;
