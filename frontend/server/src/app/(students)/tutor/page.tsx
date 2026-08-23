"use client";

// AI チューター（線形代数 RAG チュータ）単体ページ。本体は TutorChat（教科書ページのサイドパネルと共通）
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { MathJaxSetup } from "@/components/shared/MathJax";
import { TutorChat } from "@/components/students/tutor/TutorChat";
import TcAccessTime from "@/components/tc_access_time";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function TutorPage() {
	const [serviceOk, setServiceOk] = useState<boolean | null>(null);
	return (
		<MathJaxSetup>
			<TcAccessTime page="tutor" />
			<div className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-4xl flex-col gap-3 p-4">
				<Card className="shrink-0">
					<CardHeader className="py-4">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<CardTitle className="flex items-center gap-2 text-lg">
									<Sparkles className="h-5 w-5" />
									AIチューター（線形代数）
								</CardTitle>
								<CardDescription>
									わからないところをそのまま聞いてください。教科書の該当箇所を引用しながら説明します。前回の続きから再開できます。
								</CardDescription>
							</div>
							{serviceOk === false ? (
								<Badge variant="destructive">停止中</Badge>
							) : null}
						</div>
					</CardHeader>
				</Card>
				<Card className="flex min-h-0 flex-1 flex-col">
					<CardContent className="flex min-h-0 flex-1 flex-col p-0">
						<TutorChat onServiceStatus={setServiceOk} />
					</CardContent>
				</Card>
			</div>
		</MathJaxSetup>
	);
}
