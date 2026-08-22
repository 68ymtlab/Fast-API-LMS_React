"use client";

import {
	AlertCircle,
	ArrowLeft,
	ArrowRight,
	CheckCircle,
	Lightbulb,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { MathJax, MathJaxSetup } from "@/components/shared/MathJax";
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
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import axios from "@/lib/axios";
import TcAccessTime from "@/components/tc_access_time";

interface ExerciseSet {
	id: number;
	title: string;
	description?: string | null;
	course_id: number;
	question_ids: number[];
	due_date?: string | null;
}

interface CourseQuestion {
	id: number;
	title: string;
	question_type: string;
	difficulty: number | null;
	is_active: boolean;
	content_data: Record<string, unknown>;
	tag_names: string[];
}

type AnswerStatus = "correct" | "incorrect" | "unanswered";

export default function StudentExerciseSetPage() {
	const params = useParams();
	const courseId = params.course_id as string;
	const weekId = params.week_id as string;
	const setId = params.set_id as string;

	const [setInfo, setSetInfo] = useState<ExerciseSet | null>(null);
	const [questions, setQuestions] = useState<CourseQuestion[]>([]);
	const [loading, setLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState("");
	const [currentPage, setCurrentPage] = useState(1);
	const [answerInput, setAnswerInput] = useState<Record<string, string | number>>({});
	const [showHint, setShowHint] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
	const [pageAnswerStatus, setPageAnswerStatus] = useState<Record<number, AnswerStatus>>({});
	const [finishDialogOpen, setFinishDialogOpen] = useState(false);
	const [finishSubmitting, setFinishSubmitting] = useState(false);
	const [finishError, setFinishError] = useState("");
	const [finishedScore, setFinishedScore] = useState<number | null>(null);
	const [sessionId, setSessionId] = useState<number | null>(null);
	const [activeNumericField, setActiveNumericField] = useState<string | null>(null);
	const [isNumpadOpen, setIsNumpadOpen] = useState(false);
	const [numpadPosition, setNumpadPosition] = useState<{ x: number; y: number } | null>(
		null,
	);
	const [numpadSize, setNumpadSize] = useState({ width: 232, height: 248 });
	const [isNumpadDragging, setIsNumpadDragging] = useState(false);
	const [isNumpadResizing, setIsNumpadResizing] = useState(false);
	const multiNumericInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
	const numpadRef = useRef<HTMLDivElement | null>(null);
	const numpadDragOffsetRef = useRef({ x: 0, y: 0 });
	const numpadResizeStartRef = useRef({
		mouseX: 0,
		mouseY: 0,
		width: 232,
		height: 248,
	});

	const router = useRouter();

	const orderedQuestions = useMemo(() => {
		if (!setInfo?.question_ids?.length) return [];
		const byId = new Map(questions.map((q) => [q.id, q]));
		return setInfo.question_ids
			.map((id) => byId.get(id))
			.filter((q): q is CourseQuestion => q != null);
	}, [setInfo, questions]);

	const totalPages = orderedQuestions.length;
	const currentQuestion = orderedQuestions[currentPage - 1] ?? null;
	const content = currentQuestion?.content_data as Record<string, unknown> | undefined;

	const isPastDue = useMemo(() => {
		if (!setInfo?.due_date) return false;
		return new Date(setInfo.due_date) < new Date();
	}, [setInfo]);

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setErrorMessage("");
			const [setRes, questionsRes, sessionRes] = await Promise.all([
				axios.get<ExerciseSet>(`/exercise-sets/${setId}`),
				axios.get<CourseQuestion[]>(`/courses/${courseId}/questions`),
				axios.post(`/exercise-sets/${setId}/sessions`, {}).catch(() => null),
			]);
			setSetInfo(setRes.data);
			setQuestions(questionsRes.data ?? []);
			if (sessionRes?.data?.id) {
				setSessionId(sessionRes.data.id);
			}
		} catch (e) {
			console.error(e);
			setErrorMessage("演習セットまたは問題の取得に失敗しました");
		} finally {
			setLoading(false);
		}
	}, [courseId, setId]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	useEffect(() => {
		setAnswerInput({});
		setShowHint(false);
		setSubmitted(false);
		setIsCorrect(null);
		setIsNumpadOpen(false);
		setActiveNumericField(null);
	}, [currentPage, currentQuestion?.id]);

	useEffect(() => {
		if (totalPages <= 0) return;
		setPageAnswerStatus((prev) => {
			const next = { ...prev };
			for (let i = 1; i <= totalPages; i++) {
				if (!next[i]) next[i] = "unanswered";
			}
			return next;
		});
	}, [totalPages]);

	useEffect(() => {
		if (!isNumpadDragging && !isNumpadResizing) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (isNumpadDragging) {
				if (!numpadRef.current) return;
				const width = numpadRef.current.offsetWidth;
				const height = numpadRef.current.offsetHeight;
				const nextX = e.clientX - numpadDragOffsetRef.current.x;
				const nextY = e.clientY - numpadDragOffsetRef.current.y;
				setNumpadPosition({
					x: Math.max(8, Math.min(nextX, window.innerWidth - width - 8)),
					y: Math.max(8, Math.min(nextY, window.innerHeight - height - 8)),
				});
			}

			if (isNumpadResizing) {
				const diffX = e.clientX - numpadResizeStartRef.current.mouseX;
				const diffY = e.clientY - numpadResizeStartRef.current.mouseY;
				const nextWidth = Math.max(
					200,
					Math.min(numpadResizeStartRef.current.width + diffX, 420),
				);
				const nextHeight = Math.max(
					220,
					Math.min(numpadResizeStartRef.current.height + diffY, 560),
				);
				setNumpadSize({ width: nextWidth, height: nextHeight });
			}
		};

		const handleMouseUp = () => {
			setIsNumpadDragging(false);
			setIsNumpadResizing(false);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isNumpadDragging, isNumpadResizing]);

	const checkAnswer = useCallback(() => {
		if (!currentQuestion || !content) return;
		const type = currentQuestion.question_type;
		let result = false;

		if (type === "mcq") {
			const answer = content.answer as string;
			const selected = answerInput.choice as string | undefined;
			result = selected === answer;
		} else if (type === "numeric") {
			const answers = content.answers as number[];
			const tolerance = (content.tolerance as number) ?? 0;
			const raw = answerInput.value as string | undefined;
			const num = raw != null && raw !== "" ? Number.parseFloat(String(raw).trim()) : NaN;
			result = answers.some(
				(a) => !Number.isNaN(num) && Math.abs(num - a) <= tolerance,
			);
		} else if (type === "multiple_numeric") {
			const blanks = (content.blanks as Array<{ blank_id: string; answers: number[]; tolerance?: number }>) ?? [];
			let allCorrect = true;
			for (const blank of blanks) {
				const key = `blank_${blank.blank_id}`;
				const raw = answerInput[key] as string | undefined;
				const num = raw != null && raw !== "" ? Number.parseFloat(String(raw).trim()) : NaN;
				const tol = blank.tolerance ?? 0;
				const ok = blank.answers.some((a) => !Number.isNaN(num) && Math.abs(num - a) <= tol);
				if (!ok) allCorrect = false;
			}
			result = allCorrect;
		} else if (type === "descriptive") {
			const correct = (content.answer as string)?.trim().toLowerCase();
			const user = (answerInput.value as string)?.trim().toLowerCase();
			result = user === correct;
		} else {
			result = false;
		}
		setIsCorrect(result);
		setPageAnswerStatus((prev) => ({
			...prev,
			[currentPage]: result ? "correct" : "incorrect",
		}));
		setSubmitted(true);

		if (sessionId && currentQuestion) {
			axios.post(`/exercise-sessions/${sessionId}/answers`, {
				question_id: currentQuestion.id,
				answer_data: answerInput,
				is_correct: result,
			}).catch((e) => console.error("Failed to save answer", e));
		}
	}, [currentQuestion, content, answerInput, currentPage, isPastDue, sessionId]);

	const setSingleAnswer = (key: string, value: string | number) => {
		setAnswerInput((prev) => ({ ...prev, [key]: value }));
	};

	const normalizeNumericInput = (value: string) =>
		value
			.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
			.replace("．", ".")
			.replace(/[－ー]/g, "-")
			.replace(/[，、]/g, ",")
			.replace(/,/g, "");

	const openNumpadForField = (fieldKey: string) => {
		setActiveNumericField(fieldKey);
		setIsNumpadOpen(true);
		if (!numpadPosition) {
			setNumpadPosition({
				x: Math.max(8, window.innerWidth - 260),
				y: Math.max(8, window.innerHeight - 340),
			});
		}
	};

	const handleNumpadDragStart = (e: ReactMouseEvent) => {
		if (!numpadRef.current) return;
		const rect = numpadRef.current.getBoundingClientRect();
		numpadDragOffsetRef.current = {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
		};
		setIsNumpadDragging(true);
	};

	const handleNumpadResizeStart = (e: ReactMouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		numpadResizeStartRef.current = {
			mouseX: e.clientX,
			mouseY: e.clientY,
			width: numpadSize.width,
			height: numpadSize.height,
		};
		setIsNumpadResizing(true);
	};

	const handleNumpadEnter = () => {
		if (currentQuestion?.question_type !== "multiple_numeric") return;
		const blanks =
			(content?.blanks as Array<{ blank_id: string; label: string }> | undefined) ?? [];
		if (blanks.length === 0) return;
		const currentIndex = blanks.findIndex(
			(blank) => `blank_${blank.blank_id}` === activeNumericField,
		);
		if (currentIndex >= 0 && currentIndex < blanks.length - 1) {
			const next = blanks[currentIndex + 1];
			setActiveNumericField(`blank_${next.blank_id}`);
			multiNumericInputRefs.current[next.blank_id]?.focus();
		}
	};

	const handleNumpadInput = (key: string) => {
		let targetField = activeNumericField;
		if (!targetField && currentQuestion?.question_type === "numeric") {
			targetField = "value";
		}
		if (!targetField) {
			const blanks =
				(content?.blanks as Array<{ blank_id: string; label: string }> | undefined) ??
				[];
			if (blanks.length > 0) {
				targetField = `blank_${blanks[0].blank_id}`;
				setActiveNumericField(targetField);
				multiNumericInputRefs.current[blanks[0].blank_id]?.focus();
			}
		}
		if (!targetField) return;

		const currentValue = String(answerInput[targetField] ?? "");
		let nextValue = currentValue;

		if (key === "clear") {
			nextValue = "";
		} else if (key === "backspace") {
			nextValue = currentValue.slice(0, -1);
		} else if (key === ".") {
			if (!currentValue.includes(".")) {
				nextValue = currentValue === "" || currentValue === "-" ? `${currentValue}0.` : `${currentValue}.`;
			}
		} else if (key === "-") {
			nextValue = currentValue.startsWith("-")
				? currentValue.slice(1)
				: `-${currentValue}`;
		} else if (/^[0-9]$/.test(key)) {
			nextValue = `${currentValue}${key}`;
		}

		setSingleAnswer(targetField, normalizeNumericInput(nextValue));
	};

	const unansweredCount = useMemo(() => {
		let answered = 0;
		for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
			if (
				pageAnswerStatus[pageNum] === "correct" ||
				pageAnswerStatus[pageNum] === "incorrect"
			) {
				answered++;
			}
		}
		return totalPages - answered;
	}, [pageAnswerStatus, totalPages]);

	const finishSession = async () => {
		if (!sessionId) return;
		setFinishSubmitting(true);
		setFinishError("");
		try {
			const correctCount = Object.values(pageAnswerStatus).filter((s) => s === "correct").length;
			const score = totalPages > 0 ? (correctCount / totalPages) * 100 : 0;

			await axios.put(`/exercise-sessions/${sessionId}/finish`, { score });
			setFinishedScore(Math.round(score));
		} catch (e) {
			console.error(e);
			setFinishError("成績の提出に失敗しました。通信環境を確認して、もう一度お試しください。");
		} finally {
			setFinishSubmitting(false);
		}
	};

	if (loading) {
		return (
			<div className="container mx-auto py-8 px-4 flex items-center justify-center">
				<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
			</div>
		);
	}

	if (errorMessage || !setInfo) {
		return (
			<div className="container mx-auto py-8 px-4 max-w-2xl">
				{errorMessage && (
					<Alert variant="destructive" className="mb-6">
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>{errorMessage}</AlertDescription>
					</Alert>
				)}
				<Button variant="outline" asChild>
					<Link href={`/weekflows/${courseId}/${weekId}`}>演習問題一覧に戻る</Link>
				</Button>
			</div>
		);
	}

	if (totalPages === 0) {
		return (
			<div className="container mx-auto py-8 px-4 max-w-2xl">
				<Alert className="mb-6">
					<AlertDescription>このセットには問題が含まれていません。</AlertDescription>
				</Alert>
				<Button variant="outline" asChild>
					<Link href={`/weekflows/${courseId}/${weekId}`}>演習問題一覧に戻る</Link>
				</Button>
			</div>
		);
	}

	const questionText = (content?.question as string) ?? "";
	const hintText = (content?.hint as string) ?? "";
	const answerComment = (content?.answer_comment as string) ?? "";

	return (
		<MathJaxSetup>
			<TcAccessTime 
				page="student_weekflow_set" 
				details={JSON.stringify({ course_id: courseId, week_id: weekId, set_id: setId, current_page: currentPage, current_question_id: currentQuestion?.id })}
			/>
			<div className="container mx-auto pt-4 pb-6 px-4 max-w-5xl space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-2 px-1">
					<Button variant="ghost" size="sm" asChild className="text-gray-600 hover:text-gray-900 h-8">
						<Link href={`/weekflows/${courseId}/${weekId}`} className="flex items-center gap-2">
							<ArrowLeft className="h-4 w-4" />
							演習問題一覧に戻る
						</Link>
					</Button>
					<div className="text-xs text-gray-500">
						{setInfo.due_date
							? `回答期限: ${new Date(setInfo.due_date).toLocaleString("ja-JP")}`
							: "回答期限: なし"}
					</div>
				</div>

				<Card className="border-gray-200">
					<CardContent className="pt-5">
						<div className="flex justify-center gap-2 flex-wrap">
							{Array.from({ length: totalPages }, (_, i) => {
								const pageNum = i + 1;
								const status = pageAnswerStatus[pageNum] || "unanswered";
								return (
									<button
										key={pageNum}
										onClick={() => setCurrentPage(pageNum)}
										className={`
											w-9 h-9 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105
											${pageNum === currentPage ? "ring-2 ring-primary ring-offset-2" : ""}
											${status === "correct"
												? "bg-green-500 text-white hover:bg-green-600"
												: status === "incorrect"
													? "bg-red-500 text-white hover:bg-red-600"
													: "bg-gray-200 hover:bg-gray-300 text-gray-700"}
										`}
									>
										{pageNum}
									</button>
								);
							})}
						</div>
						<div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
							<div
								className="bg-primary h-2.5 rounded-full transition-all duration-300"
								style={{ width: `${(currentPage / Math.max(totalPages, 1)) * 100}%` }}
							/>
						</div>
						{isPastDue && (
							<Alert variant="destructive" className="mt-4">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>
									回答期限（{new Date(setInfo.due_date!).toLocaleString("ja-JP")}）を過ぎているため、解答できません。
								</AlertDescription>
							</Alert>
						)}
					</CardContent>
				</Card>

				<Card className="shadow-sm border-gray-200">
					<CardHeader className="pb-4">
						<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
							<CardTitle className="text-xl font-bold text-gray-800">問題 {currentPage}</CardTitle>
							{hintText && (
								<Button
									variant={showHint ? "secondary" : "outline"}
									size="sm"
									onClick={() => setShowHint(!showHint)}
									className="gap-2 shrink-0 rounded-full"
								>
									<Lightbulb className={`h-4 w-4 ${showHint ? "text-yellow-500 fill-yellow-500" : "text-gray-500"}`} />
									{showHint ? "ヒントを隠す" : "ヒントを見る"}
								</Button>
							)}
						</div>
						<CardDescription className="text-base mt-2">
							{currentQuestion?.title ?? "問題"}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
							<div className="prose prose-sm max-w-none">
								<MathJax text={questionText} />
							</div>
						</div>

						{showHint && hintText && (
							<Alert>
								<Lightbulb className="h-4 w-4" />
								<AlertDescription>
									<MathJax text={hintText} />
								</AlertDescription>
							</Alert>
						)}

						<div className="mt-4 rounded-2xl p-5 md:p-6 border border-stone-200 bg-stone-50">
							<div className="mb-4 flex items-center justify-between gap-2">
								<h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
									<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
									解答欄
								</h3>
								{(currentQuestion?.question_type === "numeric" ||
									currentQuestion?.question_type === "multiple_numeric") && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => {
											if (currentQuestion?.question_type === "numeric") {
												openNumpadForField("value");
												return;
											}
											const blanks =
												(content?.blanks as
													| Array<{ blank_id: string; label: string }>
													| undefined) ?? [];
											if (blanks.length > 0) {
												openNumpadForField(`blank_${blanks[0].blank_id}`);
												multiNumericInputRefs.current[blanks[0].blank_id]?.focus();
											}
										}}
									>
										数字入力
									</Button>
								)}
							</div>

							{currentQuestion?.question_type === "mcq" && (
								<div className="space-y-3">
									{((content?.choices as Array<{ choice_id: string; choice_text: string }>) ?? []).map(
										(choice) => {
											const isSelected = (answerInput.choice as string) === choice.choice_id;
											return (
												<label
													key={choice.choice_id}
													className={`flex items-center gap-4 p-4 border rounded-xl cursor-pointer transition-all duration-200 ${
														isSelected
															? "bg-gray-50 border-gray-400 ring-1 ring-gray-300"
															: "bg-white hover:bg-gray-50 border-gray-200"
													}`}
												>
													<input
														type="radio"
														name="mcq-choice"
														checked={isSelected}
														onChange={() => setSingleAnswer("choice", choice.choice_id)}
														className="h-5 w-5 text-primary focus:ring-primary border-gray-300"
													/>
													<span className="flex-1 text-base">
														<MathJax text={choice.choice_text} />
													</span>
												</label>
											);
										},
									)}
								</div>
							)}

							{currentQuestion?.question_type === "numeric" && (
								<div className="space-y-2">
									<Input
										type="text"
										inputMode="decimal"
										placeholder="数値を入力"
										value={(answerInput.value as string) ?? ""}
										onChange={(e) =>
											setSingleAnswer("value", normalizeNumericInput(e.target.value))
										}
										onFocus={() => setActiveNumericField("value")}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
											}
										}}
										autoFocus
										className="bg-white border-gray-300 text-lg py-6 rounded-xl focus-visible:ring-gray-400"
									/>
								</div>
							)}

							{currentQuestion?.question_type === "multiple_numeric" && (
								<div className="space-y-4">
									{((content?.blanks as Array<{ blank_id: string; label: string }>) ?? []).map(
										(blank, index, blanks) => (
											<div key={blank.blank_id} className="bg-white p-4 rounded-xl border border-gray-200">
												<label className="text-base font-bold text-gray-700 block mb-2">{blank.label}</label>
												<Input
													ref={(el) => {
														multiNumericInputRefs.current[blank.blank_id] = el;
													}}
													type="text"
													inputMode="decimal"
													className="bg-white border-gray-300 text-lg py-5 focus-visible:ring-gray-400"
													value={(answerInput[`blank_${blank.blank_id}`] as string) ?? ""}
													onChange={(e) => {
														setSingleAnswer(
															`blank_${blank.blank_id}`,
															normalizeNumericInput(e.target.value),
														);
													}}
													onFocus={() =>
														setActiveNumericField(`blank_${blank.blank_id}`)
													}
													onKeyDown={(e) => {
														if (e.key !== "Enter") return;
														e.preventDefault();
														const next = blanks[index + 1];
														if (next) {
															multiNumericInputRefs.current[next.blank_id]?.focus();
															setActiveNumericField(`blank_${next.blank_id}`);
															return;
														}
													}}
													autoFocus={index === 0}
												/>
											</div>
										),
									)}
								</div>
							)}

							{currentQuestion?.question_type === "descriptive" && (
								<Textarea
									placeholder="解答を入力"
									rows={5}
									value={(answerInput.value as string) ?? ""}
									onChange={(e) => setSingleAnswer("value", e.target.value)}
									className="bg-white border-gray-300 rounded-xl text-base p-4 focus-visible:ring-gray-400"
								/>
							)}

						</div>
						<div className="pt-4 mt-2 border-t border-gray-200 flex justify-end">
							<Button
								onClick={checkAnswer}
								disabled={submitted || isPastDue}
								size="sm"
								className="px-5 rounded-lg font-medium shadow-none"
							>
								{isPastDue ? "期限切れ" : submitted ? "解答済み" : "解答する"}
							</Button>
						</div>
					</CardContent>
				</Card>

				{isNumpadOpen &&
					(currentQuestion?.question_type === "numeric" ||
						currentQuestion?.question_type === "multiple_numeric") && (
						<div
							ref={numpadRef}
							className="fixed z-50 rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
							style={{
								left: (numpadPosition?.x ?? 16),
								top: (numpadPosition?.y ?? 16),
								width: numpadSize.width,
								height: numpadSize.height,
								minWidth: 200,
								minHeight: 220,
								maxWidth: 420,
								maxHeight: 560,
								overflow: "auto",
							}}
						>
							<div
								className="mb-2 flex items-center justify-between cursor-move select-none"
								onMouseDown={handleNumpadDragStart}
							>
								<p className="text-xs text-gray-500">数字入力</p>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs"
									onClick={() => setIsNumpadOpen(false)}
								>
									閉じる
								</Button>
							</div>
							<div className="h-[calc(100%-2.1rem)] flex flex-col">
								<div className="grid flex-1 grid-cols-4 auto-rows-fr gap-2">
								{["7", "8", "9", "backspace", "4", "5", "6", "clear", "1", "2", "3", "-", "0", ".", "enter", ""].map(
									(key, idx) =>
										key ? (
											<Button
												key={key}
												type="button"
												variant="outline"
												size="sm"
												onClick={() =>
													key === "enter" ? handleNumpadEnter() : handleNumpadInput(key)
												}
												className="h-full min-h-9 text-sm"
											>
												{key === "backspace"
													? "⌫"
													: key === "clear"
														? "C"
														: key === "enter"
															? "Enter"
															: key}
											</Button>
										) : (
											<div key={`numpad-empty-${idx}`} />
										),
								)}
								</div>
							</div>
							<div
								className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm bg-gray-200"
								onMouseDown={handleNumpadResizeStart}
							/>
						</div>
					)}

				{submitted && (
					<Card className={`border-2 shadow-sm transition-all duration-300 ${
						isCorrect ? "border-green-500 bg-green-50/50" : "border-red-500 bg-red-50/50"
					}`}>
						<CardHeader className="pb-3">
							<CardTitle className={`text-2xl flex items-center gap-3 ${
								isCorrect ? "text-green-700" : "text-red-700"
							}`}>
								{isCorrect ? (
									<CheckCircle className="h-8 w-8 text-green-600" />
								) : (
									<XCircle className="h-8 w-8 text-red-600" />
								)}
								{isCorrect ? "正解！" : "残念！不正解"}
							</CardTitle>
						</CardHeader>
						{answerComment && (
							<CardContent>
								<div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
									<h4 className="font-bold text-gray-700 mb-2">解説</h4>
									<div className="prose prose-sm max-w-none text-gray-800">
										<MathJax text={answerComment} />
									</div>
								</div>
							</CardContent>
						)}
					</Card>
				)}

				<Card className="border-gray-200">
					<CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
						<Button
							variant="outline"
							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
							disabled={currentPage <= 1}
							className="gap-2 order-1 flex-1 sm:flex-none"
						>
							<ArrowLeft className="h-4 w-4" />
							前の問題
						</Button>
						<Button
							variant="default"
							className="bg-green-600 hover:bg-green-700 text-white shadow-md font-bold px-6 order-3 w-full sm:order-2 sm:w-auto"
							onClick={() => {
								setFinishError("");
								setFinishDialogOpen(true);
							}}
							disabled={!sessionId}
						>
							成績を提出して終了
						</Button>
						<Button
							variant="outline"
							onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
							disabled={currentPage >= totalPages}
							className="gap-2 order-2 flex-1 sm:order-3 sm:flex-none"
						>
							次の問題
							<ArrowRight className="h-4 w-4" />
						</Button>
					</CardContent>
				</Card>

				{/* 提出の確認・結果ダイアログ */}
				<Dialog
					open={finishDialogOpen}
					onOpenChange={(open) => {
						// 提出完了後は×やオーバーレイで閉じても一覧に戻る
						if (!open && finishedScore !== null) {
							router.push(`/weekflows/${courseId}/${weekId}`);
							return;
						}
						if (!finishSubmitting) setFinishDialogOpen(open);
					}}
				>
					<DialogContent className="sm:max-w-md">
						{finishedScore === null ? (
							<>
								<DialogHeader>
									<DialogTitle>成績を提出して終了しますか？</DialogTitle>
									<DialogDescription className="space-y-2 pt-2">
										提出するとこの演習セッションは終了します。
									</DialogDescription>
								</DialogHeader>
								{unansweredCount > 0 && (
									<Alert className="border-amber-300 bg-amber-50 text-amber-800">
										<AlertCircle className="h-4 w-4 !text-amber-600" />
										<AlertDescription>
											未解答の問題が {unansweredCount} 問あります。未解答のまま提出すると不正解として集計されます。
										</AlertDescription>
									</Alert>
								)}
								{finishError && (
									<Alert variant="destructive">
										<AlertCircle className="h-4 w-4" />
										<AlertDescription>{finishError}</AlertDescription>
									</Alert>
								)}
								<DialogFooter className="gap-2 sm:gap-0">
									<Button
										variant="outline"
										onClick={() => setFinishDialogOpen(false)}
										disabled={finishSubmitting}
									>
										解答に戻る
									</Button>
									<Button
										className="bg-green-600 hover:bg-green-700 text-white"
										onClick={finishSession}
										disabled={finishSubmitting}
									>
										{finishSubmitting ? "提出中..." : "提出して終了"}
									</Button>
								</DialogFooter>
							</>
						) : (
							<>
								<DialogHeader>
									<div className="flex justify-center pb-2">
										<CheckCircle className="h-14 w-14 text-green-500" />
									</div>
									<DialogTitle className="text-center">
										お疲れ様でした！
									</DialogTitle>
									<DialogDescription className="text-center pt-2">
										スコア {finishedScore} 点を記録しました。
									</DialogDescription>
								</DialogHeader>
								<DialogFooter>
									<Button
										className="w-full"
										onClick={() =>
											router.push(`/weekflows/${courseId}/${weekId}`)
										}
									>
										演習問題一覧に戻る
									</Button>
								</DialogFooter>
							</>
						)}
					</DialogContent>
				</Dialog>
			</div>
		</MathJaxSetup>
	);
}

