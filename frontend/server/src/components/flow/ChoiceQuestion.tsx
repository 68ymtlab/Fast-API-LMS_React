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
			<div className="min-h-[300px]">
				<div className="p-4">
					<MathJax text={page_content.content} />
				</div>
			</div>

			<div className="p-0">
				<div className="rounded-lg p-8 pl-12 bg-gray-100">
					<div className="space-y-4 mb-6">
						{page_content.choices
							.sort((a, b) => a.order - b.order)
							.map((choice) => (
								<div key={choice.id} className="flex items-start space-x-3">
									<Checkbox
										id={`choice-${choice.id}`}
										checked={selectedChoices.includes(choice.id)}
										onCheckedChange={(checked) =>
											handleChoiceChange(choice.id, checked as boolean)
										}
										className="mt-1"
									/>
									<label
										htmlFor={`choice-${choice.id}`}
										className="flex-1 cursor-pointer"
									>
										<MathJax text={choice.content} />
									</label>
								</div>
							))}
					</div>
					<div className="flex justify-end">
						<Button onClick={registerAnswer}>解答する</Button>
					</div>
				</div>
			</div>

			{isAnswered && (
				<div className="p-0 mt-4">
					{isCorrect ? (
						<div className="rounded-lg p-6 my-6 bg-green-100">
							<h2 className="text-2xl font-bold mb-4">正解です！！</h2>
							<div className="rounded-lg p-6 bg-white">
								<MathJax text={answer_comment} />
							</div>
						</div>
					) : (
						<div className="rounded-lg p-6 my-6 bg-red-100">
							<h2 className="text-2xl font-bold mb-4">不正解です</h2>
							<div className="rounded-lg p-6 bg-white">
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
