"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { MathJax } from "@/components/shared/MathJax";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import axios from "@/lib/axios";

interface Choice {
	id: number;
	order: number;
	content: string;
}

interface PageContent {
	content: string;
	blank_id: number;
	choices: Choice[];
}

interface BlankAnswer {
	blank_id: number;
	answer: string | null;
}

interface ChoiceQuestionProps {
	flow_session_id: number;
	page: number;
	page_content: PageContent;
	blank_answers: BlankAnswer[];
	answer_comment: string;
	onAnswerUpdate?: (page: number, isCorrect: boolean) => void;
}

interface AnswerResponse {
	is_correct: boolean;
}

const ChoiceQuestion: React.FC<ChoiceQuestionProps> = ({
	flow_session_id,
	page,
	page_content,
	blank_answers,
	answer_comment,
	onAnswerUpdate,
}) => {
	const [selectedChoices, setSelectedChoices] = useState<number[]>([]);
	const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
	const [isAnswered, setIsAnswered] = useState(false);

	// Initialize selected choices
	useEffect(() => {
		const existingAnswer = blank_answers.find(
			(ba) => ba.blank_id === page_content.blank_id,
		);
		if (existingAnswer?.answer) {
			const choiceIds = existingAnswer.answer
				.split(",")
				.map((id) => parseInt(id.trim()))
				.filter((id) => !isNaN(id));
			setSelectedChoices(choiceIds);
		} else {
			setSelectedChoices([]);
		}
	}, [blank_answers, page_content.blank_id]);

	// Reset state when props change
	useEffect(() => {
		if (!isAnswered) {
			setIsCorrect(null);
		}
		setIsAnswered(false);
	}, [page_content, blank_answers]);

	const handleChoiceChange = (choiceId: number, checked: boolean) => {
		setSelectedChoices((prev) => {
			if (checked) {
				return [...prev, choiceId];
			} else {
				return prev.filter((id) => id !== choiceId);
			}
		});
	};

	const registerAnswer = async () => {
		// Sort the selected choice IDs and convert to comma-separated string
		const answerString = selectedChoices.sort((a, b) => a - b).join(",");

		const params = [
			{
				flow_session_id,
				page,
				blank_id: page_content.blank_id,
				answer: answerString,
			},
		];

		try {
			const response = await axios.post<AnswerResponse[]>(
				"/register_blank_answer",
				params,
			);

			const isAnswerCorrect = response.data[0].is_correct;
			setIsAnswered(true);
			setIsCorrect(isAnswerCorrect);

			// Notify parent component of answer status
			if (onAnswerUpdate) {
				onAnswerUpdate(page, isAnswerCorrect);
			}
		} catch (error) {
			console.error("Error registering answer:", error);
		}
	};

	return (
		<div className="container mx-auto p-0">
			<div className="bg-white rounded-2xl p-6 md:p-8 mb-8 border border-gray-200 shadow-sm">
				<h3 className="text-lg font-bold text-gray-700 mb-4 border-b border-gray-100 pb-3 flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
					問題文
				</h3>
				<div className="prose max-w-none text-gray-800 text-lg leading-relaxed">
					<MathJax text={page_content.content} />
				</div>
			</div>

			<div className="bg-blue-50/40 rounded-2xl p-6 md:p-8 border border-blue-100 shadow-sm mt-8">
				<h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
					解答欄
				</h3>
				<div className="space-y-4 mb-8">
					{page_content.choices
						.sort((a, b) => a.order - b.order)
						.map((choice) => {
							const isSelected = selectedChoices.includes(choice.id);
							return (
								<label
									key={choice.id}
									htmlFor={`choice-${choice.id}`}
									className={`flex items-start space-x-4 p-5 border rounded-xl cursor-pointer transition-all duration-200 ${
										isSelected
											? "bg-white border-blue-500 shadow-sm ring-2 ring-blue-500 ring-opacity-50"
											: "bg-white/80 hover:bg-white border-gray-200 hover:border-gray-300"
									}`}
								>
									<Checkbox
										id={`choice-${choice.id}`}
										checked={isSelected}
										onCheckedChange={(checked) =>
											handleChoiceChange(choice.id, checked as boolean)
										}
										className="mt-1 h-5 w-5"
									/>
									<div className="flex-1 cursor-pointer text-lg">
										<MathJax text={choice.content} />
									</div>
								</label>
							);
						})}
				</div>
				<div className="pt-6 border-t border-blue-200/60">
					<Button 
						onClick={registerAnswer} 
						size="lg" 
						className="w-full text-lg font-bold py-6 rounded-xl shadow-sm hover:shadow-md transition-all bg-blue-600 hover:bg-blue-700 text-white"
					>
						解答する
					</Button>
				</div>
			</div>

			{isAnswered && (
				<div className="p-0 mt-6">
					{isCorrect ? (
						<div className="rounded-xl p-6 bg-green-50 border-2 border-green-500 shadow-md">
							<h2 className="text-2xl font-bold mb-4 text-green-700 flex items-center gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-600"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
								正解です！！
							</h2>
							<div className="rounded-lg p-6 bg-white border border-gray-200">
								<h4 className="font-bold text-gray-700 mb-2">解説</h4>
								<MathJax text={answer_comment} />
							</div>
						</div>
					) : (
						<div className="rounded-xl p-6 bg-red-50 border-2 border-red-500 shadow-md">
							<h2 className="text-2xl font-bold mb-4 text-red-700 flex items-center gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-red-600"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
								不正解です
							</h2>
							<div className="rounded-lg p-6 bg-white border border-gray-200">
								<h4 className="font-bold text-gray-700 mb-2">解説</h4>
								<MathJax text={answer_comment} />
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default ChoiceQuestion;
