"use client";

import { AlertCircle, CheckCircle, Eye, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import axios from "@/lib/axios";

interface CourseQuestion {
	id: number;
	title: string;
	question_type: string;
	difficulty: number | null;
	is_active: boolean;
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
	const [loading, setLoading] = useState(false);
	const [initialLoading, setInitialLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState("");
	const [showSuccessDialog, setShowSuccessDialog] = useState(false);
	const [setDeleting, setSetDeleting] = useState<number | null>(null);

	const [questionKeyword, setQuestionKeyword] = useState("");
	const [questions, setQuestions] = useState<CourseQuestion[]>([]);
	const [sets, setSets] = useState<ExerciseSet[]>([]);

	const [selectedSetId, setSelectedSetId] = useState<number | null>(null);
	const [setTitle, setSetTitle] = useState("");
	const [setDescription, setSetDescription] = useState("");
	const [setDueDate, setSetDueDate] = useState("");
	const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);

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
				setSets(setsRes.data as ExerciseSet[]);
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
		setSetTitle(selectedSet.title);
		setSetDescription(selectedSet.description ?? "");
		setSetDueDate(selectedSet.due_date ? new Date(selectedSet.due_date).toISOString().slice(0, 16) : "");
		setSelectedQuestionIds(selectedSet.question_ids ?? []);
	}, [selectedSet]);

	const filteredQuestions = useMemo(() => {
		const keyword = questionKeyword.trim().toLowerCase();
		if (!keyword) return questions;
		return questions.filter((q) => {
			const tags = q.tag_names.join(" ").toLowerCase();
			return (
				q.title.toLowerCase().includes(keyword) ||
				q.question_type.toLowerCase().includes(keyword) ||
				tags.includes(keyword)
			);
		});
	}, [questions, questionKeyword]);

	const handleCreateSet = () => {
		setSelectedSetId(null);
		setSetTitle("");
		setSetDescription("");
		setSetDueDate("");
		setSelectedQuestionIds([]);
		setErrorMessage("");
	};

	const toggleQuestion = (questionId: number, checked: boolean) => {
		if (checked) {
			setSelectedQuestionIds((prev) => [...prev, questionId]);
		} else {
			setSelectedQuestionIds((prev) => prev.filter((id) => id !== questionId));
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
				const updated = res.data as ExerciseSet;
				setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
			} else {
				const res = await axios.post(`/courses/${courseId}/exercise-sets`, payload);
				const created = res.data as ExerciseSet;
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
					<CardTitle className="text-xl">演習セット編集（新構成）</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="flex items-center gap-3">
						<Button variant="outline" onClick={handleCreateSet}>
							<Plus className="h-4 w-4 mr-2" />
							新しいセットを作成
						</Button>
						<div className="text-sm text-gray-600">
							コース単位で演習セットを管理し、問題を複数選択して構成します。
						</div>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
						<div className="space-y-2">
							<h3 className="text-sm font-semibold text-gray-700">セット一覧</h3>
							<div className="border rounded-md max-h-[520px] overflow-auto">
								{sets.length === 0 ? (
									<div className="p-4 text-sm text-gray-500">
										まだ演習セットがありません。
									</div>
								) : (
									sets.map((set) => (
										<button
											type="button"
											key={set.id}
											onClick={() => setSelectedSetId(set.id)}
											className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-gray-50 ${selectedSetId === set.id ? "bg-gray-100" : ""}`}
										>
											<div className="font-medium">{set.title}</div>
											<div className="text-xs text-gray-500 mt-1">
												問題数: {set.question_ids?.length ?? 0}
											</div>
										</button>
									))
								)}
							</div>
						</div>

						<div className="lg:col-span-2 space-y-4">
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
										value={setTitle}
										onChange={(e) => setSetTitle(e.target.value)}
										placeholder="例: 第1回確認テスト"
									/>
								</div>
								<div>
									<label className="text-sm font-medium mb-1 block">回答期限 (任意)</label>
									<Input
										type="datetime-local"
										value={setDueDate}
										onChange={(e) => setSetDueDate(e.target.value)}
									/>
								</div>
								<div>
									<label className="text-sm font-medium mb-1 block">問題検索</label>
									<Input
										value={questionKeyword}
										onChange={(e) => setQuestionKeyword(e.target.value)}
										placeholder="問題名 / タグ / タイプ"
									/>
								</div>
							</div>

							<div>
								<label className="text-sm font-medium mb-1 block">説明</label>
								<Textarea
									value={setDescription}
									onChange={(e) => setSetDescription(e.target.value)}
									className="min-h-[90px]"
								/>
							</div>

							<div>
								<div className="flex items-center justify-between mb-2">
									<label className="text-sm font-medium">セットに含める問題</label>
									<span className="text-xs text-gray-500">
										選択中 {selectedQuestionIds.length} 件
									</span>
								</div>
								<div className="border rounded-md max-h-[340px] overflow-auto">
									{filteredQuestions.length === 0 ? (
										<div className="p-4 text-sm text-gray-500">該当する問題がありません。</div>
									) : (
										filteredQuestions.map((q) => {
											const checked = selectedQuestionIds.includes(q.id);
											return (
												<label
													key={q.id}
													className="flex items-start gap-3 p-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer"
												>
													<Checkbox
														checked={checked}
														onCheckedChange={(value) => toggleQuestion(q.id, Boolean(value))}
													/>
													<div className="min-w-0">
														<div className="font-medium text-sm">{q.title}</div>
														<div className="text-xs text-gray-500 mt-1">
															type: {q.question_type}
															{q.difficulty != null ? ` / difficulty: ${q.difficulty}` : ""}
														</div>
														<div className="flex gap-1 flex-wrap mt-1">
															{q.tag_names.map((tag) => (
																<Badge key={`${q.id}-${tag}`} variant="secondary">
																	{tag}
																</Badge>
															))}
														</div>
													</div>
												</label>
											);
										})
									)}
								</div>
							</div>

							<div className="flex justify-end">
								<Button onClick={handleSaveSet} disabled={loading}>
									<Save className="h-4 w-4 mr-2" />
									{loading ? "保存中..." : "演習セットを保存"}
								</Button>
							</div>
						</div>
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
