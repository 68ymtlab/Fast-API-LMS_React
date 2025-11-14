"use client";

import { BookOpen, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";

const SystemOverview = () => {
	return (
		<div className="space-y-6">
			<h1 className="text-4xl font-bold text-blue-800 text-center">
				学習支援システムへようこそ!
			</h1>
			<p className="text-lg text-gray-600">
				このシステムは、あなたの学習をサポートするために設計されています。効率的な学習を実現するために、以下のような特長を備えています。
			</p>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<Card className="shadow-lg border border-gray-300 rounded-lg bg-gradient-to-br from-blue-50 to-white">
					<div className="p-6 space-y-4">
						<h3 className="text-xl font-semibold text-blue-600 flex items-center gap-2">
							<Wand2 />
							パーソナライズ学習
						</h3>
						<p className="text-sm text-gray-600">
							あなたの進捗に合わせて最適な学習計画を提案し、個別のニーズに対応します。AIを活用して、最適な学習を提案します。
						</p>
					</div>
				</Card>
				<Card className="shadow-lg border border-gray-300 rounded-lg bg-gradient-to-br from-blue-50 to-white">
					<div className="p-6 space-y-4">
						<h3 className="text-xl font-semibold text-blue-600 flex items-center gap-2">
							<BookOpen />
							教科書と演習問題
						</h3>
						<p className="text-sm text-gray-600">
							豊富な演習問題であなたの学習を手助けを行います。
						</p>
					</div>
				</Card>
			</div>
			<Card className="mt-6 p-6 text-center bg-blue-100 rounded-lg">
				<h2 className="text-xl font-bold text-blue-600">
					あなたの学習をより効率的に
				</h2>
				<p className="text-sm text-blue-800">
					このシステムで、あなたの学習を最適化し、効率的に成果を上げましょう。自分のペースで進めるため、学習を楽しみながら達成感を感じることができます。
				</p>
			</Card>
		</div>
	);
};

export default SystemOverview;
