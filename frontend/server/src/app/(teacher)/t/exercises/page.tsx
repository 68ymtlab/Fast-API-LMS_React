"use client";

import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, Copy, ImageIcon, Plus, Save, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import axios from "@/lib/axios";
import config from "@/lib/utils/config";

type CourseQuestion = {
	id: number;
	title: string;
	question_type: string;
	difficulty: number | null;
	is_active: boolean;
	content_data: Record<string, unknown>;
	tag_names: string[];
};

type CourseTag = {
	id: number;
	name: string;
	slug?: string | null;
};

type CourseImage = {
	id: number;
	file_path?: string;
	alt_text?: string | null;
	original_name?: string | null;
};

type McqChoice = {
	choice_id: string;
	choice_text: string;
};

type MultipleNumericBlank = {
	blank_id: string;
	label: string;
	answers: number[];
	tolerance?: number;
};

const parseNumberList = (value: string): number[] => {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0)
		.map((item) => Number.parseFloat(item))
		.filter((num) => !Number.isNaN(num));
};

const toOptionalNumber = (value: unknown): number | undefined => {
	if (value === undefined || value === null) return undefined;
	const num = Number(value);
	return Number.isNaN(num) ? undefined : num;
};

const toNumberListText = (values: unknown): string => {
	if (!Array.isArray(values)) return "";
	return values
		.map((v) => Number(v))
		.filter((v) => !Number.isNaN(v))
		.join(", ");
};

const toQuestionContent = (
	questionType: string,
	contentDataText: string,
): Record<string, unknown> => {
	let parsed: Record<string, unknown> = {};
	try {
		parsed = JSON.parse(contentDataText) as Record<string, unknown>;
	} catch {
		parsed = {};
	}

	if (questionType === "mcq") {
		const rawChoices = Array.isArray(parsed.choices)
			? parsed.choices
			: [];
		const choices: McqChoice[] = rawChoices.map((choice, index) => {
			if (typeof choice === "string") {
				return { choice_id: (index + 1).toString(), choice_text: choice };
			}
			if (choice && typeof choice === "object") {
				const obj = choice as Record<string, unknown>;
				return {
					choice_id: String(obj.choice_id ?? index + 1),
					choice_text: String(
						obj.choice_text ?? obj.text ?? obj.content ?? "",
					),
				};
			}
			return { choice_id: (index + 1).toString(), choice_text: "" };
		});

		const answerRaw = parsed.answer;
		const answer =
			typeof answerRaw === "string"
				? answerRaw
				: typeof answerRaw === "number"
					? String(answerRaw)
					: "";

		return {
			...parsed,
			question: typeof parsed.question === "string" ? parsed.question : "",
			choices:
				choices.length > 0
					? choices
					: [{ choice_id: "1", choice_text: "" }],
			answer,
			hint: typeof parsed.hint === "string" ? parsed.hint : "",
			answer_comment:
				typeof parsed.answer_comment === "string" ? parsed.answer_comment : "",
		};
	}

	if (questionType === "numeric") {
		return {
			...parsed,
			question: typeof parsed.question === "string" ? parsed.question : "",
			answers: Array.isArray(parsed.answers)
				? parsed.answers.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
				: [],
			tolerance: toOptionalNumber(parsed.tolerance),
			hint: typeof parsed.hint === "string" ? parsed.hint : "",
			answer_comment:
				typeof parsed.answer_comment === "string" ? parsed.answer_comment : "",
		};
	}

	if (questionType === "multiple_numeric") {
		const rawBlanks = Array.isArray(parsed.blanks)
			? parsed.blanks
			: [];
		const blanks: MultipleNumericBlank[] = rawBlanks.map((blank, index) => {
			const obj =
				blank && typeof blank === "object"
					? (blank as Record<string, unknown>)
					: {};
			return {
				blank_id: String(obj.blank_id ?? `blank${index + 1}`),
				label: typeof obj.label === "string" ? obj.label : "",
				answers: Array.isArray(obj.answers)
					? obj.answers.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
					: [],
				tolerance: toOptionalNumber(obj.tolerance),
			};
		});

		return {
			...parsed,
			question: typeof parsed.question === "string" ? parsed.question : "",
			blanks:
				blanks.length > 0
					? blanks
					: [{ blank_id: "blank1", label: "", answers: [], tolerance: 0 }],
			hint: typeof parsed.hint === "string" ? parsed.hint : "",
			answer_comment:
				typeof parsed.answer_comment === "string" ? parsed.answer_comment : "",
		};
	}

	if (questionType === "descriptive") {
		return {
			...parsed,
			question: typeof parsed.question === "string" ? parsed.question : "",
			answer: typeof parsed.answer === "string" ? parsed.answer : "",
			hint: typeof parsed.hint === "string" ? parsed.hint : "",
			answer_comment:
				typeof parsed.answer_comment === "string" ? parsed.answer_comment : "",
		};
	}

	return parsed;
};

const getDefaultContentData = (questionType: string): string => {
	switch (questionType) {
		case "mcq":
			return '{\n  "question": "",\n  "choices": [\n    {\n      "choice_id": "1",\n      "choice_text": ""\n    }\n  ],\n  "answer": "",\n  "hint": "",\n  "answer_comment": ""\n}';
		case "numeric":
			return '{\n  "question": "",\n  "answers": [0],\n  "tolerance": 0,\n  "hint": "",\n  "answer_comment": ""\n}';
		case "multiple_numeric":
			return '{\n  "question": "",\n  "blanks": [\n    {\n      "blank_id": "blank1",\n      "label": "",\n      "answers": [0],\n      "tolerance": 0\n    }\n  ],\n  "hint": "",\n  "answer_comment": ""\n}';
		case "descriptive":
			return '{\n  "question": "",\n  "answer": "",\n  "hint": "",\n  "answer_comment": ""\n}';
		default:
			return '{\n  "question": ""\n}';
	}
};

const emptyCreateState = {
	title: "",
	questionType: "mcq",
	difficulty: "",
	contentDataText: getDefaultContentData("mcq"),
	tagNamesText: "",
	isActive: true,
};

