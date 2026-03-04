"use client";

import {
	AlertCircle,
	ArrowLeft,
	ArrowRight,
	CheckCircle,
	Eye,
	Lightbulb,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
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

interface ExerciseSet {
	id: number;
	title: string;
	description?: string | null;
	course_id: number;
	question_ids: number[];
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

export default function ExerciseSetPreviewPage() {
	const params = useParams();
	const courseId = params.course_id as string;
	const setId = params.set_id as string;

	const [setInfo, setSetInfo] = useState<ExerciseSet | null>(null);
	const [questions, setQuestions] = useState<CourseQuestion[]>([]);
	const [loading, setLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState("");
	const [currentPage, setCurrentPage] = useState(1);
	const [answerInput, setAnswerInput] = useState<Record<string, string | number | number[]>>({});
	const [showHint, setShowHint] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
	const [pageAnswerStatus, setPageAnswerStatus] = useState<Record<number, AnswerStatus>>({});

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

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setErrorMessage("");
			const [setRes, questionsRes] = await Promise.all([
				axios.get<ExerciseSet>(`/exercise-sets/${setId}`),
				axios.get<CourseQuestion[]>(`/courses/${courseId}/questions`),
			]);
			setSetInfo(setRes.data);
			setQuestions(questionsRes.data ?? []);
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
	}, [currentQuestion, content, answerInput, currentPage]);

	const setSingleAnswer = (key: string, value: string | number) => {
		setAnswerInput((prev) => ({ ...prev, [key]: value }));
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
					<Link href={`/t/course/${courseId}`}>コースに戻る</Link>
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
					<Link href={`/t/course/${courseId}`}>コースに戻る</Link>
				</Button>
			</div>
		);
	}

	const questionText = (content?.question as string) ?? "";
	const hintText = (content?.hint as string) ?? "";
	const answerComment = (content?.answer_comment as string) ?? "";

	return (
		<MathJaxSetup>
			<div className="container mx-auto py-8 px-4 max-w-5xl space-y-5">
				<Alert className="border-blue-200 bg-blue-50">
					<Eye className="h-4 w-4 text-blue-600" />
					<AlertDescription className="text-blue-800">
						<span className="font-medium">演習セットプレビュー:</span> 「{setInfo.title}」を学習者と同じように解けます。
					</AlertDescription>
				</Alert>

				<Card className="border-gray-200">
					<CardContent className="pt-5 pb-5 space-y-3">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<Button variant="outline" size="sm" asChild>
								<Link href={`/t/course/${courseId}`} className="flex items-center gap-2">
									<ArrowLeft className="h-4 w-4" />
									コースに戻る
								</Link>
							</Button>
							<div className="text-sm text-gray-600">問題 {currentPage} / {totalPages}</div>
						</div>
						<div className="w-full bg-gray-200 rounded-full h-2.5">
							<div
								className="bg-primary h-2.5 rounded-full transition-all duration-300"
								style={{ width: `${(currentPage / Math.max(totalPages, 1)) * 100}%` }}
							/>
						</div>
					</CardContent>
				</Card>

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
											w-10 h-10 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105
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
					</CardContent>
				</Card>

				<Card className="shadow-sm border-gray-200">
					<CardHeader className="pb-4">
						<div className="flex items-center justify-between">
							<CardTitle className="text-xl font-bold text-gray-800">問題 {currentPage}</CardTitle>
							{hintText && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => setShowHint(!showHint)}
									className="gap-2"
								>
									<Lightbulb className="h-4 w-4" />
									ヒント
								</Button>
							)}
						</div>
						<CardDescription className="text-base mt-2">
							{currentQuestion?.title ?? "問題"}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
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

						<div className="mt-10">
							<div className="rounded-2xl p-5 md:p-6 border border-gray-200 bg-gray-50/70">
								<div className="mb-4 text-base font-semibold text-gray-700">解答欄</div>
							{currentQuestion?.question_type === "mcq" && (
								<div className="space-y-2">
									{((content?.choices as Array<{ choice_id: string; choice_text: string }>) ?? []).map(
										(choice) => (
											<label
												key={choice.choice_id}
												className="flex items-center gap-3 p-3 border rounded-md hover:bg-muted/50 cursor-pointer bg-white"
											>
												<input
													type="radio"
													name="mcq-choice"
													checked={(answerInput.choice as string) === choice.choice_id}
													onChange={() => setSingleAnswer("choice", choice.choice_id)}
													className="h-4 w-4"
												/>
												<span className="flex-1">
													<MathJax text={choice.choice_text} />
												</span>
											</label>
										),
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
									className="bg-white"
								/>
							)}

							{currentQuestion?.question_type === "multiple_numeric" && (
								<div className="space-y-3">
									{((content?.blanks as Array<{ blank_id: string; label: string }>) ?? []).map(
										(blank) => (
											<div key={blank.blank_id}>
												<label className="text-sm font-medium">{blank.label}</label>
												<Input
													type="number"
													step="any"
													className="mt-1 bg-white"
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
									className="bg-white"
								/>
							)}

							<div className="flex justify-center pt-4">
								<Button onClick={checkAnswer} disabled={submitted}>
									{submitted ? "解答済み" : "解答する"}
								</Button>
							</div>
						</div>
						</div>
					</CardContent>
				</Card>

				{submitted && (
					<Card
						className={`border-2 shadow-sm ${
							isCorrect ? "border-green-500 bg-green-50/50" : "border-red-500 bg-red-50/50"
						}`}
					>
						<CardHeader>
							<CardTitle className="text-lg flex items-center gap-2">
								{isCorrect ? (
									<CheckCircle className="h-5 w-5 text-green-500" />
								) : (
									<XCircle className="h-5 w-5 text-red-500" />
								)}
								{isCorrect ? "正解" : "不正解"}
							</CardTitle>
						</CardHeader>
						{answerComment && (
							<CardContent>
								<div className="prose prose-sm max-w-none">
									<MathJax text={answerComment} />
								</div>
							</CardContent>
						)}
					</Card>
				)}

				<Card className="border-gray-200">
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
