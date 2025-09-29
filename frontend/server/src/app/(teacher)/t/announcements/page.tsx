"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertCircle,
	CheckCircle,
	Edit,
	Eye,
	Megaphone,
	Plus,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

const formSchema = z
	.object({
		title: z
			.string()
			.min(1, "タイトルを入力してください")
			.max(200, "タイトルは200文字以内で入力してください"),
		content: z
			.string()
			.min(1, "本文を入力してください")
			.max(5000, "本文は5000文字以内で入力してください"),
		start_date_time: z.string().min(1, "開始日時を入力してください"),
		end_date_time: z.string().min(1, "終了日時を入力してください"),
		user_kind_id: z.number().min(1, "対象ユーザーを選択してください"),
	})
	.refine(
		(data) => {
			const startDate = new Date(data.start_date_time);
			const endDate = new Date(data.end_date_time);
			return endDate > startDate;
		},
		{
			message: "終了日時は開始日時より後に設定してください",
			path: ["end_date_time"],
		},
	);

type FormData = z.infer<typeof formSchema>;

interface Announcement {
	id: number;
	title: string;
	content: string;
	start_date_time: string;
	end_date_time: string;
	send_date_time: string;
	sender: string;
	user_kind_id: number;
	is_active: boolean;
}

const userKindOptions = [
	{ label: "学生", value: 3 },
	{ label: "教師", value: 2 },
];

