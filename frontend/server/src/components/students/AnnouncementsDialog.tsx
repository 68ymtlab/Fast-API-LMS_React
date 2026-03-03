import { AlertCircle, Megaphone } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import axios from "@/lib/axios";

interface Announcement {
	id: number;
	title: string;
	content: string;
	start_date_time: string;
	end_date_time: string;
	send_date_time: string;
	sender: string;
	is_active: boolean;
	is_read: boolean;
}

interface AnnouncementsDialogProps {
	open: boolean;
	onUnreadChange?: (unreadCount: number) => void;
}

export function AnnouncementsDialog({
	open,
	onUnreadChange,
}: AnnouncementsDialogProps) {
	const [announcements, setAnnouncements] = useState<Announcement[]>([]);
	const [loading, setLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState("");
	const [listMode, setListMode] = useState<"all" | "unread">("all");
	const [isMarkingAllAsRead, setIsMarkingAllAsRead] = useState(false);
	const [selectedAnnouncement, setSelectedAnnouncement] =
		useState<Announcement | null>(null);
	const [isDetailOpen, setIsDetailOpen] = useState(false);

	const notifyUnreadCount = (list: Announcement[]) => {
		const unreadCount = list.filter((announcement) => !announcement.is_read).length;
		onUnreadChange?.(unreadCount);
	};

	const fetchAnnouncements = async () => {
		try {
			setLoading(true);
			const response = await axios.get("/announcements_list");
			const currentTime = new Date();

			const filteredAnnouncements = response.data.filter(
				(announcement: Announcement) => {
					const startTime = new Date(announcement.start_date_time);
					const endTime = new Date(announcement.end_date_time);
					return (
						announcement.is_active &&
						currentTime >= startTime &&
						currentTime <= endTime
					);
				},
			);

			setAnnouncements(filteredAnnouncements);
			notifyUnreadCount(filteredAnnouncements);
		} catch (error) {
			console.error("Error fetching announcements:", error);
			setErrorMessage("お知らせの取得に失敗しました。");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (open) {
			fetchAnnouncements();
		}
	}, [open]);

	const handleShowDetails = async (announcement: Announcement) => {
		setSelectedAnnouncement(announcement);
		setIsDetailOpen(true);

		if (!announcement.is_read) {
			try {
				await axios.post(`/announcements/${announcement.id}/read`);
				setAnnouncements((prev) => {
					const nextAnnouncements = prev.map((a) =>
						a.id === announcement.id ? { ...a, is_read: true } : a,
					);
					notifyUnreadCount(nextAnnouncements);
					const updated = nextAnnouncements.find((a) => a.id === announcement.id);
					if (updated) {
						setSelectedAnnouncement(updated);
					}
					return nextAnnouncements;
				});
			} catch (error) {
				console.error("Failed to mark announcement as read:", error);
			}
		}
	};

	const handleMarkAllAsRead = async () => {
		const unreadAnnouncements = announcements.filter((announcement) => !announcement.is_read);
		if (unreadAnnouncements.length === 0) return;

		try {
			setIsMarkingAllAsRead(true);
			await Promise.all(
				unreadAnnouncements.map((announcement) =>
					axios.post(`/announcements/${announcement.id}/read`),
				),
			);
			setAnnouncements((prev) => {
				const nextAnnouncements = prev.map((announcement) => ({
					...announcement,
					is_read: true,
				}));
				notifyUnreadCount(nextAnnouncements);
				return nextAnnouncements;
			});
		} catch (error) {
			console.error("Failed to mark all announcements as read:", error);
		} finally {
			setIsMarkingAllAsRead(false);
		}
	};

	const formatDate = (dateString: string) => {
		if (!dateString) return "";
		return new Date(dateString).toLocaleDateString("ja-JP", {
			month: "2-digit",
			day: "2-digit",
			weekday: "short",
		});
	};

	const processDate = (dateString: string) => {
		if (!dateString) return "";
		const date = new Date(dateString);
		return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
	};

	const makePreviewText = (content: string) => {
		return content
			.replace(/[#*_`>\-\[\]\(\)]/g, "")
			.replace(/\s+/g, " ")
			.trim();
	};

	const unreadCount = announcements.filter((announcement) => !announcement.is_read).length;
	const visibleAnnouncements =
		listMode === "unread"
			? announcements.filter((announcement) => !announcement.is_read)
			: announcements;

	return (
		<div className="w-[26rem]">
			<div className="px-3 py-2 border-b space-y-2">
				<div className="flex items-center justify-between">
					<p className="text-sm font-semibold flex items-center gap-2">
						<Megaphone className="h-4 w-4" />
						お知らせ
					</p>
					<span className="text-[11px] text-muted-foreground">
						未読 {unreadCount} 件
					</span>
				</div>
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-1">
						<Button
							variant={listMode === "all" ? "default" : "outline"}
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => setListMode("all")}
						>
							すべて
						</Button>
						<Button
							variant={listMode === "unread" ? "default" : "outline"}
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => setListMode("unread")}
						>
							未読
						</Button>
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs"
						onClick={handleMarkAllAsRead}
						disabled={unreadCount === 0 || isMarkingAllAsRead}
					>
						{isMarkingAllAsRead ? "処理中..." : "すべて既読"}
					</Button>
				</div>
			</div>
			<div className="notification-list-container p-2">
				{loading ? (
					<div className="flex items-center justify-center py-8">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
					</div>
				) : errorMessage ? (
					<Alert variant="destructive" className="m-1">
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>{errorMessage}</AlertDescription>
					</Alert>
				) : visibleAnnouncements.length > 0 ? (
					<div className="max-h-[22rem] overflow-y-auto space-y-2 pr-1">
						{visibleAnnouncements.map((announcement) => {
							return (
								<div
									key={announcement.id}
									className={`rounded-lg border transition-colors ${!announcement.is_read ? "border-primary/30 bg-primary/5" : "bg-white"}`}
								>
									<button
										type="button"
										onClick={() => handleShowDetails(announcement)}
										className="w-full text-left px-3 py-2.5 hover:bg-muted/30 rounded-lg"
									>
										<div className="flex items-center justify-between gap-3">
											<div className="min-w-0">
												<div className="flex items-center gap-2">
													{!announcement.is_read && (
														<span className="inline-block h-2 w-2 rounded-full bg-red-500 shrink-0" />
													)}
													<p className="font-semibold text-sm truncate">
														{announcement.title}
													</p>
												</div>
												<p className="mt-1 text-[11px] text-muted-foreground">
													{formatDate(announcement.send_date_time)} ・ {announcement.sender}
												</p>
												<p className="mt-1 text-xs text-muted-foreground line-clamp-1">
													{makePreviewText(announcement.content)}
												</p>
											</div>
											<span className="text-[11px] text-primary shrink-0">
												詳細
											</span>
										</div>
									</button>
								</div>
							);
						})}
					</div>
				) : (
					<div className="text-center py-8">
						<Megaphone className="mx-auto h-10 w-10 text-gray-400 mb-3" />
						<p className="text-sm text-gray-500">
							{listMode === "unread"
								? "未読のお知らせはありません。"
								: "現在、アクティブなお知らせはありません。"}
						</p>
					</div>
				)}
			</div>
			<Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
				<DialogContent className="sm:max-w-2xl">
					{selectedAnnouncement && (
						<>
							<DialogHeader>
								<DialogTitle className="text-xl leading-relaxed">
									{selectedAnnouncement.title}
								</DialogTitle>
								<DialogDescription className="text-xs">
									{formatDate(selectedAnnouncement.send_date_time)} ・{" "}
									{selectedAnnouncement.sender}
								</DialogDescription>
							</DialogHeader>
							<div className="max-h-[60vh] overflow-y-auto pr-1">
								<div className="rounded-md bg-muted/40 p-4">
									<div className="prose prose-sm max-w-none leading-7">
										<ReactMarkdown>{selectedAnnouncement.content}</ReactMarkdown>
									</div>
								</div>
								<div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
									表示期間: {processDate(selectedAnnouncement.start_date_time)} ～{" "}
									{processDate(selectedAnnouncement.end_date_time)}
								</div>
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
