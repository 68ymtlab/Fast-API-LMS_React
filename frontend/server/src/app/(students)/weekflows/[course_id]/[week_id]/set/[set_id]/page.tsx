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
import { useCallback, useEffect, useMemo, useState } from "react";
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
	const [sessionId, setSessionId] = useState<number | null>(null);

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

	const finishSession = async () => {
		if (!sessionId) return;
		try {
			const correctCount = Object.values(pageAnswerStatus).filter((s) => s === "correct").length;
			const score = totalPages > 0 ? (correctCount / totalPages) * 100 : 0;
			
			await axios.put(`/exercise-sessions/${sessionId}/finish`, { score });
			alert(`お疲れ様でした！スコア: ${Math.round(score)}点 が記録されました。`);
			router.push(`/weekflows/${courseId}/${weekId}`);
		} catch (e) {
			console.error(e);
			alert("成績の提出に失敗しました");
		}
	};

	if (loading) {
		return (
			<div className="container mx-auto py-8 flex items-center justify-center">
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
			<div className="container mx-auto py-8 px-4 max-w-4xl">
				<div className="mb-6">
					<div className="flex flex-wrap items-center justify-between gap-4 mb-3">
						<Button variant="ghost" size="sm" asChild className="text-gray-500 hover:text-gray-900">
							<Link href={`/weekflows/${courseId}/${weekId}`} className="flex items-center gap-2">
								<ArrowLeft className="h-4 w-4" />
								演習問題一覧に戻る
							</Link>
						</Button>
						<div className="text-sm text-gray-600">{setInfo.title}</div>
					</div>
					<div className="text-gray-600 mb-3">
						問題 {currentPage} / {totalPages}
					</div>
					<div className="w-full bg-gray-200 rounded-full h-2 mb-4">
						<div
							className="bg-blue-600 h-2 rounded-full transition-all duration-300"
							style={{ width: `${(currentPage / Math.max(totalPages, 1)) * 100}%` }}
						/>
					</div>
					<div className="flex justify-center gap-2 flex-wrap">
						{Array.from({ length: totalPages }, (_, i) => {
							const pageNum = i + 1;
							const status = pageAnswerStatus[pageNum] || "unanswered";
							return (
								<button
									key={pageNum}
									onClick={() => setCurrentPage(pageNum)}
									className={`
										w-10 h-10 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105
										${pageNum === currentPage ? "ring-2 ring-blue-500 ring-offset-2" : ""}
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
					{isPastDue && (
						<Alert variant="destructive" className="mt-4">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>
								回答期限（{new Date(setInfo.due_date!).toLocaleString("ja-JP")}）を過ぎているため、解答できません。
							</AlertDescription>
						</Alert>
					)}
				</div>

				<Card className="mb-6 shadow-md border-gray-200">
					<CardHeader>
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
						<CardDescription className="text-base mt-2">{currentQuestion?.title ?? "問題"}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="prose prose-sm max-w-none">
							<MathJax text={questionText} />
						</div>

						{showHint && hintText && (
							<Alert>
								<Lightbulb className="h-4 w-4" />
								<AlertDescription>
									<MathJax text={hintText} />
								</AlertDescription>
							</Alert>
						)}

						<div className="mt-10 bg-blue-50/40 rounded-2xl p-5 md:p-7 border border-blue-100 shadow-sm">
							<h3 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
								解答欄
							</h3>

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
															? "bg-white border-blue-500 shadow-sm ring-2 ring-blue-500 ring-opacity-50"
															: "bg-white/80 hover:bg-white border-gray-200 hover:border-gray-300"
													}`}
												>
													<input
														type="radio"
														name="mcq-choice"
														checked={isSelected}
														onChange={() => setSingleAnswer("choice", choice.choice_id)}
														className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300"
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
								<Input
									type="number"
									step="any"
									placeholder="数値を入力"
									value={(answerInput.value as string) ?? ""}
									onChange={(e) => setSingleAnswer("value", e.target.value)}
									className="bg-white border-gray-300 text-lg py-6 rounded-xl"
								/>
							)}

							{currentQuestion?.question_type === "multiple_numeric" && (
								<div className="space-y-4">
									{((content?.blanks as Array<{ blank_id: string; label: string }>) ?? []).map(
										(blank) => (
											<div key={blank.blank_id} className="bg-white p-4 rounded-xl border border-gray-200">
												<label className="text-base font-bold text-gray-700 block mb-2">{blank.label}</label>
												<Input
													type="number"
													step="any"
													className="bg-gray-50 text-lg py-5"
													value={(answerInput[`blank_${blank.blank_id}`] as string) ?? ""}
													onChange={(e) =>
														setSingleAnswer(`blank_${blank.blank_id}`, e.target.value)
													}
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
									className="bg-white border-gray-300 rounded-xl text-base p-4"
								/>
							)}

							<div className="pt-6 mt-6 border-t border-blue-200/60">
								<Button 
									onClick={checkAnswer} 
									disabled={submitted || isPastDue}
									size="lg"
									className="w-full text-lg font-bold py-6 rounded-xl shadow-sm hover:shadow-md transition-all bg-blue-600 hover:bg-blue-700 text-white"
								>
									{isPastDue ? "期限切れ" : submitted ? "解答済み" : "解答する"}
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>

				{submitted && (
					<Card className={`mb-6 border-2 shadow-md transition-all duration-300 ${
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

				<Card>
					<CardContent className="pt-6 flex justify-between">
						<Button
							variant="outline"
							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
							disabled={currentPage <= 1}
							className="gap-2"
						>
							<ArrowLeft className="h-4 w-4" />
							前の問題
						</Button>
						<Button 
							variant="default" 
							className="bg-green-600 hover:bg-green-700 text-white shadow-md font-bold px-6"
							onClick={finishSession} 
							disabled={!sessionId}
						>
							成績を提出して終了
						</Button>
						<Button
							variant="outline"
							onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
							disabled={currentPage >= totalPages}
							className="gap-2"
						>
							次の問題
							<ArrowRight className="h-4 w-4" />
						</Button>
					</CardContent>
				</Card>
			</div>
		</MathJaxSetup>
	);
}

