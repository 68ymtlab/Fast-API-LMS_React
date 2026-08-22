"use client";

import { AlertCircle, BookOpen, Edit, PlayCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { MathJaxSetup } from "@/components/shared/MathJax";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FlowContentEditor from "./components/FlowContentEditor";
import WeekContentEditor from "./components/WeekContentEditor";
// 個別タブコンポーネント（今後実装）
import WeekInfoEditor from "./components/WeekInfoEditor";

function EditWeekPage() {
	const params = useParams();
	const errorMessage = "";
	const [activeTab, setActiveTab] = useState("week_info");

	return (
		<MathJaxSetup>
			<div className="container mx-auto py-8 px-4 max-w-7xl">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl flex items-center gap-2">
						<Edit className="h-6 w-6" />
						詳細・コンテンツ編集
					</CardTitle>
					<CardDescription>
						週次コンテンツの詳細情報、教科書コンテンツ、演習問題を編集できます
					</CardDescription>
				</CardHeader>
				<CardContent>
					{errorMessage && (
						<Alert variant="destructive" className="mb-6">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{errorMessage}</AlertDescription>
						</Alert>
					)}

					<Tabs
						value={activeTab}
						onValueChange={setActiveTab}
						className="w-full"
					>
						<TabsList className="grid w-full grid-cols-3">
							<TabsTrigger
								value="week_info"
								className="flex items-center gap-2"
							>
								<BookOpen className="h-4 w-4" />
								詳細編集
							</TabsTrigger>
							<TabsTrigger
								value="week_content"
								className="flex items-center gap-2"
							>
								<BookOpen className="h-4 w-4" />
								教科書コンテンツ編集
							</TabsTrigger>
							<TabsTrigger
								value="flow_content"
								className="flex items-center gap-2"
							>
								<PlayCircle className="h-4 w-4" />
								演習問題編集
							</TabsTrigger>
						</TabsList>

						<TabsContent value="week_info" className="mt-6">
							{activeTab === "week_info" && (
								<WeekInfoEditor
									courseId={params.course_id as string}
									weekId={params.week_id as string}
								/>
							)}
						</TabsContent>

						<TabsContent value="week_content" className="mt-6">
							{activeTab === "week_content" && (
								<WeekContentEditor
									courseId={params.course_id as string}
									weekId={params.week_id as string}
								/>
							)}
						</TabsContent>

						<TabsContent value="flow_content" className="mt-6">
							{activeTab === "flow_content" && (
								<FlowContentEditor
									courseId={params.course_id as string}
									weekId={params.week_id as string}
								/>
							)}
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>
			</div>
		</MathJaxSetup>
	);
}

export default EditWeekPage;
