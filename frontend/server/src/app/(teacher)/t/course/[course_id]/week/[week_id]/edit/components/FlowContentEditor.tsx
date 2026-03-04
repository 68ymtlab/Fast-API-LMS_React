"use client";

import {
	AlertCircle,
	CheckCircle,
	ChevronDown,
	ChevronUp,
	Copy,
	Eye,
	FolderKanban,
	GripVertical,
	ListChecks,
	Save,
	Settings2,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import axios from "@/lib/axios";
import { MathJax, MathJaxSetup } from "@/components/shared/MathJax";

interface CourseQuestion {
	id: number;
	title: string;
	question_type: string;
	difficulty: number | null;
	is_active: boolean;
	content_data: Record<string, unknown>;
	tag_names: string[];
}

interface ExerciseSet {
	id: number;
	title: string;
	description?: string | null;
	course_id: number;
	question_ids: number[];
	due_date?: string | null;
}

interface FlowContentEditorProps {
	courseId: string;
	weekId: string;
}

function FlowContentEditor({ courseId, weekId: _weekId }: FlowContentEditorProps) {
	const normalizeExerciseSet = (set: Partial<ExerciseSet>): ExerciseSet => ({
		id: Number(set.id ?? 0),
		title: set.title ?? "",
		description: set.description ?? null,
		course_id: Number(set.course_id ?? courseId),
		question_ids: Array.isArray(set.question_ids)
			? set.question_ids.filter((id): id is number => typeof id === "number")
			: [],
		due_date: set.due_date ?? null,
	});

	const [loading, setLoading] = useState(false);
	const [initialLoading, setInitialLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState("");
	const [showSuccessDialog, setShowSuccessDialog] = useState(false);
	const [setDeleting, setSetDeleting] = useState<number | null>(null);
	const [duplicating, setDuplicating] = useState(false);
	const [draggingQuestionId, setDraggingQuestionId] = useState<number | null>(null);
	const [expandedQuestionIds, setExpandedQuestionIds] = useState<number[]>([]);

	const [questionKeyword, setQuestionKeyword] = useState("");
	const [questionDisplayLimit, setQuestionDisplayLimit] = useState(20);
	const [questionViewMode, setQuestionViewMode] = useState<
		"all" | "selected" | "unselected"
	>("all");
	const [questions, setQuestions] = useState<CourseQuestion[]>([]);
	const [sets, setSets] = useState<ExerciseSet[]>([]);

	const [selectedSetId, setSelectedSetId] = useState<number | null>(null);
	const [setTitle, setSetTitle] = useState("");
	const [setDescription, setSetDescription] = useState("");
	const [setDueDate, setSetDueDate] = useState("");
	const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
	const editorSectionRef = useRef<HTMLDivElement | null>(null);

	const selectedSet = useMemo(
		() => sets.find((set) => set.id === selectedSetId) ?? null,
		[sets, selectedSetId],
	);

	useEffect(() => {
		const fetchData = async () => {
			try {
				setInitialLoading(true);
				const [questionsRes, setsRes] = await Promise.all([
					axios.get(`/courses/${courseId}/questions`),
					axios.get(`/courses/${courseId}/exercise-sets`),
				]);
				setQuestions(questionsRes.data as CourseQuestion[]);
				setSets((setsRes.data as ExerciseSet[]).map(normalizeExerciseSet));
			} catch (error) {
				console.error("演習問題データの取得に失敗:", error);
				setErrorMessage("演習問題データの取得に失敗しました");
			} finally {
				setInitialLoading(false);
			}
		};
		fetchData();
	}, [courseId]);

	useEffect(() => {
		if (!selectedSet) return;
		setSetTitle(selectedSet.title ?? "");
		setSetDescription(selectedSet.description ?? "");
		setSetDueDate(selectedSet.due_date ? new Date(selectedSet.due_date).toISOString().slice(0, 16) : "");
		setSelectedQuestionIds(selectedSet.question_ids ?? []);
	}, [selectedSet]);

	const filteredQuestions = useMemo(() => {
		const keyword = questionKeyword.trim().toLowerCase();
		const keywordMatched = !keyword
			? questions
			: questions.filter((q) => {
					const tags = q.tag_names.join(" ").toLowerCase();
					return (
						q.title.toLowerCase().includes(keyword) ||
						q.question_type.toLowerCase().includes(keyword) ||
						tags.includes(keyword)
					);
				});

		if (questionViewMode === "selected") {
			return keywordMatched.filter((q) => selectedQuestionIds.includes(q.id));
		}
		if (questionViewMode === "unselected") {
			return keywordMatched.filter((q) => !selectedQuestionIds.includes(q.id));
		}
		return keywordMatched;
	}, [questions, questionKeyword, questionViewMode, selectedQuestionIds]);

	const questionMap = useMemo(() => {
		return new Map(questions.map((question) => [question.id, question]));
	}, [questions]);

	const selectedQuestions = useMemo(() => {
		return selectedQuestionIds
			.map((id) => questionMap.get(id))
			.filter((question): question is CourseQuestion => question != null);
	}, [selectedQuestionIds, questionMap]);

	const displayedQuestions = useMemo(
		() => filteredQuestions.slice(0, questionDisplayLimit),
		[filteredQuestions, questionDisplayLimit],
	);

	const normalizeDueDateForInput = (dueDate: string | null | undefined) => {
		return dueDate ? new Date(dueDate).toISOString().slice(0, 16) : "";
	};

	const baselineSnapshot = useMemo(() => {
		if (!selectedSet) {
			return {
				title: "",
				description: "",
				dueDate: "",
				questionIds: [],
			};
		}
		return {
			title: selectedSet.title ?? "",
			description: selectedSet.description ?? "",
			dueDate: normalizeDueDateForInput(selectedSet.due_date),
			questionIds: selectedSet.question_ids ?? [],
		};
	}, [selectedSet]);

	const currentSnapshot = useMemo(
		() => ({
			title: setTitle,
			description: setDescription,
			dueDate: setDueDate,
			questionIds: selectedQuestionIds,
		}),
		[setTitle, setDescription, setDueDate, selectedQuestionIds],
	);

	const hasUnsavedChanges = useMemo(() => {
		return JSON.stringify(currentSnapshot) !== JSON.stringify(baselineSnapshot);
	}, [currentSnapshot, baselineSnapshot]);

	const handleCreateSet = () => {
		if (
			hasUnsavedChanges &&
			!confirm("未保存の変更があります。破棄して新しいセットを作成しますか？")
		) {
			return;
		}
		setSelectedSetId(null);
		setSetTitle("");
		setSetDescription("");
		setSetDueDate("");
		setSelectedQuestionIds([]);
		setErrorMessage("");
	};

	const handleSelectSet = (setId: number) => {
		if (
			hasUnsavedChanges &&
			!confirm("未保存の変更があります。破棄して別のセットに切り替えますか？")
		) {
			return;
		}
		setSelectedSetId(setId);
	};

	const toggleQuestion = (questionId: number, checked: boolean) => {
		if (checked) {
			setSelectedQuestionIds((prev) => [...prev, questionId]);
		} else {
			setSelectedQuestionIds((prev) => prev.filter((id) => id !== questionId));
		}
	};

	const handleSelectAllFiltered = () => {
		const filteredIds = filteredQuestions.map((question) => question.id);
		setSelectedQuestionIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
	};

	const handleClearFiltered = () => {
		const filteredIdSet = new Set(filteredQuestions.map((question) => question.id));
		setSelectedQuestionIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
	};

	const moveSelectedQuestion = (sourceId: number, targetId: number) => {
		setSelectedQuestionIds((prev) => {
			const sourceIndex = prev.indexOf(sourceId);
			const targetIndex = prev.indexOf(targetId);
			if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
				return prev;
			}
			const next = [...prev];
			next.splice(sourceIndex, 1);
			next.splice(targetIndex, 0, sourceId);
			return next;
		});
	};

	const toggleQuestionPreview = (questionId: number) => {
		setExpandedQuestionIds((prev) =>
			prev.includes(questionId)
				? prev.filter((id) => id !== questionId)
				: [...prev, questionId],
		);
	};

	const getQuestionPreview = (contentData: Record<string, unknown>) => {
		const questionText =
			typeof contentData.question === "string"
				? contentData.question
				: typeof contentData.prompt === "string"
					? contentData.prompt
					: typeof contentData.statement === "string"
						? contentData.statement
					: typeof contentData.description === "string"
						? contentData.description
						: "";

		const choices = Array.isArray(contentData.choices)
			? contentData.choices
					.map((choice) => {
						if (typeof choice === "string") return choice;
						if (
							typeof choice === "object" &&
							choice !== null &&
							"choice_text" in choice &&
							typeof (choice as { choice_text?: unknown }).choice_text === "string"
						) {
							return (choice as { choice_text: string }).choice_text;
						}
						return "";
					})
					.filter(Boolean)
			: [];

		return {
			questionText: questionText.trim(),
			choices,
			fallbackText: JSON.stringify(contentData, null, 2).slice(0, 400),
		};
	};

	const handleDuplicateSet = async () => {
		if (!selectedSet) return;
		setDuplicating(true);
		setErrorMessage("");
		try {
			const payload = {
				title: `${selectedSet.title}（コピー）`,
				description: selectedSet.description ?? null,
				question_ids: selectedSet.question_ids ?? [],
				due_date: selectedSet.due_date ?? null,
			};
			const res = await axios.post(`/courses/${courseId}/exercise-sets`, payload);
			const created = normalizeExerciseSet(res.data as ExerciseSet);
			setSets((prev) => [created, ...prev]);
			setSelectedSetId(created.id);
		} catch (error) {
			console.error("演習セット複製失敗:", error);
			setErrorMessage("演習セットの複製に失敗しました");
		} finally {
			setDuplicating(false);
		}
	};

	const handleSaveSet = async () => {
		if (!setTitle.trim()) {
			setErrorMessage("セット名を入力してください");
			return;
		}
		setLoading(true);
		setErrorMessage("");
		try {
			const payload = {
				title: setTitle.trim(),
				description: setDescription.trim() || null,
				question_ids: selectedQuestionIds,
				due_date: setDueDate ? new Date(setDueDate).toISOString() : null,
			};

			if (selectedSetId) {
				const res = await axios.put(`/exercise-sets/${selectedSetId}`, payload);
				const updated = normalizeExerciseSet(res.data as ExerciseSet);
				setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
			} else {
				const res = await axios.post(`/courses/${courseId}/exercise-sets`, payload);
				const created = normalizeExerciseSet(res.data as ExerciseSet);
				setSets((prev) => [created, ...prev]);
				setSelectedSetId(created.id);
			}
			setShowSuccessDialog(true);
			setTimeout(() => setShowSuccessDialog(false), 1800);
		} catch (error) {
			console.error("演習セット保存失敗:", error);
			setErrorMessage("演習セットの保存に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const handleDeleteSet = async () => {
		if (selectedSetId == null) return;
		const set = sets.find((s) => s.id === selectedSetId);
		if (!set) return;
		if (!confirm(`「${set.title}」を削除しますか？この操作は取り消せません。`)) return;
		setSetDeleting(selectedSetId);
		setErrorMessage("");
		try {
			await axios.delete(`/exercise-sets/${selectedSetId}`);
			setSets((prev) => prev.filter((s) => s.id !== selectedSetId));
			setSelectedSetId(null);
			setSetTitle("");
			setSetDescription("");
			setSetDueDate("");
			setSelectedQuestionIds([]);
		} catch (error) {
			console.error("演習セット削除失敗:", error);
			setErrorMessage("演習セットの削除に失敗しました");
		} finally {
			setSetDeleting(null);
		}
	};

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!hasUnsavedChanges) return;
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [hasUnsavedChanges]);

	useEffect(() => {
		if (selectedSetId == null) return;
		editorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
	}, [selectedSetId]);

	if (initialLoading) {
		return (
			<div className="flex items-center justify-center py-8">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{errorMessage && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{errorMessage}</AlertDescription>
				</Alert>
			)}

			<Card>
				<CardHeader>
					<CardTitle className="text-xl">演習セット編集</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="text-sm text-gray-600">
						コース単位で演習セットを管理し、問題を複数選択して構成します。
					</div>

					<div className="space-y-6">
						<div className="rounded-lg border bg-slate-50/70 p-4 space-y-3">
							<div className="flex items-center gap-2">
								<FolderKanban className="h-4 w-4 text-slate-600" />
								<h3 className="text-sm font-semibold text-gray-800">1. 問題セット選択</h3>
							</div>
							<p className="text-xs text-gray-500">
								まず編集対象のセットを選びます。未作成なら新規作成モードに切り替えます。
							</p>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								<div className="space-y-1">
									<p className="text-xs text-gray-500">編集するセット</p>
									<Select
										value={selectedSetId != null ? String(selectedSetId) : "__new__"}
										onValueChange={(value) => {
											if (value === "__new__") {
												handleCreateSet();
												return;
											}
											handleSelectSet(Number(value));
										}}
									>
										<SelectTrigger>
											<SelectValue placeholder="問題セットを選択" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__new__">新しいセットを作成</SelectItem>
											{sets.map((set) => (
												<SelectItem key={set.id} value={String(set.id)}>
													{set.title}（{set.question_ids?.length ?? 0}問）
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<p className="text-xs text-gray-500">セット情報</p>
									<div className="h-10 px-3 rounded-md border bg-muted/20 flex items-center text-sm text-gray-600">
										{selectedSet
											? `ID: ${selectedSet.id} / 問題数: ${selectedSet.question_ids?.length ?? 0}`
											: "新規作成モード"}
									</div>
								</div>
							</div>
						</div>

						<div ref={editorSectionRef} className="rounded-lg border bg-white p-4 space-y-4">
							<div className="flex items-center gap-2">
								<Settings2 className="h-4 w-4 text-slate-600" />
								<h3 className="text-sm font-semibold text-gray-800">
									2. セット基本情報
								</h3>
							</div>
							<p className="text-xs text-gray-500">
								セット名、期限、説明などの基本情報を編集します。
							</p>
							{selectedSet && (
								<div className="flex flex-wrap items-center gap-2">
									<Button variant="outline" size="sm" asChild>
										<Link
											href={`/t/course/${courseId}/exercise-set-preview/${selectedSet.id}`}
											target="_blank"
											rel="noopener noreferrer"
										>
											<Eye className="h-4 w-4 mr-2" />
											学習者と同じUIでプレビュー
										</Link>
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={handleDuplicateSet}
										disabled={duplicating}
									>
										<Copy className="h-4 w-4 mr-2" />
										{duplicating ? "複製中..." : "セットを複製"}
									</Button>
									<Button
										variant="destructive"
										size="sm"
										onClick={handleDeleteSet}
										disabled={setDeleting !== null}
									>
										{setDeleting === selectedSet.id ? (
											<span className="flex items-center gap-2">
												<span className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
												削除中...
											</span>
										) : (
											<>
												<Trash2 className="h-4 w-4 mr-2" />
												セットを削除
											</>
										)}
									</Button>
								</div>
							)}
							<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
								<div>
									<label className="text-sm font-medium mb-1 block">セット名</label>
									<Input
										value={setTitle ?? ""}
										onChange={(e) => setSetTitle(e.target.value)}
										placeholder="例: 第1回確認テスト"
									/>
								</div>
								<div>
									<label className="text-sm font-medium mb-1 block">回答期限 (任意)</label>
									<Input
										type="datetime-local"
										value={setDueDate ?? ""}
										onChange={(e) => setSetDueDate(e.target.value)}
									/>
								</div>
							</div>

							<div>
								<label className="text-sm font-medium mb-1 block">説明</label>
								<Textarea
									value={setDescription ?? ""}
									onChange={(e) => setSetDescription(e.target.value)}
									className="min-h-[90px]"
								/>
							</div>
						</div>

						<div className="rounded-lg border bg-emerald-50/40 p-4 space-y-3">
							<div className="flex items-center gap-2">
								<ListChecks className="h-4 w-4 text-emerald-700" />
								<h3 className="text-sm font-semibold text-gray-800">
									3. セットに含める問題
								</h3>
							</div>
							<p className="text-xs text-gray-500">
								検索・絞り込みで問題を選択し、必要ならドラッグで順序を調整します。
							</p>
							<div>
								<div className="flex flex-wrap items-center justify-between gap-2 mb-2">
									<label className="text-sm font-medium">セットに含める問題</label>
									<div className="flex items-center gap-2">
										<Button
											type="button"
											size="sm"
											variant={questionViewMode === "all" ? "default" : "outline"}
											onClick={() => setQuestionViewMode("all")}
										>
											すべて
										</Button>
										<Button
											type="button"
											size="sm"
											variant={
												questionViewMode === "selected" ? "default" : "outline"
											}
											onClick={() => setQuestionViewMode("selected")}
										>
											選択済み
										</Button>
										<Button
											type="button"
											size="sm"
											variant={
												questionViewMode === "unselected" ? "default" : "outline"
											}
											onClick={() => setQuestionViewMode("unselected")}
										>
											未選択
										</Button>
									</div>
								</div>
								<div className="mb-2">
									<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
										<div className="md:col-span-2">
											<Input
												value={questionKeyword ?? ""}
												onChange={(e) => setQuestionKeyword(e.target.value)}
												placeholder="ここで問題を検索（問題名 / タグ / タイプ）"
												className="h-10"
											/>
										</div>
										<div>
											<Select
												value={String(questionDisplayLimit)}
												onValueChange={(value) =>
													setQuestionDisplayLimit(Number(value))
												}
											>
												<SelectTrigger className="h-10 w-full">
													<SelectValue placeholder="表示件数" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="10">10件表示</SelectItem>
													<SelectItem value="20">20件表示</SelectItem>
													<SelectItem value="50">50件表示</SelectItem>
													<SelectItem value="100">100件表示</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
								</div>
								<div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs text-gray-500">
									<span>
										選択中 {selectedQuestionIds.length} 件 / 一覧 {filteredQuestions.length} 件
									</span>
									<div className="flex items-center gap-2">
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={handleSelectAllFiltered}
											disabled={filteredQuestions.length === 0}
										>
											表示中を全選択
										</Button>
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={handleClearFiltered}
											disabled={filteredQuestions.length === 0}
										>
											表示中を解除
										</Button>
									</div>
								</div>
								{selectedQuestions.length > 0 && (
									<div className="mb-3 rounded-md border bg-muted/30 p-2">
										<p className="text-xs font-medium text-gray-600 mb-2">
											選択中の問題（ドラッグで順序変更）
										</p>
										<div className="flex flex-wrap gap-1.5">
											{selectedQuestions.map((question) => (
												<button
													key={`selected-${question.id}`}
													type="button"
													onClick={() => toggleQuestion(question.id, false)}
													draggable
													onDragStart={() => setDraggingQuestionId(question.id)}
													onDragOver={(event) => event.preventDefault()}
													onDrop={(event) => {
														event.preventDefault();
														if (draggingQuestionId == null) return;
														moveSelectedQuestion(draggingQuestionId, question.id);
														setDraggingQuestionId(null);
													}}
													onDragEnd={() => setDraggingQuestionId(null)}
													className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-xs hover:bg-gray-50"
												>
													<GripVertical className="h-3 w-3 text-gray-400" />
													<span className="max-w-[180px] truncate">{question.title}</span>
													<span className="text-gray-400">×</span>
												</button>
											))}
										</div>
									</div>
								)}
								<div className="border rounded-md max-h-[640px] overflow-auto">
									{displayedQuestions.length === 0 ? (
										<div className="p-4 text-sm text-gray-500">該当する問題がありません。</div>
									) : (
										displayedQuestions.map((q) => {
											const checked = selectedQuestionIds.includes(q.id);
											const isPreviewOpen = expandedQuestionIds.includes(q.id);
											const preview = getQuestionPreview(q.content_data ?? {});
											return (
												<div
													key={q.id}
													className="border-b last:border-b-0"
												>
													<div className="flex items-start gap-3 p-4 hover:bg-gray-50">
														<Checkbox
															checked={checked}
															onCheckedChange={(value) => toggleQuestion(q.id, Boolean(value))}
														/>
														<div className="min-w-0 flex-1">
															<div className="flex items-start justify-between gap-2">
																<div className="min-w-0">
																	<div className="font-medium text-base leading-relaxed">
																		{q.title}
																	</div>
																	<div className="text-xs text-gray-500 mt-1">
																		type: {q.question_type}
																		{q.difficulty != null
																			? ` / difficulty: ${q.difficulty}`
																			: ""}
																	</div>
																</div>
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	className="h-7 px-2 text-xs"
																	onClick={() => toggleQuestionPreview(q.id)}
																>
																	内容を見る
																	{isPreviewOpen ? (
																		<ChevronUp className="h-4 w-4 ml-1" />
																	) : (
																		<ChevronDown className="h-4 w-4 ml-1" />
																	)}
																</Button>
															</div>
															<div className="flex gap-1 flex-wrap mt-1">
																{q.tag_names.map((tag) => (
																	<Badge key={`${q.id}-${tag}`} variant="secondary">
																		{tag}
																	</Badge>
																))}
															</div>
														</div>
													</div>
													{isPreviewOpen && (
														<div className="px-3 pb-3 pl-10 text-sm text-gray-700 space-y-2">
															<MathJaxSetup>
																<div className="rounded-md bg-muted/40 p-3">
																	<p className="text-xs font-semibold text-gray-500 mb-1">
																		問題文
																	</p>
																	<div className="whitespace-pre-wrap break-words">
																		<MathJax
																			text={
																				preview.questionText ||
																				"問題文キーが見つからないため、下に content_data の要約を表示しています。"
																			}
																		/>
																	</div>
																</div>
																{!preview.questionText && (
																	<div className="rounded-md bg-muted/30 p-3">
																		<p className="text-xs font-semibold text-gray-500 mb-1">
																			content_data 要約
																		</p>
																		<pre className="text-xs whitespace-pre-wrap break-words overflow-auto">
																			{preview.fallbackText}
																		</pre>
																	</div>
																)}
																{preview.choices.length > 0 && (
																	<div className="rounded-md bg-muted/30 p-3">
																		<p className="text-xs font-semibold text-gray-500 mb-1">
																			選択肢
																		</p>
																		<ul className="list-disc pl-5 space-y-1">
																			{preview.choices.map((choice, idx) => (
																				<li
																					key={`${q.id}-choice-${idx}`}
																					className="break-words"
																				>
																					<MathJax text={choice} />
																				</li>
																			))}
																		</ul>
																	</div>
																)}
															</MathJaxSetup>
														</div>
													)}
												</div>
											);
										})
									)}
								</div>
								{filteredQuestions.length > displayedQuestions.length && (
									<p className="mt-2 text-xs text-muted-foreground">
										表示件数により一部のみ表示中です（全 {filteredQuestions.length} 件）。
									</p>
								)}
							</div>
						</div>

						<div className="flex justify-end">
							<Button onClick={handleSaveSet} disabled={loading}>
								<Save className="h-4 w-4 mr-2" />
								{loading
									? "保存中..."
									: selectedSetId == null
										? "演習セットを新規作成"
										: "演習セットを更新"}
							</Button>
						</div>
						{hasUnsavedChanges && (
							<p className="text-xs text-amber-600 text-right">
								未保存の変更があります
							</p>
						)}
					</div>
				</CardContent>
			</Card>

			<Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader className="text-center">
						<div className="mx-auto mb-4">
							<CheckCircle className="h-16 w-16 text-green-500" />
						</div>
						<DialogTitle className="text-xl">保存完了</DialogTitle>
						<DialogDescription>
							演習セットを更新しました。
						</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default FlowContentEditor;
