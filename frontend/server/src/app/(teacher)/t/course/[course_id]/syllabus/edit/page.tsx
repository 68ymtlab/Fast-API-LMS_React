"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertCircle,
	Award,
	BookOpen,
	Calendar,
	CheckCircle,
	Edit,
	Hash,
	Save,
	Target,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";

const formSchema = z.object({
	subject_class: z.string().min(1, "授業科目区分を入力してください"),
	subject_name: z.string().min(1, "科目名を入力してください"),
	subject_credit: z.coerce
		.number()
		.min(1, "単位数は1以上で入力してください")
		.max(10, "単位数は10以下で入力してください"),
	subject_code: z.string().min(1, "科目コードを入力してください"),
	subject_period: z.string().min(1, "開講時期を入力してください"),
	subject_keyword: z.string().min(1, "キーワードを入力してください"),
	subject_goals: z.string().min(1, "学習・教育目標を入力してください"),
});

type FormData = z.infer<typeof formSchema>;

interface SyllabusInfo extends FormData {}

const subjectClasses = ["必修", "選択必修", "選択", "教養", "専門基礎", "専門"];
const creditOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const periodOptions = ["前期", "後期", "通年", "集中", "1Q", "2Q", "3Q", "4Q"];

function EditSyllabusPage() {
	const { loginUser, isLoadingUser } = useLoginUser();
	const router = useRouter();
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [fetchLoading, setFetchLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [showSuccessDialog, setShowSuccessDialog] = useState(false);
	const [syllabusInfo, setSyllabusInfo] = useState<SyllabusInfo | null>(null);

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			subject_class: "",
			subject_name: "",
			subject_credit: 2,
			subject_code: "",
			subject_period: "",
			subject_keyword: "",
			subject_goals: "",
		},
	});

	useEffect(() => {
		if (!isLoadingUser && !loginUser) {
			router.push("/login");
		}
	}, [loginUser, isLoadingUser, router]);

	useEffect(() => {
		if (params.course_id) {
			fetchSyllabusInfo();
		}
	}, [params.course_id]);

	const fetchSyllabusInfo = async () => {
		try {
			setFetchLoading(true);
			const response = await axios.get(
				`/get_syllabus_info/${params.course_id}`,
			);
			const data = response.data;
			setSyllabusInfo(data);

			// フォームに現在のデータを設定
			form.reset({
				subject_class: data.subject_class || "",
				subject_name: data.subject_name || "",
				subject_credit: data.subject_credit || 2,
				subject_code: data.subject_code || "",
				subject_period: data.subject_period || "",
				subject_keyword: data.subject_keyword || "",
				subject_goals: data.subject_goals || "",
			});
		} catch (error) {
			console.error("Error fetching syllabus info:", error);
			setErrorMessage("シラバス情報の取得に失敗しました");
		} finally {
			setFetchLoading(false);
		}
	};

	const onSubmit = async (data: FormData) => {
		setLoading(true);
		setErrorMessage("");

		try {
			const response = await axios.post(
				`/update_syllabus_info/${params.course_id}`,
				data,
			);

			if (response.data.success) {
				setShowSuccessDialog(true);
				await fetchSyllabusInfo(); // データを再取得
				setTimeout(() => setShowSuccessDialog(false), 3000);
			} else {
				setErrorMessage(
					response.data.error_msg || "シラバス情報の更新に失敗しました",
				);
			}
		} catch (error: any) {
			console.error("Error updating syllabus info:", error);
			setErrorMessage("シラバス情報の更新に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	if (isLoadingUser || fetchLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
			</div>
		);
	}

	return (
		<div className="container mx-auto py-8 px-4 max-w-6xl">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl flex items-center gap-2">
						<Edit className="h-6 w-6" />
						シラバス情報編集
					</CardTitle>
					<CardDescription>
						授業科目の詳細情報と学習目標を編集できます
					</CardDescription>
				</CardHeader>
				<CardContent>
					{errorMessage && (
						<Alert variant="destructive" className="mb-6">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{errorMessage}</AlertDescription>
						</Alert>
					)}

					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
							{/* 基本情報セクション */}
							<Card>
								<CardHeader>
									<CardTitle className="text-lg flex items-center gap-2">
										<Award className="h-5 w-5" />
										授業科目基本情報
									</CardTitle>
								</CardHeader>
								<CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<FormField
										control={form.control}
										name="subject_class"
										render={({ field }) => (
											<FormItem>
												<FormLabel>授業科目区分</FormLabel>
												<Select
													onValueChange={field.onChange}
													value={field.value}
													disabled={loading}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue placeholder="授業科目区分を選択" />
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														{subjectClasses.map((subjectClass) => (
															<SelectItem
																key={subjectClass}
																value={subjectClass}
															>
																{subjectClass}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="subject_name"
										render={({ field }) => (
											<FormItem>
												<FormLabel>科目名</FormLabel>
												<FormControl>
													<Input
														placeholder="科目名を入力"
														{...field}
														disabled={loading}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="subject_credit"
										render={({ field }) => (
											<FormItem>
												<FormLabel>単位数</FormLabel>
												<Select
													onValueChange={(value) =>
														field.onChange(parseInt(value))
													}
													value={field.value?.toString()}
													disabled={loading}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue placeholder="単位数を選択" />
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														{creditOptions.map((credit) => (
															<SelectItem
																key={credit}
																value={credit.toString()}
															>
																{credit}単位
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="subject_code"
										render={({ field }) => (
											<FormItem>
												<FormLabel>科目コード</FormLabel>
												<FormControl>
													<Input
														placeholder="科目コードを入力"
														{...field}
														disabled={loading}
														className="font-mono"
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<div className="md:col-span-2">
										<FormField
											control={form.control}
											name="subject_period"
											render={({ field }) => (
												<FormItem>
													<FormLabel className="flex items-center gap-2">
														<Calendar className="h-4 w-4" />
														開講時期
													</FormLabel>
													<Select
														onValueChange={field.onChange}
														value={field.value}
														disabled={loading}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue placeholder="開講時期を選択" />
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															{periodOptions.map((period) => (
																<SelectItem key={period} value={period}>
																	{period}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
													<FormMessage />
												</FormItem>
											)}
										/>
									</div>
								</CardContent>
							</Card>

							{/* 学習・教育目標セクション */}
							<Card>
								<CardHeader>
									<CardTitle className="text-lg flex items-center gap-2">
										<Target className="h-5 w-5" />
										授業科目の学習・教育目標
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-6">
									<FormField
										control={form.control}
										name="subject_keyword"
										render={({ field }) => (
											<FormItem>
												<FormLabel className="flex items-center gap-2">
													<Hash className="h-4 w-4" />
													キーワード
												</FormLabel>
												<FormControl>
													<Input
														placeholder="キーワードをカンマ区切りで入力（例：プログラミング, アルゴリズム, データ構造）"
														{...field}
														disabled={loading}
													/>
												</FormControl>
												<FormMessage />
												<p className="text-sm text-gray-500">
													複数のキーワードはカンマ（,）で区切って入力してください
												</p>
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="subject_goals"
										render={({ field }) => (
											<FormItem>
												<FormLabel className="flex items-center gap-2">
													<Target className="h-4 w-4" />
													学習・教育目標
												</FormLabel>
												<FormControl>
													<Textarea
														placeholder="この授業で達成すべき学習・教育目標を詳しく記述してください"
														rows={8}
														{...field}
														disabled={loading}
														className="resize-none"
													/>
												</FormControl>
												<FormMessage />
												<p className="text-sm text-gray-500">
													学生がこの授業を通じて習得すべき知識、技能、態度について具体的に記述してください
												</p>
											</FormItem>
										)}
									/>
								</CardContent>
							</Card>

							{/* 保存ボタン */}
							<div className="flex justify-center pt-6">
								<Button
									type="submit"
									disabled={loading}
									size="lg"
									className="px-12"
								>
									{loading ? (
										<>
											<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
											更新中...
										</>
									) : (
										<>
											<Save className="h-4 w-4 mr-2" />
											シラバス情報を更新
										</>
									)}
								</Button>
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>

			{/* 成功ダイアログ */}
			<Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader className="text-center">
						<div className="mx-auto mb-4">
							<CheckCircle className="h-16 w-16 text-green-500" />
						</div>
						<DialogTitle className="text-xl">更新完了</DialogTitle>
						<DialogDescription>
							シラバス情報が正常に更新されました
						</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default EditSyllabusPage;
