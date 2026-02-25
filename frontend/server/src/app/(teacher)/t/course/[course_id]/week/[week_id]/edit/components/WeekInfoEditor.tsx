"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertCircle,
	BookOpen,
	CheckCircle,
	Hash,
	Image,
	Info,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import axios from "@/lib/axios";

const formSchema = z.object({
	weekName: z
		.string()
		.min(1, "コンテンツ名を入力してください")
		.max(100, "コンテンツ名は100文字以内で入力してください"),
	order: z.coerce.number().min(1, "並び順を入力してください"),
	lessonTitle: z
		.string()
		.min(1, "レッスン名を入力してください")
		.max(100, "レッスン名は100文字以内で入力してください"),
	lessonNumber: z
		.coerce.number()
		.int()
		.min(1, "回数は1以上の整数で入力してください"),
});

type FormData = z.infer<typeof formSchema>;

interface WeekInfo {
	lesson_id: number;
	title: string;
	item_content_type: string;
	display_order: number;
	is_active: boolean;
	description?: string | null;
	item_resource_id?: number | null;
	item_url?: string | null;
	item_data_details?: Record<string, unknown> | null;
}

interface ParentLesson {
	id: number;
	title: string;
	lesson_number: number;
	display_order: number;
	course_id: number;
	description?: string | null;
	is_active: boolean;
}

interface WeekInfoEditorProps {
	courseId: string;
	weekId: string;
}