function TeacherExercisesPage() {
	const [loading, setLoading] = useState(false);
	const [initialLoading, setInitialLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState("");
	const [showSuccessDialog, setShowSuccessDialog] = useState(false);

	const [questions, setQuestions] = useState<CourseQuestion[]>([]);
	const [tags, setTags] = useState<CourseTag[]>([]);
	const [images, setImages] = useState<CourseImage[]>([]);
	const [imagesOpen, setImagesOpen] = useState(false);
	const [imageSearchQuery, setImageSearchQuery] = useState("");
	const [tagsOpen, setTagsOpen] = useState(true);
	const [imageDeleting, setImageDeleting] = useState<number | null>(null);
	const [imageUploading, setImageUploading] = useState(false);
	const imageFileInputRef = useRef<HTMLInputElement>(null);
	const [questionFileUploading, setQuestionFileUploading] = useState(false);
	const questionFileInputRef = useRef<HTMLInputElement>(null);
	const [newTagName, setNewTagName] = useState("");
	const [tagSaving, setTagSaving] = useState(false);
	const [tagDeleting, setTagDeleting] = useState<number | null>(null);
	const [questionDeleting, setQuestionDeleting] = useState<number | null>(null);
	const [keyword, setKeyword] = useState("");
	const [tagSearchQuery, setTagSearchQuery] = useState("");
	const [tagSortBy, setTagSortBy] = useState<"name" | "usage">("name");

	const [createState, setCreateState] = useState(emptyCreateState);
	const [selectedQuestionId, setSelectedQuestionId] = useState<string>("");
	const [updateState, setUpdateState] = useState(emptyCreateState);
	const [showRawCreateJson, setShowRawCreateJson] = useState(false);
	const [showRawUpdateJson, setShowRawUpdateJson] = useState(false);

	const selectedQuestion = useMemo(
		() => questions.find((q) => q.id === Number.parseInt(selectedQuestionId)),
		[selectedQuestionId, questions],
	);

	const filteredQuestions = useMemo(() => {
		const kw = keyword.trim().toLowerCase();
		if (!kw) return questions;
		return questions.filter((q) => {
			const tags = q.tag_names.join(" ").toLowerCase();
			return (
				q.title.toLowerCase().includes(kw) ||
				q.question_type.toLowerCase().includes(kw) ||
				tags.includes(kw)
			);
		});
	}, [keyword, questions]);

	const filteredImages = useMemo(() => {
		const q = imageSearchQuery.trim().toLowerCase();
		if (!q) return images;
		return images.filter((img) => {
			const name = (img.original_name ?? "").toLowerCase();
			const alt = (img.alt_text ?? "").toLowerCase();
			return name.includes(q) || alt.includes(q);
		});
	}, [images, imageSearchQuery]);

	useEffect(() => {
		const fetchData = async () => {
			try {
				setInitialLoading(true);
				const [tagsRes, questionsRes] = await Promise.all([
					axios.get("/tags"),
					axios.get("/questions?include_inactive=true"),
				]);
				setTags((tagsRes.data as CourseTag[]) ?? []);
				setQuestions((questionsRes.data as CourseQuestion[]) ?? []);
			} catch (error) {
				console.error("データの取得に失敗しました:", error);
				setErrorMessage("データの取得に失敗しました");
			} finally {
				setInitialLoading(false);
			}
		};
		fetchData();
	}, []);

	const fetchImages = async () => {
		try {
			const res = await axios.get("/images?limit=100");
			setImages((res.data as CourseImage[]) ?? []);
		} catch (error) {
			console.error("画像一覧の取得に失敗しました:", error);
			setErrorMessage("画像一覧の取得に失敗しました");
		}
	};

	const deleteImage = async (imageId: number) => {
		if (!confirm("この画像を削除しますか？問題文中で参照している場合は表示できなくなります。")) return;
		setImageDeleting(imageId);
		setErrorMessage("");
		try {
			await axios.delete(`/images/${imageId}`);
			setImages((prev) => prev.filter((img) => img.id !== imageId));
		} catch (error) {
			console.error("画像削除失敗:", error);
			setErrorMessage(
				error instanceof Error ? error.message : "画像の削除に失敗しました",
			);
		} finally {
			setImageDeleting(null);
		}
	};

	const copyImageMarkdown = (image: CourseImage) => {
		const name = image.original_name || `image-${image.id}`;
		const markdown = `![${name}](/api/images/${image.id})`;
		void navigator.clipboard.writeText(markdown);
		const btn = document.activeElement as HTMLElement;
		const prev = btn?.textContent;
		if (btn) {
			btn.textContent = "コピー済み";
			setTimeout(() => { btn.textContent = prev; }, 1200);
		}
	};

	const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const fileList = e.target.files;
		if (!fileList?.length) return;
		setImageUploading(true);
		setErrorMessage("");
		const formData = new FormData();
		for (let i = 0; i < fileList.length; i++) {
			formData.append("files", fileList[i]);
		}
		e.target.value = "";
		try {
			const res = await axios.post<CourseImage[]>("/images/upload", formData, {
				headers: { "Content-Type": "multipart/form-data" },
			});
			const created = res.data ?? [];
			setImages((prev) => [...created, ...prev]);
		} catch (error: any) {
			console.error("画像アップロード失敗:", error);
			let errorMsg = "画像のアップロードに失敗しました";
			if (error.response) {
				const detail = error.response.data?.detail;
				if (typeof detail === "string") {
					errorMsg = detail;
				} else if (error.response.data?.errors) {
					errorMsg = `エラーが発生しました:\n${error.response.data.errors.join("\n")}`;
				}
			} else if (error.message) {
				errorMsg = error.message;
			}
			setErrorMessage(errorMsg);
		} finally {
			setImageUploading(false);
		}
	};

	const handleQuestionFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const fileList = e.target.files;
		if (!fileList?.length) return;
		
		// 確認ダイアログ
		const fileNames = Array.from(fileList).map(f => f.name).join("\n");
		if (!confirm(`${fileList.length}件のファイルを登録しますか？\n\n${fileNames}\n\nこの操作で問題がデータベースに登録されます。`)) {
			e.target.value = "";
			return;
		}
		
		setQuestionFileUploading(true);
		setErrorMessage("");
		const formData = new FormData();
		for (let i = 0; i < fileList.length; i++) {
			formData.append("files", fileList[i]);
		}
		e.target.value = "";
		try {
			const res = await axios.post<CourseQuestion[] | { created_questions: CourseQuestion[]; errors: string[]; success_count: number; error_count: number }>("/questions/upload", formData, {
				headers: { "Content-Type": "multipart/form-data" },
			});
			
			// レスポンスが配列（全成功）かオブジェクト（一部成功/失敗）かを判定
			let created: CourseQuestion[] = [];
			let errors: string[] = [];
			
			if (Array.isArray(res.data)) {
				created = res.data;
			} else if (res.data && typeof res.data === "object" && "created_questions" in res.data) {
				created = res.data.created_questions ?? [];
				errors = res.data.errors ?? [];
			}
			
			if (created.length > 0) {
				setQuestions((prev) => [...created, ...prev]);
			}
			
			if (errors.length > 0) {
				const errorMsg = `一部のファイルの処理に失敗しました:\n${errors.join("\n")}`;
				setErrorMessage(errorMsg);
			} else if (created.length > 0) {
				setShowSuccessDialog(true);
				setTimeout(() => setShowSuccessDialog(false), 1600);
			}
		} catch (error: any) {
			console.error("問題ファイルアップロード失敗:", error);
			let errorMsg = "問題ファイルのアップロードに失敗しました";
			
			if (error.response) {
				// バックエンドからのエラーレスポンス
				const detail = error.response.data?.detail;
				if (typeof detail === "string") {
					errorMsg = detail;
				} else if (error.response.data?.errors) {
					errorMsg = `エラーが発生しました:\n${error.response.data.errors.join("\n")}`;
				} else if (error.response.data?.message) {
					errorMsg = error.response.data.message;
				}
			} else if (error.message) {
				errorMsg = error.message;
			}
			
			setErrorMessage(errorMsg);
		} finally {
			setQuestionFileUploading(false);
		}
	};

	useEffect(() => {
		if (!selectedQuestion) {
			setUpdateState(emptyCreateState);
			return;
		}
		setUpdateState({
			title: selectedQuestion.title,
			questionType: selectedQuestion.question_type,
			difficulty:
				selectedQuestion.difficulty === null
					? ""
					: selectedQuestion.difficulty.toString(),
			contentDataText: JSON.stringify(selectedQuestion.content_data ?? {}, null, 2),
			tagNamesText: selectedQuestion.tag_names.join(", "),
			isActive: selectedQuestion.is_active,
		});
	}, [selectedQuestion]);

	const inferTitleFromContent = (contentText: string, questionType: string): string => {
		try {
			const data = JSON.parse(contentText) as any;
			const stem: string =
				(typeof data?.stem === "string" && data.stem) ||
				(typeof data?.question === "string" && data.question) ||
				(typeof data?.prompt === "string" && data.prompt) ||
				"";
			const normalized = stem.replace(/\s+/g, " ").trim();
			if (!normalized) return "";
			let prefix = "【問題】";
			if (questionType.startsWith("mcq")) {
				prefix = "【選択】";
			} else if (questionType === "numeric") {
				prefix = "【数値】";
			} else if (questionType === "multiple_numeric") {
				prefix = "【複数数値】";
			} else if (questionType === "descriptive") {
				prefix = "【記述】";
			}
			const maxLen = 30;
			const head = normalized.slice(0, maxLen);
			return prefix + head + (normalized.length > maxLen ? "…" : "");
		} catch {
			return "";
		}
	};

	const parsePayload = (state: typeof emptyCreateState) => {
		const parsedDifficulty =
			state.difficulty.trim() === "" ? null : Number.parseInt(state.difficulty, 10);
		if (
			parsedDifficulty !== null &&
			(Number.isNaN(parsedDifficulty) || parsedDifficulty < 0)
		) {
			throw new Error("難易度は0以上の整数で入力してください");
		}

		let parsedContentData: Record<string, unknown> = {};
		try {
			parsedContentData = JSON.parse(state.contentDataText) as Record<string, unknown>;
		} catch {
			throw new Error("content_data は有効なJSON形式で入力してください");
		}

		const tagNames = state.tagNamesText
			.split(",")
			.map((tag) => tag.trim())
			.filter((tag) => tag.length > 0);

		return {
			title: state.title.trim(),
			question_type: state.questionType.trim(),
			difficulty: parsedDifficulty,
			content_data: parsedContentData,
			tag_names: tagNames,
			is_active: state.isActive,
		};
	};

	const setContentDataForTarget = (
		target: "create" | "update",
		updater: (content: Record<string, unknown>) => Record<string, unknown>,
	) => {
		if (target === "create") {
			setCreateState((prev) => {
				const content = toQuestionContent(prev.questionType, prev.contentDataText);
				const nextContent = updater(content);
				return {
					...prev,
					contentDataText: JSON.stringify(nextContent, null, 2),
				};
			});
			return;
		}
		setUpdateState((prev) => {
			const content = toQuestionContent(prev.questionType, prev.contentDataText);
			const nextContent = updater(content);
			return {
				...prev,
				contentDataText: JSON.stringify(nextContent, null, 2),
			};
		});
	};

	const renderContentDataEditor = (
		target: "create" | "update",
		state: typeof emptyCreateState,
		disabled = false,
	) => {
		const content = toQuestionContent(state.questionType, state.contentDataText);
		const inputClassName = disabled ? "opacity-60" : "";

		return (
			<div className="space-y-4">
				<div>
					<label className="text-sm font-medium mb-1 block">問題文</label>
					<Textarea
						value={(content.question as string) ?? ""}
						onChange={(e) =>
							setContentDataForTarget(target, (prev) => ({
								...prev,
								question: e.target.value,
							}))
						}
						className={`min-h-[120px] ${inputClassName}`}
						disabled={disabled}
					/>
				</div>

				{state.questionType === "mcq" && (
					<div className="space-y-3">
						<label className="text-sm font-medium block">選択肢</label>
						{((content.choices as McqChoice[]) ?? []).map((choice, index) => (
							<div key={`mcq-choice-${index}`} className="grid grid-cols-12 gap-2">
								<Input
									value={choice.choice_id ?? ""}
									onChange={(e) =>
										setContentDataForTarget(target, (prev) => {
											const choices = ((prev.choices as McqChoice[]) ?? []).map((c, i) =>
												i === index ? { ...c, choice_id: e.target.value } : c,
											);
											return { ...prev, choices };
										})
									}
									placeholder="ID"
									className={`col-span-3 md:col-span-2 ${inputClassName}`}
									disabled={disabled}
								/>
								<Input
									value={choice.choice_text ?? ""}
									onChange={(e) =>
										setContentDataForTarget(target, (prev) => {
											const choices = ((prev.choices as McqChoice[]) ?? []).map((c, i) =>
												i === index ? { ...c, choice_text: e.target.value } : c,
											);
											return { ...prev, choices };
										})
									}
									placeholder="選択肢テキスト"
									className={`col-span-8 md:col-span-9 ${inputClassName}`}
									disabled={disabled}
								/>
								<Button
									type="button"
									variant="outline"
									size="icon"
									onClick={() =>
										setContentDataForTarget(target, (prev) => {
											const choices = ((prev.choices as McqChoice[]) ?? []).filter(
												(_, i) => i !== index,
											);
											return {
												...prev,
												choices:
													choices.length > 0
														? choices
														: [{ choice_id: "1", choice_text: "" }],
											};
										})
									}
									disabled={disabled}
									className="col-span-1"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						))}
						<Button
							type="button"
							variant="secondary"
							onClick={() =>
								setContentDataForTarget(target, (prev) => {
									const choices = (prev.choices as McqChoice[]) ?? [];
									return {
										...prev,
										choices: [
											...choices,
											{
												choice_id: String(choices.length + 1),
												choice_text: "",
											},
										],
									};
								})
							}
							disabled={disabled}
						>
							<Plus className="h-4 w-4 mr-1" />
							選択肢を追加
						</Button>
						<div>
							<label className="text-sm font-medium mb-1 block">正解の選択肢ID</label>
							<Input
								value={(content.answer as string) ?? ""}
								onChange={(e) =>
									setContentDataForTarget(target, (prev) => ({
										...prev,
										answer: e.target.value,
									}))
								}
								placeholder="例: 2"
								className={inputClassName}
								disabled={disabled}
							/>
						</div>
					</div>
				)}

				{state.questionType === "numeric" && (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						<div>
							<label className="text-sm font-medium mb-1 block">正解候補（カンマ区切り）</label>
							<Input
								value={toNumberListText(content.answers)}
								onChange={(e) =>
									setContentDataForTarget(target, (prev) => ({
										...prev,
										answers: parseNumberList(e.target.value),
									}))
								}
								placeholder="例: 3.14, 2"
								className={inputClassName}
								disabled={disabled}
							/>
						</div>
						<div>
							<label className="text-sm font-medium mb-1 block">許容誤差（任意）</label>
							<Input
								value={
									content.tolerance === undefined || content.tolerance === null
										? ""
										: String(content.tolerance)
								}
								onChange={(e) =>
									setContentDataForTarget(target, (prev) => ({
										...prev,
										tolerance: toOptionalNumber(e.target.value.trim()),
									}))
								}
								placeholder="例: 0.01"
								className={inputClassName}
								disabled={disabled}
							/>
						</div>
					</div>
				)}

				{state.questionType === "multiple_numeric" && (
					<div className="space-y-3">
						<label className="text-sm font-medium block">空欄ごとの設定</label>
						{((content.blanks as MultipleNumericBlank[]) ?? []).map((blank, index) => (
							<div
								key={`blank-${index}`}
								className={`border rounded-md p-3 space-y-2 ${inputClassName}`}
							>
								<div className="text-xs text-muted-foreground">
									空欄ID: {blank.blank_id}（自動管理）
								</div>
								<Input
									value={blank.label ?? ""}
									onChange={(e) =>
										setContentDataForTarget(target, (prev) => {
											const blanks = ((prev.blanks as MultipleNumericBlank[]) ?? []).map(
												(b, i) => (i === index ? { ...b, label: e.target.value } : b),
											);
											return { ...prev, blanks };
										})
									}
									placeholder={`表示ラベル（例: 空欄${index + 1}）`}
									disabled={disabled}
								/>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
									<Input
										value={toNumberListText(blank.answers)}
										onChange={(e) =>
											setContentDataForTarget(target, (prev) => {
												const blanks = ((prev.blanks as MultipleNumericBlank[]) ?? []).map(
													(b, i) =>
														i === index
															? { ...b, answers: parseNumberList(e.target.value) }
															: b,
												);
												return { ...prev, blanks };
											})
										}
										placeholder="正解候補（例: 3, 4）"
										disabled={disabled}
									/>
									<Input
										value={
											blank.tolerance === undefined || blank.tolerance === null
												? ""
												: String(blank.tolerance)
										}
										onChange={(e) =>
											setContentDataForTarget(target, (prev) => {
												const blanks = ((prev.blanks as MultipleNumericBlank[]) ?? []).map(
													(b, i) =>
														i === index
															? {
																	...b,
																	tolerance: toOptionalNumber(e.target.value.trim()),
																}
															: b,
												);
												return { ...prev, blanks };
											})
										}
										placeholder="許容誤差（例: 0.1）"
										disabled={disabled}
									/>
								</div>
								<div className="flex justify-end">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() =>
											setContentDataForTarget(target, (prev) => {
												const blanks = ((prev.blanks as MultipleNumericBlank[]) ?? []).filter(
													(_, i) => i !== index,
												);
												return {
													...prev,
													blanks:
														blanks.length > 0
															? blanks
															: [
																	{
																		blank_id: "blank1",
																		label: "",
																		answers: [],
																		tolerance: 0,
																	},
																],
												};
											})
										}
										disabled={disabled}
									>
										<Trash2 className="h-4 w-4 mr-1" />
										空欄を削除
									</Button>
								</div>
							</div>
						))}
						<Button
							type="button"
							variant="secondary"
							onClick={() =>
								setContentDataForTarget(target, (prev) => {
									const blanks = (prev.blanks as MultipleNumericBlank[]) ?? [];
									return {
										...prev,
										blanks: [
											...blanks,
											{
												blank_id: `blank${blanks.length + 1}`,
												label: "",
												answers: [],
												tolerance: 0,
											},
										],
									};
								})
							}
							disabled={disabled}
						>
							<Plus className="h-4 w-4 mr-1" />
							空欄を追加
						</Button>
					</div>
				)}

				{state.questionType === "descriptive" && (
					<div>
						<label className="text-sm font-medium mb-1 block">模範解答</label>
						<Textarea
							value={(content.answer as string) ?? ""}
							onChange={(e) =>
								setContentDataForTarget(target, (prev) => ({
									...prev,
									answer: e.target.value,
								}))
							}
							className={`min-h-[100px] ${inputClassName}`}
							disabled={disabled}
						/>
					</div>
				)}

				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div>
						<label className="text-sm font-medium mb-1 block">ヒント（任意）</label>
						<Textarea
							value={(content.hint as string) ?? ""}
							onChange={(e) =>
								setContentDataForTarget(target, (prev) => ({
									...prev,
									hint: e.target.value,
								}))
							}
							className={`min-h-[80px] ${inputClassName}`}
							disabled={disabled}
						/>
					</div>
					<div>
						<label className="text-sm font-medium mb-1 block">解説（任意）</label>
						<Textarea
							value={(content.answer_comment as string) ?? ""}
							onChange={(e) =>
								setContentDataForTarget(target, (prev) => ({
									...prev,
									answer_comment: e.target.value,
								}))
							}
							className={`min-h-[80px] ${inputClassName}`}
							disabled={disabled}
						/>
					</div>
				</div>
			</div>
		);
	};

	const appendTagToInput = (target: "create" | "update", tagName: string) => {
		const append = (current: string) => {
			const tagsNow = current
				.split(",")
				.map((t) => t.trim())
				.filter((t) => t.length > 0);
			if (tagsNow.includes(tagName)) return current;
			return tagsNow.length === 0 ? tagName : `${current.trimEnd()}, ${tagName}`;
		};
		if (target === "create") {
			setCreateState((prev) => ({ ...prev, tagNamesText: append(prev.tagNamesText) }));
		} else {
			setUpdateState((prev) => ({ ...prev, tagNamesText: append(prev.tagNamesText) }));
		}
	};

	const createTag = async () => {
		if (!newTagName.trim()) {
			setErrorMessage("タグ名を入力してください");
			return;
		}
		setTagSaving(true);
		setErrorMessage("");
		try {
			const res = await axios.post("/tags", { name: newTagName.trim() });
			const created = res.data as CourseTag;
			setTags((prev) => {
				if (prev.some((t) => t.id === created.id)) return prev;
				return [...prev, created].sort((a, b) => a.name.localeCompare(b.name));
			});
			setNewTagName("");
		} catch (error) {
			console.error("タグ作成失敗:", error);
			const errorMsg = error instanceof Error ? error.message : "タグの作成に失敗しました";
			setErrorMessage(errorMsg);
		} finally {
			setTagSaving(false);
		}
	};

	const deleteTag = async (tagId: number) => {
		if (!confirm("このタグを削除しますか？問題に紐づいているタグも自動的に削除されます。")) {
			return;
		}
		setTagDeleting(tagId);
		setErrorMessage("");
		try {
			await axios.delete(`/tags/${tagId}`);
			setTags((prev) => prev.filter((t) => t.id !== tagId));
			// 問題のタグリストからも削除
			setQuestions((prev) =>
				prev.map((q) => ({
					...q,
					tag_names: q.tag_names.filter((tn) => {
						const tag = tags.find((t) => t.id === tagId);
						return tag && tn !== tag.name;
					}),
				})),
			);
		} catch (error) {
			console.error("タグ削除失敗:", error);
			const errorMsg = error instanceof Error ? error.message : "タグの削除に失敗しました";
			setErrorMessage(errorMsg);
		} finally {
			setTagDeleting(null);
		}
	};

	const getTagUsageCount = (tagName: string): number => {
		return questions.filter((q) => q.tag_names.includes(tagName)).length;
	};

	const filteredAndSortedTags = useMemo(() => {
		let filtered = tags;
		
		// 検索フィルタ
		if (tagSearchQuery.trim()) {
			const query = tagSearchQuery.trim().toLowerCase();
			filtered = filtered.filter((tag) => tag.name.toLowerCase().includes(query));
		}
		
		// ソート
		const sorted = [...filtered].sort((a, b) => {
			if (tagSortBy === "usage") {
				const countA = getTagUsageCount(a.name);
				const countB = getTagUsageCount(b.name);
				if (countB !== countA) {
					return countB - countA; // 使用頻度の高い順
				}
			}
			// 名前順（フォールバック）
			return a.name.localeCompare(b.name, "ja");
		});
		
		return sorted;
	}, [tags, tagSearchQuery, tagSortBy, questions]);

	const saveCreateQuestion = async () => {
		if (!createState.title.trim()) {
			setErrorMessage("問題タイトルを入力してください");
			return;
		}
		
		// 確認ダイアログ
		if (!confirm(`以下の問題を登録しますか？\n\nタイトル: ${createState.title}\nタイプ: ${createState.questionType}\n\nこの操作で問題がデータベースに登録されます。`)) {
			return;
		}
		
		setLoading(true);
		setErrorMessage("");
		try {
			const payload = parsePayload(createState);
			const res = await axios.post(`/questions`, payload);
			setQuestions((prev) => [res.data as CourseQuestion, ...prev]);
			setCreateState(emptyCreateState);
			setShowSuccessDialog(true);
			setTimeout(() => setShowSuccessDialog(false), 1600);
		} catch (error) {
			console.error("問題登録失敗:", error);
			setErrorMessage(
				error instanceof Error ? error.message : "問題の登録に失敗しました",
			);
		} finally {
			setLoading(false);
		}
	};

	const saveUpdateQuestion = async () => {
		if (!selectedQuestionId) {
			setErrorMessage("更新対象の問題を選択してください");
			return;
		}
		if (!updateState.title.trim()) {
			setErrorMessage("問題タイトルを入力してください");
			return;
		}
		setLoading(true);
		setErrorMessage("");
		try {
			const payload = parsePayload(updateState);
			const res = await axios.put(`/questions/${selectedQuestionId}`, payload);
			const updated = res.data as CourseQuestion;
			setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
			setShowSuccessDialog(true);
			setTimeout(() => setShowSuccessDialog(false), 1600);
		} catch (error) {
			console.error("問題更新失敗:", error);
			setErrorMessage(
				error instanceof Error ? error.message : "問題の更新に失敗しました",
			);
		} finally {
			setLoading(false);
		}
	};

	const deleteQuestion = async () => {
		if (!selectedQuestionId) {
			setErrorMessage("削除対象の問題を選択してください");
			return;
		}
		const questionId = Number.parseInt(selectedQuestionId);
		const question = questions.find((q) => q.id === questionId);
		if (!question) return;
		
		if (!confirm(`「${question.title}」を削除しますか？この操作は取り消せません。`)) {
			return;
		}
		
		setQuestionDeleting(questionId);
		setErrorMessage("");
		try {
			await axios.delete(`/questions/${questionId}`);
			setQuestions((prev) => prev.filter((q) => q.id !== questionId));
			setSelectedQuestionId("");
			setUpdateState(emptyCreateState);
			setShowSuccessDialog(true);
			setTimeout(() => setShowSuccessDialog(false), 1600);
		} catch (error) {
			console.error("問題削除失敗:", error);
			setErrorMessage(
				error instanceof Error ? error.message : "問題の削除に失敗しました",
			);
		} finally {
			setQuestionDeleting(null);
		}
	};

	if (initialLoading) {
		return (
			<div className="flex items-center justify-center py-8">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
			</div>
		);
	}

	return (
		<div className="container mx-auto py-8 px-4 max-w-7xl space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">演習問題管理</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{errorMessage && (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{errorMessage}</AlertDescription>
						</Alert>
					)}

					<Collapsible
						open={tagsOpen}
						onOpenChange={setTagsOpen}
						className="border rounded-lg"
					>
						<CollapsibleTrigger asChild>
							<button
								type="button"
								className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 rounded-lg transition-colors"
							>
								<span className="flex items-center gap-2 text-sm font-medium">
									タグ管理
									<span className="text-muted-foreground font-normal">
										（全{tags.length}件 / 表示中{filteredAndSortedTags.length}件）
									</span>
								</span>
								{tagsOpen ? (
									<ChevronUp className="h-4 w-4 text-muted-foreground" />
								) : (
									<ChevronDown className="h-4 w-4 text-muted-foreground" />
								)}
							</button>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<div className="px-4 pb-4 pt-0 space-y-4">
								<div className="flex gap-2">
									<Input
										value={newTagName}
										onChange={(e) => setNewTagName(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && !tagSaving && newTagName.trim()) {
												createTag();
											}
										}}
										placeholder="新しいタグ名を入力（Enterで作成）"
										className="flex-1"
									/>
									<Button onClick={createTag} disabled={tagSaving || !newTagName.trim()}>
										{tagSaving ? "作成中..." : "タグ作成"}
									</Button>
								</div>
								{tags.length > 0 && (
									<div className="flex gap-2 items-center">
										<Input
											value={tagSearchQuery}
											onChange={(e) => setTagSearchQuery(e.target.value)}
											placeholder="タグを検索..."
											className="flex-1 max-w-xs"
										/>
										<Select value={tagSortBy} onValueChange={(v) => setTagSortBy(v as "name" | "usage")}>
											<SelectTrigger className="w-[140px]">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="name">名前順</SelectItem>
												<SelectItem value="usage">使用頻度順</SelectItem>
											</SelectContent>
										</Select>
										{tagSearchQuery && (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setTagSearchQuery("")}
												className="h-8 w-8 p-0"
											>
												<X className="h-4 w-4" />
											</Button>
										)}
									</div>
								)}
								{tags.length === 0 ? (
									<p className="text-sm text-gray-500 text-center py-4">
										タグがまだ登録されていません。上記のフォームから作成してください。
									</p>
								) : filteredAndSortedTags.length === 0 ? (
									<p className="text-sm text-gray-500 text-center py-4">
										検索条件に一致するタグがありません。
									</p>
								) : (
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[240px] overflow-y-auto">
										{filteredAndSortedTags.map((tag) => {
											const usageCount = getTagUsageCount(tag.name);
											return (
												<div
													key={tag.id}
													className="flex items-center justify-between p-2 border rounded-md hover:bg-gray-50 group"
												>
													<div className="flex items-center gap-2 flex-1 min-w-0">
														<Badge variant="secondary" className="flex-shrink-0">
															{tag.name}
														</Badge>
														<span className="text-xs text-gray-500">
															{usageCount}件の問題
														</span>
													</div>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => deleteTag(tag.id)}
														disabled={tagDeleting === tag.id}
														className="flex-shrink-0 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
													>
														{tagDeleting === tag.id ? (
															<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
														) : (
															<Trash2 className="h-4 w-4 text-destructive" />
														)}
													</Button>
												</div>
											);
										})}
									</div>
								)}
								<p className="text-xs text-gray-500">
									💡 タグは問題登録・更新時に使用できます。既存タグのみ選択可能です。
								</p>
							</div>
						</CollapsibleContent>
					</Collapsible>

					<Collapsible
						open={imagesOpen}
						onOpenChange={(open) => {
							setImagesOpen(open);
							if (open && images.length === 0) void fetchImages();
						}}
						className="border rounded-lg"
					>
						<CollapsibleTrigger asChild>
							<button
								type="button"
								className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 rounded-lg transition-colors"
							>
								<span className="flex items-center gap-2 text-sm font-medium">
									<ImageIcon className="h-4 w-4" />
									画像一覧
									{images.length > 0 && (
										<span className="text-muted-foreground font-normal">
											（全{images.length}件
											{imageSearchQuery.trim() && ` / 表示中${filteredImages.length}件`}）
										</span>
									)}
								</span>
								{imagesOpen ? (
									<ChevronUp className="h-4 w-4 text-muted-foreground" />
								) : (
									<ChevronDown className="h-4 w-4 text-muted-foreground" />
								)}
							</button>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<div className="px-4 pb-4 pt-0 space-y-3">
								<p className="text-xs text-muted-foreground">
									問題文では <code className="bg-muted px-1 rounded">![説明](/api/images/ID)</code> で画像を参照できます。下の「Markdownをコピー」で貼り付け用テキストをコピーできます。
								</p>
								<div className="flex items-center gap-2 flex-wrap">
									<input
										ref={imageFileInputRef}
										type="file"
										accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
										multiple
										className="hidden"
										onChange={handleImageFileSelect}
									/>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => imageFileInputRef.current?.click()}
										disabled={imageUploading}
										className="gap-2"
									>
										{imageUploading ? (
											<>
												<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
												アップロード中...
											</>
										) : (
											<>
												<Upload className="h-4 w-4" />
												画像を選択してアップロード
											</>
										)}
									</Button>
									<span className="text-xs text-muted-foreground">
										複数選択可能（JPEG / PNG / GIF / WebP / SVG）
									</span>
								</div>
								{images.length > 0 && (
									<div className="flex gap-2 items-center">
										<Input
											value={imageSearchQuery}
											onChange={(e) => setImageSearchQuery(e.target.value)}
											placeholder="ファイル名・代替テキストで検索..."
											className="flex-1 max-w-xs"
										/>
										{imageSearchQuery && (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setImageSearchQuery("")}
												className="h-8 w-8 p-0"
											>
												<X className="h-4 w-4" />
											</Button>
										)}
									</div>
								)}
								{images.length === 0 ? (
									<p className="text-sm text-muted-foreground py-4 text-center">
										画像はまだありません。上の「画像を選択してアップロード」から登録するか、レッスンコンテンツの取り込みで登録された画像がここに表示されます。
									</p>
								) : filteredImages.length === 0 ? (
									<p className="text-sm text-muted-foreground py-4 text-center">
										検索条件に一致する画像がありません。
									</p>
								) : (
									<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[280px] overflow-y-auto">
										{filteredImages.map((img) => (
											<div
												key={img.id}
												className="border rounded-md overflow-hidden bg-muted/30 group"
											>
												<div className="aspect-video bg-muted flex items-center justify-center relative">
													{config.apiBaseUrl ? (
														<img
															src={`${config.apiBaseUrl}/api/images/${img.id}`}
															alt={img.original_name ?? `image-${img.id}`}
															className="object-contain w-full h-full max-h-[100px]"
														/>
													) : (
														<span className="text-xs text-muted-foreground">ID: {img.id}</span>
													)}
												</div>
												<div className="p-2 space-y-1">
													<p className="text-xs truncate" title={img.original_name ?? undefined}>
														{img.original_name ?? `image-${img.id}`}
													</p>
													<div className="flex gap-1">
														<Button
															variant="outline"
															size="sm"
															className="flex-1 h-7 text-xs"
															onClick={() => copyImageMarkdown(img)}
														>
															<Copy className="h-3 w-3 mr-1" />
															Markdownをコピー
														</Button>
														<Button
															variant="ghost"
															size="sm"
															onClick={() => deleteImage(img.id)}
															disabled={imageDeleting === img.id}
															className="h-7 w-7 p-0 text-destructive hover:text-destructive"
														>
															{imageDeleting === img.id ? (
																<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
															) : (
																<Trash2 className="h-4 w-4" />
															)}
														</Button>
													</div>
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						</CollapsibleContent>
					</Collapsible>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="pt-6">
					<Tabs defaultValue="register" className="w-full">
						<TabsList className="grid grid-cols-3 w-full">
							<TabsTrigger value="register">登録</TabsTrigger>
							<TabsTrigger value="update">更新</TabsTrigger>
							<TabsTrigger value="create">作成</TabsTrigger>
						</TabsList>

						<TabsContent value="register" className="mt-6 space-y-4">
							<div className="border rounded-lg p-4 bg-muted/30 space-y-3">
								<div className="flex items-center gap-2">
									<Upload className="h-4 w-4" />
									<p className="text-sm font-medium">ファイルから一括登録</p>
								</div>
								<p className="text-xs text-muted-foreground">
									1ファイル=1問の形式で、JSONまたはYAMLファイルをアップロードできます。複数ファイルをまとめて選択可能です。
								</p>
								<div className="flex items-center gap-2 flex-wrap">
									<input
										ref={questionFileInputRef}
										type="file"
										accept=".json,.yaml,.yml"
										multiple
										className="hidden"
										onChange={handleQuestionFileSelect}
									/>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => questionFileInputRef.current?.click()}
										disabled={questionFileUploading}
										className="gap-2"
									>
										{questionFileUploading ? (
											<>
												<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
												アップロード中...
											</>
										) : (
											<>
												<Upload className="h-4 w-4" />
												問題ファイルを選択してアップロード
											</>
										)}
									</Button>
									<span className="text-xs text-muted-foreground">
										JSON / YAML（複数選択可能）
									</span>
								</div>
							</div>

							<div className="border-t pt-4">
								<p className="text-sm font-medium mb-4">手動で登録</p>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								<div>
									<label className="text-sm font-medium mb-1 block">
										問題タイトル
									</label>
									<Input
										value={createState.title}
										onChange={(e) =>
											setCreateState((prev) => ({ ...prev, title: e.target.value }))
										}
										placeholder="例: 2次関数の頂点を求める問題"
									/>
								</div>
								<div>
									<label className="text-sm font-medium mb-1 block">問題タイプ</label>
									<Select
										value={createState.questionType}
										onValueChange={(value) => {
											setCreateState((prev) => ({
												...prev,
												questionType: value,
												contentDataText: getDefaultContentData(value),
											}));
										}}
									>
										<SelectTrigger>
											<SelectValue placeholder="問題タイプを選択" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="mcq">選択問題（MCQ）</SelectItem>
											<SelectItem value="numeric">数値解答（単一）</SelectItem>
											<SelectItem value="multiple_numeric">数値解答（複数）</SelectItem>
											<SelectItem value="descriptive">記述問題</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								<div>
									<label className="text-sm font-medium mb-1 block">
										難易度（任意）
									</label>
									<Input
										value={createState.difficulty}
										onChange={(e) =>
											setCreateState((prev) => ({
												...prev,
												difficulty: e.target.value,
											}))
										}
										placeholder="例: 1"
									/>
								</div>
								<div>
									<label className="text-sm font-medium mb-1 block">
										タグ（既存タグのみ選択可能）
									</label>
									{tags.length > 5 && (
										<Input
											value={tagSearchQuery}
											onChange={(e) => setTagSearchQuery(e.target.value)}
											placeholder="タグを検索..."
											className="mb-2"
										/>
									)}
									<div className="border rounded-md p-2 min-h-[60px] max-h-[120px] overflow-y-auto">
										{tags.length === 0 ? (
											<p className="text-xs text-gray-500 text-center py-2">
												タグがありません。タグ管理セクションでタグを作成してください。
											</p>
										) : filteredAndSortedTags.length === 0 ? (
											<p className="text-xs text-gray-500 text-center py-2">
												検索条件に一致するタグがありません。
											</p>
										) : (
											<div className="flex flex-wrap gap-2">
												{filteredAndSortedTags.map((tag) => {
													const isSelected = createState.tagNamesText
														.split(",")
														.map((t) => t.trim())
														.includes(tag.name);
													return (
														<button
															key={`create-tag-${tag.id}`}
															type="button"
															onClick={() => {
																if (isSelected) {
																	// タグを削除
																	setCreateState((prev) => {
																		const tags = prev.tagNamesText
																			.split(",")
																			.map((t) => t.trim())
																			.filter((t) => t !== tag.name && t.length > 0);
																		return {
																			...prev,
																			tagNamesText: tags.join(", "),
																		};
																	});
																} else {
																	// タグを追加
																	appendTagToInput("create", tag.name);
																}
															}}
															className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
																isSelected
																	? "bg-primary text-primary-foreground border-primary"
																	: "bg-background hover:bg-gray-50 border-gray-300"
															}`}
														>
															{isSelected ? "✓ " : ""}
															{tag.name}
														</button>
													);
												})}
											</div>
										)}
									</div>
									<p className="text-xs text-gray-500 mt-1">
										クリックで選択/解除。既存タグのみ使用可能です。
									</p>
								</div>
							</div>
							<div className="space-y-3">
								<label className="text-sm font-medium mb-1 block">
									問題内容入力
								</label>
								{renderContentDataEditor("create", createState)}
								<div className="flex justify-end">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => setShowRawCreateJson((prev) => !prev)}
									>
										{showRawCreateJson ? "JSON編集を閉じる" : "JSONを直接編集"}
									</Button>
								</div>
								{showRawCreateJson && (
									<Textarea
										value={createState.contentDataText}
										onChange={(e) =>
											setCreateState((prev) => {
												const next = {
													...prev,
													contentDataText: e.target.value,
												};
												if (!prev.title.trim()) {
													const inferred = inferTitleFromContent(
														next.contentDataText,
														next.questionType,
													);
													if (inferred) next.title = inferred;
												}
												return next;
											})
										}
										className="min-h-[220px] font-mono text-xs"
									/>
								)}
							</div>
							<div className="flex items-center gap-2">
								<input
									id="create-is-active"
									type="checkbox"
									checked={createState.isActive}
									onChange={(e) =>
										setCreateState((prev) => ({
											...prev,
											isActive: e.target.checked,
										}))
									}
								/>
								<label htmlFor="create-is-active" className="text-sm">
									有効な問題として登録する
								</label>
							</div>
							<div className="flex justify-end">
								<Button
									onClick={saveCreateQuestion}
									disabled={loading}
								>
									<Plus className="h-4 w-4 mr-2" />
									{loading ? "登録中..." : "演習問題を登録"}
								</Button>
							</div>
						</TabsContent>

						<TabsContent value="update" className="mt-6 space-y-4">
							<div>
								<label className="text-sm font-medium mb-1 block">問題検索</label>
								<Input
									value={keyword}
									onChange={(e) => setKeyword(e.target.value)}
									placeholder="問題名 / タグ / タイプ"
								/>
							</div>
							<div>
								<label className="text-sm font-medium mb-1 block">更新対象問題</label>
								<Select
									value={selectedQuestionId}
									onValueChange={setSelectedQuestionId}
								>
									<SelectTrigger>
										<SelectValue placeholder="問題を選択" />
									</SelectTrigger>
									<SelectContent>
										{filteredQuestions.map((q) => (
											<SelectItem key={q.id} value={q.id.toString()}>
												{q.title}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								<div>
									<label className="text-sm font-medium mb-1 block">
										問題タイトル
									</label>
									<Input
										value={updateState.title}
										onChange={(e) =>
											setUpdateState((prev) => ({ ...prev, title: e.target.value }))
										}
										disabled={!selectedQuestionId}
									/>
								</div>
								<div>
									<label className="text-sm font-medium mb-1 block">問題タイプ</label>
									<Select
										value={updateState.questionType}
										onValueChange={(value) => {
											setUpdateState((prev) => ({
												...prev,
												questionType: value,
												contentDataText: getDefaultContentData(value),
											}));
										}}
										disabled={!selectedQuestionId}
									>
										<SelectTrigger>
											<SelectValue placeholder="問題タイプを選択" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="mcq">選択問題（MCQ）</SelectItem>
											<SelectItem value="numeric">数値解答（単一）</SelectItem>
											<SelectItem value="multiple_numeric">数値解答（複数）</SelectItem>
											<SelectItem value="descriptive">記述問題</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								<div>
									<label className="text-sm font-medium mb-1 block">
										難易度（任意）
									</label>
									<Input
										value={updateState.difficulty}
										onChange={(e) =>
											setUpdateState((prev) => ({
												...prev,
												difficulty: e.target.value,
											}))
										}
										disabled={!selectedQuestionId}
									/>
								</div>
								<div>
									<label className="text-sm font-medium mb-1 block">
										タグ（既存タグのみ選択可能）
									</label>
									{tags.length > 5 && (
										<Input
											value={tagSearchQuery}
											onChange={(e) => setTagSearchQuery(e.target.value)}
											placeholder="タグを検索..."
											className="mb-2"
											disabled={!selectedQuestionId}
										/>
									)}
									<div className="border rounded-md p-2 min-h-[60px] max-h-[120px] overflow-y-auto">
										{tags.length === 0 ? (
											<p className="text-xs text-gray-500 text-center py-2">
												タグがありません。タグ管理セクションでタグを作成してください。
											</p>
										) : filteredAndSortedTags.length === 0 ? (
											<p className="text-xs text-gray-500 text-center py-2">
												検索条件に一致するタグがありません。
											</p>
										) : (
											<div className="flex flex-wrap gap-2">
												{filteredAndSortedTags.map((tag) => {
													const isSelected = updateState.tagNamesText
														.split(",")
														.map((t) => t.trim())
														.includes(tag.name);
													return (
														<button
															key={`update-tag-${tag.id}`}
															type="button"
															onClick={() => {
																if (!selectedQuestionId) return;
																if (isSelected) {
																	// タグを削除
																	setUpdateState((prev) => {
																		const tags = prev.tagNamesText
																			.split(",")
																			.map((t) => t.trim())
																			.filter((t) => t !== tag.name && t.length > 0);
																		return {
																			...prev,
																			tagNamesText: tags.join(", "),
																		};
																	});
																} else {
																	// タグを追加
																	appendTagToInput("update", tag.name);
																}
															}}
															disabled={!selectedQuestionId}
															className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
																isSelected
																	? "bg-primary text-primary-foreground border-primary"
																	: "bg-background hover:bg-gray-50 border-gray-300"
															} ${!selectedQuestionId ? "opacity-50 cursor-not-allowed" : ""}`}
														>
															{isSelected ? "✓ " : ""}
															{tag.name}
														</button>
													);
												})}
											</div>
										)}
									</div>
									<p className="text-xs text-gray-500 mt-1">
										クリックで選択/解除。既存タグのみ使用可能です。
									</p>
								</div>
							</div>
							<div className="space-y-3">
								<label className="text-sm font-medium mb-1 block">
									問題内容入力
								</label>
								{renderContentDataEditor("update", updateState, !selectedQuestionId)}
								<div className="flex justify-end">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => setShowRawUpdateJson((prev) => !prev)}
										disabled={!selectedQuestionId}
									>
										{showRawUpdateJson ? "JSON編集を閉じる" : "JSONを直接編集"}
									</Button>
								</div>
								{showRawUpdateJson && (
									<Textarea
										value={updateState.contentDataText}
										onChange={(e) =>
											setUpdateState((prev) => ({
												...prev,
												contentDataText: e.target.value,
											}))
										}
										className="min-h-[220px] font-mono text-xs"
										disabled={!selectedQuestionId}
									/>
								)}
							</div>
							<div className="flex items-center gap-2">
								<input
									id="update-is-active"
									type="checkbox"
									checked={updateState.isActive}
									onChange={(e) =>
										setUpdateState((prev) => ({
											...prev,
											isActive: e.target.checked,
										}))
									}
									disabled={!selectedQuestionId}
								/>
								<label htmlFor="update-is-active" className="text-sm">
									有効な問題として扱う
								</label>
							</div>
							{selectedQuestion && (
								<div className="border rounded-md p-3 bg-muted/30">
									<div className="text-sm font-medium mb-2">
										現在の問題情報（ID: {selectedQuestion.id}）
									</div>
									<div className="text-xs text-gray-600 mb-2">
										タイプ: {selectedQuestion.question_type} / 難易度:{" "}
										{selectedQuestion.difficulty ?? "未設定"} / 状態:{" "}
										{selectedQuestion.is_active ? "有効" : "無効"}
									</div>
									<div className="flex flex-wrap gap-1">
										{selectedQuestion.tag_names.map((tag) => (
											<Badge key={`tag-${selectedQuestion.id}-${tag}`} variant="secondary">
												{tag}
											</Badge>
										))}
									</div>
								</div>
							)}
							<div className="border rounded-md max-h-[240px] overflow-auto">
								{filteredQuestions.map((q) => (
									<button
										key={`pick-${q.id}`}
										type="button"
										onClick={() => setSelectedQuestionId(q.id.toString())}
										className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-gray-50 ${
											selectedQuestionId === q.id.toString() ? "bg-gray-100" : ""
										}`}
									>
										<div className="font-medium text-sm">{q.title}</div>
										<div className="text-xs text-gray-500 mt-1">
											{q.question_type} / {q.is_active ? "有効" : "無効"}
										</div>
									</button>
								))}
							</div>
							<div className="flex justify-between items-center">
								{selectedQuestionId && (
									<Button
										variant="destructive"
										onClick={deleteQuestion}
										disabled={questionDeleting !== null || loading}
									>
										{questionDeleting === Number.parseInt(selectedQuestionId) ? (
											<>
												<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
												削除中...
											</>
										) : (
											<>
												<Trash2 className="h-4 w-4 mr-2" />
												問題を削除
											</>
										)}
									</Button>
								)}
								<div className="flex gap-2 ml-auto">
									<Button
										onClick={saveUpdateQuestion}
										disabled={loading || !selectedQuestionId}
									>
										<Save className="h-4 w-4 mr-2" />
										{loading ? "更新中..." : "演習問題を更新"}
									</Button>
								</div>
							</div>
						</TabsContent>

						<TabsContent value="create" className="mt-6">
							<Card>
								<CardHeader>
									<CardTitle className="text-lg flex items-center gap-2">
										<Sparkles className="h-5 w-5" />
										問題作成（LLM連携）
									</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-gray-600">
										Coming soon. このタブでは将来的にLLMによる演習問題の自動作成を提供予定です。
									</p>
								</CardContent>
							</Card>
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>

			<Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader className="text-center">
						<div className="mx-auto mb-4">
							<CheckCircle className="h-16 w-16 text-green-500" />
						</div>
						<DialogTitle className="text-xl">保存完了</DialogTitle>
						<DialogDescription>演習問題を保存しました。</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default TeacherExercisesPage;

