"use client";

// AI チューター（線形代数 RAG チュータ）単体ページ。
// ChatGPT / Gemini / Claude と同じ構成: 左に会話一覧、中央にメッセージ、下に入力欄。本体は TutorChat。
import { MathJaxSetup } from "@/components/shared/MathJax";
import { TutorChat } from "@/components/students/tutor/TutorChat";
import TcAccessTime from "@/components/tc_access_time";

export default function TutorPage() {
	return (
		<MathJaxSetup>
			<TcAccessTime page="tutor" />
			<div className="flex h-[calc(100vh-4rem)] w-full flex-col">
				<TutorChat showSidebar className="flex-1" />
			</div>
		</MathJaxSetup>
	);
}