function WeekInfoEditor({ courseId, weekId }: WeekInfoEditorProps) {
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	const [initialLoading, setInitialLoading] = useState(true);
	const [success, setSuccess] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [showSuccessDialog, setShowSuccessDialog] = useState(false);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [weekInfo, setWeekInfo] = useState<WeekInfo | null>(null);
	const [parentLesson, setParentLesson] = useState<ParentLesson | null>(null);

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			weekName: "",
			order: 1,
			lessonTitle: "",
			lessonNumber: 1,
		},
	});

	useEffect(() => {
		fetchWeekInfo();
	}, [weekId]);

	useEffect(() => {
		if (parentLesson) {
			form.setValue("lessonTitle", parentLesson.title ?? "");
			form.setValue("lessonNumber", parentLesson.lesson_number ?? 1);
		}
	}, [parentLesson, form]);

	const fetchWeekInfo = async () => {
		try {
			setInitialLoading(true);
			const response = await axios.get(`/lesson-item/${weekId}`);
			const data = response.data;
			setWeekInfo(data);

			// 親レッスンのlesson_numberを取得する
			if (data.lesson_id && courseId) {
				try {
					const lessonsRes = await axios.get(`/courses/${courseId}/lessons`);
					const lessons: ParentLesson[] = lessonsRes.data;
					const parent = lessons.find((l) => l.id === data.lesson_id) ?? null;
					setParentLesson(parent);
				} catch (e) {
					console.error("親レッスン情報の取得に失敗しました:", e);
					setParentLesson(null);
				}
			}

			form.reset({
				weekName: data.title ?? "",
				order: data.display_order ?? 1,
			});
		} catch (error) {
			console.error("Error fetching week info:", error);
			setErrorMessage("週次情報の取得に失敗しました");
		} finally {
			setInitialLoading(false);
		}
	};

	const onSubmit = async (data: FormData) => {
		setLoading(true);
		setErrorMessage("");
		setSuccess(false);

		try {
			if (!weekInfo) return;

			if (!parentLesson) {
				setErrorMessage(
					"親レッスン情報の取得に失敗したため、更新できません。画面を再読み込みしてから再度お試しください。",
				);
				return;
			}

			const lessonUpdateData = {
				course_id: parentLesson.course_id ?? Number(courseId),
				title: data.lessonTitle,
				lesson_number: data.lessonNumber,
				description: parentLesson.description ?? null,
				display_order: parentLesson.display_order,
				is_active: parentLesson.is_active ?? true,
			};

			const updateData = {
				lesson_id: weekInfo.lesson_id,
				title: data.weekName,
				item_content_type: weekInfo.item_content_type,
				display_order: data.order,
				is_active: weekInfo.is_active,
				description: weekInfo.description ?? null,
				item_resource_id: weekInfo.item_resource_id ?? null,
				item_url: weekInfo.item_url ?? null,
				item_data_details: weekInfo.item_data_details ?? null,
			};

			await axios.put(`/lessons/${parentLesson.id}`, lessonUpdateData);
			await axios.put(`/lesson-item/${weekId}`, updateData);
			setSuccess(true);
			setShowSuccessDialog(true);
			await fetchWeekInfo();
			setTimeout(() => {
				setShowSuccessDialog(false);
			}, 2000);
		} catch (error: any) {
			console.error("Error updating week:", error);
			setErrorMessage("週次情報の更新に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const handleDelete = async () => {
		try {
			setLoading(true);
			if (!weekInfo) return;
			await axios.delete(`/lesson-item/${weekId}`);
			router.push(`/t/course/${courseId}`);
		} catch (error) {
			console.error("Error deleting week:", error);
			setErrorMessage("週次コンテンツの削除に失敗しました");
		} finally {
			setLoading(false);
		}
		setShowDeleteDialog(false);
	};

	if (initialLoading) {
		return (
			<div className="flex items-center justify-center py-8">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
			</div>
		);
	}

	if (!weekInfo) {
		return (
			<Card>
				<CardContent className="text-center py-8">
					<p className="text-red-500">週次情報が見つかりません</p>
				</CardContent>
			</Card>
		);
	}

	const canUpdate = true;

	return (
		<div className="space-y-6">
			<Tabs defaultValue="info" className="w-full">
				<TabsList className="grid w-full grid-cols-4">
					<TabsTrigger value="info" className="flex items-center gap-2">
						<Info className="h-4 w-4" />
						コース情報
					</TabsTrigger>
					<TabsTrigger value="image" className="flex items-center gap-2">
						<Image className="h-4 w-4" />
						画像
					</TabsTrigger>
					<TabsTrigger value="keyword" className="flex items-center gap-2">
						<Hash className="h-4 w-4" />
						キーワード
					</TabsTrigger>
					<TabsTrigger value="material" className="flex items-center gap-2">
						<BookOpen className="h-4 w-4" />
						関連教材
					</TabsTrigger>
				</TabsList>

				<TabsContent value="info" className="mt-6">
					<Card>
						<CardHeader>
							<CardTitle className="text-xl">レッスン情報の編集</CardTitle>
						</CardHeader>
						<CardContent>
							{errorMessage && (
								<Alert variant="destructive" className="mb-6">
									<AlertCircle className="h-4 w-4" />
									<AlertDescription>{errorMessage}</AlertDescription>
								</Alert>
							)}

							{!canUpdate && (
								<Alert className="mb-6">
									<AlertCircle className="h-4 w-4" />
									<AlertDescription>
										この週次コンテンツは編集権限がないため、表示のみとなります
									</AlertDescription>
								</Alert>
							)}

							<Form {...form}>
								<form
									onSubmit={form.handleSubmit(onSubmit)}
									className="space-y-6"
								>
									{/* レッスン名 */}
									<div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
										<div className="md:col-span-1">
											<div className="bg-gray-100 p-4 rounded-lg h-full flex items-center justify-center">
												<h3 className="font-semibold text-center">
													レッスン名
												</h3>
											</div>
										</div>
										<div className="md:col-span-3">
											<FormField
												control={form.control}
												name="lessonTitle"
												render={({ field }) => (
													<FormItem>
														<FormControl>
															<Input
																placeholder="例）数列の基礎"
																{...field}
																disabled={loading || !canUpdate || !parentLesson}
																className="text-base"
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										</div>
									</div>

									{/* コンテンツ名 */}
									<div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
										<div className="md:col-span-1">
											<div className="bg-gray-100 p-4 rounded-lg h-full flex items-center justify-center">
												<h3 className="font-semibold text-center">
													コンテンツ名
												</h3>
											</div>
										</div>
										<div className="md:col-span-3">
											<FormField
												control={form.control}
												name="weekName"
												render={({ field }) => (
													<FormItem>
														<FormControl>
															<Input
																placeholder="例）数列の和"
																{...field}
																disabled={loading || !canUpdate}
																className="text-base"
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										</div>
									</div>

									{/* 回数（レッスンの lesson_number を編集） */}
									<div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
										<div className="md:col-span-1">
											<div className="bg-gray-100 p-4 rounded-lg h-full flex items-center justify-center">
												<h3 className="font-semibold text-center">回数</h3>
											</div>
										</div>
										<div className="md:col-span-3">
											<FormField
												control={form.control}
												name="lessonNumber"
												render={({ field }) => (
													<FormItem>
														<FormControl>
															<Input
																type="number"
																min="1"
																{...field}
																disabled={loading || !canUpdate || !parentLesson}
																className="w-24"
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											{parentLesson && (
												<p className="text-xs text-gray-400 mt-1">
													現在の表示例: 第{parentLesson.lesson_number}回
												</p>
											)}
										</div>
									</div>

									{/* 並び順 */}
									<div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
										<div className="md:col-span-1">
											<div className="bg-gray-100 p-4 rounded-lg h-full flex items-center justify-center">
												<h3 className="font-semibold text-center">並び順</h3>
											</div>
										</div>
										<div className="md:col-span-3">
											<FormField
												control={form.control}
												name="order"
												render={({ field }) => (
													<FormItem>
														<FormControl>
															<Input
																type="number"
																min="1"
																placeholder="1"
																{...field}
																disabled={loading || !canUpdate}
																className="w-24"
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										</div>
									</div>

									<div className="flex justify-center gap-4 pt-6">
										{canUpdate && (
											<>
												<Button
													type="submit"
													disabled={loading}
													className="px-8"
												>
													{loading ? "更新中..." : "更新"}
												</Button>
												<Button
													type="button"
													variant="destructive"
													onClick={() => setShowDeleteDialog(true)}
													disabled={loading}
													className="px-8"
												>
													<Trash2 className="h-4 w-4 mr-2" />
													削除
												</Button>
											</>
										)}
									</div>
								</form>
							</Form>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="image" className="mt-6">
					<Card>
						<CardHeader>
							<CardTitle className="text-xl">画像管理</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-gray-500 text-center py-8">
								この画面の画像管理は新APIへ移行中です。教科書本文の画像参照はそのまま利用できます。
							</p>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="keyword" className="mt-6">
					<Card>
						<CardHeader>
							<CardTitle className="text-xl">キーワード管理</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-gray-500 text-center py-8">
								キーワード管理機能は実装予定です
							</p>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="material" className="mt-6">
					<Card>
						<CardHeader>
							<CardTitle className="text-xl">関連教材管理</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-gray-500 text-center py-8">
								関連教材管理機能は実装予定です
							</p>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			{/* 成功ダイアログ */}
			<Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader className="text-center">
						<div className="mx-auto mb-4">
							<CheckCircle className="h-16 w-16 text-green-500" />
						</div>
						<DialogTitle className="text-xl">更新完了</DialogTitle>
						<DialogDescription>
							週次情報が正常に更新されました
						</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>

			{/* 削除確認ダイアログ */}
			<Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="text-xl text-red-600">
							週次コンテンツの削除
						</DialogTitle>
						<DialogDescription>
							この週次コンテンツを削除しますか？この操作は取り消すことができません。
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setShowDeleteDialog(false)}
						>
							キャンセル
						</Button>
						<Button type="button" variant="destructive" onClick={handleDelete}>
							削除する
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default WeekInfoEditor;
