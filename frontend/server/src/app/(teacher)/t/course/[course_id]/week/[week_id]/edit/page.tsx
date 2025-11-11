"use client";

import { AlertCircle, BookOpen, Edit, PlayCircle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
	const router = useRouter();
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");

	return (
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

					<Tabs defaultValue="week_info" className="w-full">
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
							<WeekInfoEditor
								courseId={params.course_id as string}
								weekId={params.week_id as string}
							/>
						</TabsContent>

						<TabsContent value="week_content" className="mt-6">
							<WeekContentEditor
								courseId={params.course_id as string}
								weekId={params.week_id as string}
							/>
						</TabsContent>

						<TabsContent value="flow_content" className="mt-6">
							<FlowContentEditor
								courseId={params.course_id as string}
								weekId={params.week_id as string}
							/>
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>
		</div>
	);
}

export default EditWeekPage;