function AnnouncementManagementPage() {
	const { loginUser, isLoadingUser } = useLoginUser();
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	const [announcements, setAnnouncements] = useState<Announcement[]>([]);
	const [errorMessage, setErrorMessage] = useState("");
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [showEditDialog, setShowEditDialog] = useState(false);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [showDetailDialog, setShowDetailDialog] = useState(false);
	const [showSuccessDialog, setShowSuccessDialog] = useState(false);
	const [selectedAnnouncement, setSelectedAnnouncement] =
		useState<Announcement | null>(null);

	const form = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			title: "",
			content: "",
			start_date_time: "",
			end_date_time: "",
			user_kind_id: 3,
		},
	});

	const editForm = useForm<FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			title: "",
			content: "",
			start_date_time: "",
			end_date_time: "",
			user_kind_id: 3,
		},
	});

	useEffect(() => {
		if (!isLoadingUser && !loginUser) {
			router.push("/login");
		}
	}, [loginUser, isLoadingUser, router]);

	useEffect(() => {
		if (loginUser) {
			fetchAnnouncements();
		}
	}, [loginUser]);

	const fetchAnnouncements = async () => {
		try {
			setLoading(true);
			const response = await axios.get("/announcements_list_all");
			setAnnouncements(response.data);
		} catch (error) {
			console.error("Error fetching announcements:", error);
			setErrorMessage("お知らせの取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const formatDate = (dateString: string) => {
		if (!dateString) return "未設定";
		return new Date(dateString).toLocaleString("ja-JP", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const formatUserKind = (kindId: number) => {
		switch (kindId) {
			case 2:
				return "教師";
			case 3:
				return "学生";
			default:
				return "未設定";
		}
	};

	const getUserKindBadgeVariant = (kindId: number) => {
		switch (kindId) {
			case 2:
				return "secondary";
			case 3:
				return "default";
			default:
				return "outline";
		}
	};

	const onCreateSubmit = async (data: FormData) => {
		try {
			setLoading(true);
			setErrorMessage("");

			const announcementData = {
				title: data.title,
				content: data.content,
				start_date_time: data.start_date_time,
				end_date_time: data.end_date_time,
				sender: loginUser?.username || "",
				user_kind_id: data.user_kind_id,
				is_active: true,
			};

			await axios.post("/announcements", announcementData);

			setShowCreateDialog(false);
			setShowSuccessDialog(true);
			form.reset();
			await fetchAnnouncements();

			setTimeout(() => setShowSuccessDialog(false), 2000);
		} catch (error: any) {
			console.error("Error creating announcement:", error);
			setErrorMessage("お知らせの作成に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const onEditSubmit = async (data: FormData) => {
		if (!selectedAnnouncement) return;

		try {
			setLoading(true);
			setErrorMessage("");

			const updateData = {
				title: data.title,
				content: data.content,
				start_date_time: data.start_date_time,
				end_date_time: data.end_date_time,
				user_kind_id: data.user_kind_id,
			};

			await axios.put(`/announcements/${selectedAnnouncement.id}`, updateData);

			setShowEditDialog(false);
			setShowSuccessDialog(true);
			await fetchAnnouncements();

			setTimeout(() => setShowSuccessDialog(false), 2000);
		} catch (error: any) {
			console.error("Error updating announcement:", error);
			setErrorMessage("お知らせの更新に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const handleEdit = (announcement: Announcement) => {
		setSelectedAnnouncement(announcement);
		editForm.reset({
			title: announcement.title,
			content: announcement.content,
			start_date_time: announcement.start_date_time,
			end_date_time: announcement.end_date_time,
			user_kind_id: announcement.user_kind_id,
		});
		setShowEditDialog(true);
	};

	const handleDelete = (announcement: Announcement) => {
		setSelectedAnnouncement(announcement);
		setShowDeleteDialog(true);
	};

	const confirmDelete = async () => {
		if (!selectedAnnouncement) return;

		try {
			setLoading(true);
			await axios.delete(`/announcements/${selectedAnnouncement.id}`);
			setShowDeleteDialog(false);
			await fetchAnnouncements();
		} catch (error) {
			console.error("Error deleting announcement:", error);
			setErrorMessage("お知らせの削除に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const handleDetail = (announcement: Announcement) => {
		setSelectedAnnouncement(announcement);
		setShowDetailDialog(true);
	};

	if (isLoadingUser) {
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
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="text-2xl flex items-center gap-2">
								<Megaphone className="h-6 w-6" />
								お知らせ管理
							</CardTitle>
							<CardDescription>
								システム全体のお知らせを作成・編集・削除できます
							</CardDescription>
						</div>
						<Button
							onClick={() => setShowCreateDialog(true)}
							className="flex items-center gap-2"
						>
							<Plus className="h-4 w-4" />
							新規作成
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{errorMessage && (
						<Alert variant="destructive" className="mb-6">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{errorMessage}</AlertDescription>
						</Alert>
					)}

					{loading ? (
						<div className="flex items-center justify-center py-8">
							<div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
						</div>
					) : (
						<div className="space-y-4">
							{announcements.length === 0 ? (
								<div className="text-center py-8">
									<Megaphone className="mx-auto h-12 w-12 text-gray-400 mb-4" />
									<p className="text-gray-500">お知らせがありません</p>
								</div>
							) : (
								announcements.map((announcement) => (
									<Card
										key={announcement.id}
										className="hover:shadow-md transition-shadow"
									>
										<CardContent className="p-4">
											<div className="flex items-start justify-between">
												<div className="flex-1">
													<div className="flex items-center gap-2 mb-2">
														<h3
															className="text-lg font-semibold cursor-pointer text-blue-600 hover:text-blue-800"
															onClick={() => handleDetail(announcement)}
														>
															{announcement.title}
														</h3>
														<Badge
															variant={getUserKindBadgeVariant(
																announcement.user_kind_id,
															)}
														>
															{formatUserKind(announcement.user_kind_id)}
														</Badge>
													</div>
													<div className="text-sm text-gray-600 space-y-1">
														<div>
															表示期間:{" "}
															{formatDate(announcement.start_date_time)} ～{" "}
															{formatDate(announcement.end_date_time)}
														</div>
														<div>
															送信日時:{" "}
															{formatDate(announcement.send_date_time)}
														</div>
														<div>発信者: {announcement.sender}</div>
													</div>
												</div>
												<div className="flex items-center gap-2 ml-4">
													<Button
														variant="outline"
														size="sm"
														onClick={() => handleDetail(announcement)}
														className="flex items-center gap-1"
													>
														<Eye className="h-4 w-4" />
														詳細
													</Button>
													<Button
														variant="outline"
														size="sm"
														onClick={() => handleEdit(announcement)}
														className="flex items-center gap-1"
													>
														<Edit className="h-4 w-4" />
														編集
													</Button>
													<Button
														variant="outline"
														size="sm"
														onClick={() => handleDelete(announcement)}
														className="flex items-center gap-1 text-red-600 hover:text-red-800"
													>
														<Trash2 className="h-4 w-4" />
														削除
													</Button>
												</div>
											</div>
										</CardContent>
									</Card>
								))
							)}
						</div>
					)}
				</CardContent>
			</Card>

			{/* 新規作成ダイアログ */}
			<Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
				<DialogContent className="sm:max-w-[600px]">
					<DialogHeader>
						<DialogTitle>新規お知らせの作成</DialogTitle>
						<DialogDescription>新しいお知らせを作成します</DialogDescription>
					</DialogHeader>
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onCreateSubmit)}
							className="space-y-4"
						>
							<FormField
								control={form.control}
								name="title"
								render={({ field }) => (
									<FormItem>
										<FormLabel>タイトル</FormLabel>
										<FormControl>
											<Input
												placeholder="お知らせのタイトルを入力"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="content"
								render={({ field }) => (
									<FormItem>
										<FormLabel>本文</FormLabel>
										<FormControl>
											<Textarea
												placeholder="お知らせの内容を入力"
												rows={4}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<div className="grid grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="start_date_time"
									render={({ field }) => (
										<FormItem>
											<FormLabel>開始日時</FormLabel>
											<FormControl>
												<Input type="datetime-local" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="end_date_time"
									render={({ field }) => (
										<FormItem>
											<FormLabel>終了日時</FormLabel>
											<FormControl>
												<Input type="datetime-local" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
							<FormField
								control={form.control}
								name="user_kind_id"
								render={({ field }) => (
									<FormItem>
										<FormLabel>対象ユーザー</FormLabel>
										<Select
											onValueChange={(value) => field.onChange(parseInt(value))}
											value={field.value?.toString()}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="対象ユーザーを選択" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{userKindOptions.map((option) => (
													<SelectItem
														key={option.value}
														value={option.value.toString()}
													>
														{option.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => setShowCreateDialog(false)}
								>
									キャンセル
								</Button>
								<Button type="submit" disabled={loading}>
									{loading ? "作成中..." : "作成"}
								</Button>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>

			{/* 編集ダイアログ */}
			<Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
				<DialogContent className="sm:max-w-[600px]">
					<DialogHeader>
						<DialogTitle>お知らせの編集</DialogTitle>
						<DialogDescription>お知らせの内容を編集します</DialogDescription>
					</DialogHeader>
					<Form {...editForm}>
						<form
							onSubmit={editForm.handleSubmit(onEditSubmit)}
							className="space-y-4"
						>
							<FormField
								control={editForm.control}
								name="title"
								render={({ field }) => (
									<FormItem>
										<FormLabel>タイトル</FormLabel>
										<FormControl>
											<Input
												placeholder="お知らせのタイトルを入力"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={editForm.control}
								name="content"
								render={({ field }) => (
									<FormItem>
										<FormLabel>本文</FormLabel>
										<FormControl>
											<Textarea
												placeholder="お知らせの内容を入力"
												rows={4}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<div className="grid grid-cols-2 gap-4">
								<FormField
									control={editForm.control}
									name="start_date_time"
									render={({ field }) => (
										<FormItem>
											<FormLabel>開始日時</FormLabel>
											<FormControl>
												<Input type="datetime-local" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={editForm.control}
									name="end_date_time"
									render={({ field }) => (
										<FormItem>
											<FormLabel>終了日時</FormLabel>
											<FormControl>
												<Input type="datetime-local" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
							<FormField
								control={editForm.control}
								name="user_kind_id"
								render={({ field }) => (
									<FormItem>
										<FormLabel>対象ユーザー</FormLabel>
										<Select
											onValueChange={(value) => field.onChange(parseInt(value))}
											value={field.value?.toString()}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="対象ユーザーを選択" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{userKindOptions.map((option) => (
													<SelectItem
														key={option.value}
														value={option.value.toString()}
													>
														{option.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => setShowEditDialog(false)}
								>
									キャンセル
								</Button>
								<Button type="submit" disabled={loading}>
									{loading ? "更新中..." : "更新"}
								</Button>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>

			{/* 削除確認ダイアログ */}
			<Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>削除の確認</DialogTitle>
						<DialogDescription>
							このお知らせを削除してもよろしいですか？この操作は取り消すことができません。
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowDeleteDialog(false)}
						>
							キャンセル
						</Button>
						<Button
							variant="destructive"
							onClick={confirmDelete}
							disabled={loading}
						>
							{loading ? "削除中..." : "削除"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* 詳細表示ダイアログ */}
			<Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
				<DialogContent className="sm:max-w-[600px]">
					<DialogHeader>
						<DialogTitle>お知らせ詳細</DialogTitle>
					</DialogHeader>
					{selectedAnnouncement && (
						<div className="space-y-4">
							<div>
								<h4 className="text-sm font-medium text-gray-500">表示期間</h4>
								<p className="mt-1">
									{formatDate(selectedAnnouncement.start_date_time)} ～{" "}
									{formatDate(selectedAnnouncement.end_date_time)}
								</p>
							</div>
							<div>
								<h4 className="text-sm font-medium text-gray-500">タイトル</h4>
								<p className="mt-1 font-medium">{selectedAnnouncement.title}</p>
							</div>
							<div>
								<h4 className="text-sm font-medium text-gray-500">本文</h4>
								<div className="mt-1 p-3 bg-gray-50 rounded-md whitespace-pre-wrap">
									{selectedAnnouncement.content}
								</div>
							</div>
							<div>
								<h4 className="text-sm font-medium text-gray-500">発信者</h4>
								<p className="mt-1">{selectedAnnouncement.sender}</p>
							</div>
							<div>
								<h4 className="text-sm font-medium text-gray-500">対象</h4>
								<Badge
									variant={getUserKindBadgeVariant(
										selectedAnnouncement.user_kind_id,
									)}
									className="mt-1"
								>
									{formatUserKind(selectedAnnouncement.user_kind_id)}
								</Badge>
							</div>
						</div>
					)}
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowDetailDialog(false)}
						>
							閉じる
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* 成功ダイアログ */}
			<Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader className="text-center">
						<div className="mx-auto mb-4">
							<CheckCircle className="h-16 w-16 text-green-500" />
						</div>
						<DialogTitle className="text-xl">完了</DialogTitle>
						<DialogDescription>操作が正常に完了しました</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default AnnouncementManagementPage;
