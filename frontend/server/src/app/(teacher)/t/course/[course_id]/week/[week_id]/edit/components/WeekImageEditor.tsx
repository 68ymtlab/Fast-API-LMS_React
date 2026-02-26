"use client";

import { AlertCircle, ChevronDown, RefreshCw, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import axios from "@/lib/axios";
import config from "@/lib/utils/config";

interface CourseImage {
	id: number;
	file_path: string;
	original_name?: string | null;
	alt_text?: string | null;
}

interface LessonPageBody {
	raw_content_body?: string | null;
	rendered_content_body?: string | null;
}

const WeekImageEditor = () => {
	const params = useParams();
	const weekId = params.week_id as string;

	const [allImages, setAllImages] = useState<CourseImage[]>([]);
	const [lessonImageIds, setLessonImageIds] = useState<number[]>([]);
	const [allImagesLoading, setAllImagesLoading] = useState(false);
	const [lessonImagesLoading, setLessonImagesLoading] = useState(false);
	const [imageUploading, setImageUploading] = useState(false);
	const [deletingImageId, setDeletingImageId] = useState<number | null>(null);
	const [allImageSearchQuery, setAllImageSearchQuery] = useState("");
	const [allImagesOpen, setAllImagesOpen] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");

	const extractImageIdsFromText = (text: string) => {
		const ids: number[] = [];
		const imageRefPattern = /\/api\/images\/(\d+)/g;
		let match = imageRefPattern.exec(text);
		while (match !== null) {
			const imageId = Number.parseInt(match[1], 10);
			if (!Number.isNaN(imageId)) {
				ids.push(imageId);
			}
			match = imageRefPattern.exec(text);
		}
		return ids;
	};

	const fetchAllImages = async () => {
		try {
			setAllImagesLoading(true);
			setErrorMessage("");
			const pageSize = 500;
			let offset = 0;
			const collected: CourseImage[] = [];

			while (true) {
				const response = await axios.get(
					`/images?limit=${pageSize}&offset=${offset}`,
				);
				const batch = (response.data as CourseImage[]) ?? [];
				collected.push(...batch);
				if (batch.length < pageSize) {
					break;
				}
				offset += pageSize;
			}

			setAllImages(collected);
		} catch (error) {
			console.error("Error fetching all images:", error);
			setErrorMessage("全画像の取得に失敗しました");
		} finally {
			setAllImagesLoading(false);
		}
	};

	const fetchLessonImages = async () => {
		if (!weekId) return;
		try {
			setLessonImagesLoading(true);
			setErrorMessage("");
			const response = await axios.get(`/lesson-items/${weekId}/lesson-pages`);
			const pages = (response.data as LessonPageBody[]) ?? [];
			const imageIds = new Set<number>();
			for (const page of pages) {
				const body = page.rendered_content_body || page.raw_content_body || "";
				const ids = extractImageIdsFromText(body);
				for (const imageId of ids) {
					imageIds.add(imageId);
				}
			}
			setLessonImageIds(Array.from(imageIds).sort((a, b) => a - b));
		} catch (error) {
			console.error("Error fetching lesson images:", error);
			setErrorMessage("このレッスンの画像一覧取得に失敗しました");
		} finally {
			setLessonImagesLoading(false);
		}
	};

	useEffect(() => {
		if (weekId) {
			void fetchLessonImages();
			void fetchAllImages();
		}
	}, [weekId]);

	const handleImageFileSelect = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const fileList = event.target.files;
		if (!fileList?.length) return;

		try {
			setImageUploading(true);
			setErrorMessage("");
			const formData = new FormData();
			for (let i = 0; i < fileList.length; i++) {
				formData.append("files", fileList[i]);
			}
			event.target.value = "";

			const response = await axios.post<CourseImage[]>("/images/upload", formData, {
				headers: { "Content-Type": "multipart/form-data" },
			});
			const created = response.data ?? [];
			setAllImages((prev) => {
				const merged = [...created, ...prev];
				const uniqueById = new Map<number, CourseImage>();
				for (const image of merged) {
					uniqueById.set(image.id, image);
				}
				return Array.from(uniqueById.values());
			});
			await fetchLessonImages();
		} catch (error) {
			console.error("Error uploading images:", error);
			setErrorMessage("画像の追加に失敗しました");
		} finally {
			setImageUploading(false);
		}
	};

	const handleDeleteImage = async (imageId: number) => {
		if (!confirm("この画像を削除しますか？教科書本文中で参照している場合は表示できなくなります。")) {
			return;
		}

		try {
			setDeletingImageId(imageId);
			setErrorMessage("");
			await axios.delete(`/images/${imageId}`);
			setAllImages((prev) => prev.filter((image) => image.id !== imageId));
			setLessonImageIds((prev) => prev.filter((id) => id !== imageId));
		} catch (error) {
			console.error("Error deleting image:", error);
			setErrorMessage("画像の削除に失敗しました");
		} finally {
			setDeletingImageId(null);
		}
	};

	const lessonImages = lessonImageIds.map((id) => {
		const found = allImages.find((image) => image.id === id);
		if (found) return found;
		return {
			id,
			file_path: "",
			original_name: `image-${id}`,
			alt_text: null,
		} satisfies CourseImage;
	});

	const filteredAllImages = useMemo(() => {
		const query = allImageSearchQuery.trim().toLowerCase();
		if (!query) return allImages;

		return allImages.filter((image) => {
			const name = (image.original_name ?? "").toLowerCase();
			const alt = (image.alt_text ?? "").toLowerCase();
			const idText = image.id.toString();
			return (
				name.includes(query) ||
				alt.includes(query) ||
				idText.includes(query)
			);
		});
	}, [allImages, allImageSearchQuery]);

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-3">
				<CardTitle>画像の管理</CardTitle>
				<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
				>
					<Button
						type="button"
						variant="outline"
						onClick={fetchAllImages}
						disabled={allImagesLoading || imageUploading || deletingImageId !== null}
					>
						<RefreshCw className="h-4 w-4 mr-2" />
						すべての画像を取得
					</Button>
					<Input
						type="file"
						accept="image/*"
						multiple
						onChange={handleImageFileSelect}
						disabled={allImagesLoading || imageUploading || deletingImageId !== null}
					/>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				{errorMessage && (
					<Alert variant="destructive">
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>{errorMessage}</AlertDescription>
					</Alert>
				)}

				<div className="space-y-3">
					<h3 className="font-semibold">このレッスンの教科書コンテンツ画像</h3>
					{lessonImagesLoading ? (
						<p className="text-sm text-muted-foreground">画像を読み込み中...</p>
					) : lessonImages.length > 0 ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
							{lessonImages.map((image) => (
								<div
									key={`lesson-image-${image.id}`}
									className="relative border rounded-md p-2 space-y-2"
								>
									<Button
										type="button"
										variant="destructive"
										size="icon"
										onClick={() => handleDeleteImage(image.id)}
										disabled={deletingImageId === image.id}
										className="absolute top-2 right-2 h-7 w-7"
										aria-label="画像を削除"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
									<img
										src={`${config.apiBaseUrl}/api/images/${image.id}`}
										alt={image.alt_text || image.original_name || `image-${image.id}`}
										className="w-full h-36 object-cover rounded"
									/>
									<p className="text-xs truncate">
										{image.original_name || `image-${image.id}`}
									</p>
								</div>
							))}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							教科書コンテンツで参照されている画像はありません
						</p>
					)}
				</div>

				<Collapsible open={allImagesOpen} onOpenChange={setAllImagesOpen}>
					<div className="space-y-3">
						<div className="flex items-center justify-between gap-2">
							<h3 className="font-semibold">登録済み全画像（{allImages.length}件）</h3>
							<CollapsibleTrigger asChild>
								<Button type="button" variant="outline" size="sm">
									<ChevronDown
										className={`h-4 w-4 mr-1 transition-transform ${allImagesOpen ? "rotate-180" : ""}`}
									/>
									{allImagesOpen ? "非表示" : "表示"}
								</Button>
							</CollapsibleTrigger>
						</div>

						<CollapsibleContent className="space-y-3">
							<Input
								type="text"
								placeholder="画像名・代替テキスト・IDで検索"
								value={allImageSearchQuery}
								onChange={(event) => setAllImageSearchQuery(event.target.value)}
								disabled={allImagesLoading}
							/>
							{allImagesLoading ? (
								<p className="text-sm text-muted-foreground">画像を取得中...</p>
							) : filteredAllImages.length > 0 ? (
								<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
									{filteredAllImages.map((image) => (
										<div
											key={`all-image-${image.id}`}
											className="relative border rounded-md p-2 space-y-2"
										>
											<Button
												type="button"
												variant="destructive"
												size="icon"
												onClick={() => handleDeleteImage(image.id)}
												disabled={deletingImageId === image.id}
												className="absolute top-2 right-2 h-7 w-7"
												aria-label="画像を削除"
											>
												<Trash2 className="h-4 w-4" />
											</Button>
											<img
												src={`${config.apiBaseUrl}/api/images/${image.id}`}
												alt={image.alt_text || image.original_name || `image-${image.id}`}
												className="w-full h-28 object-cover rounded"
											/>
											<p className="text-xs truncate">
												{image.original_name || `image-${image.id}`}
											</p>
										</div>
									))}
								</div>
							) : (
								<p className="text-sm text-muted-foreground">
									{allImages.length > 0
										? "検索条件に一致する画像がありません"
										: "登録済み画像はありません"}
								</p>
							)}
						</CollapsibleContent>
					</div>
				</Collapsible>
			</CardContent>
		</Card>
	);
};

export default WeekImageEditor;
