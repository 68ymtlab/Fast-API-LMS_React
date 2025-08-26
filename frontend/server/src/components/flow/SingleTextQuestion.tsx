"use client";

import { MathJax } from "@/components/shared/MathJax";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import axios from "@/lib/axios";
import type React from "react";
import { type KeyboardEvent, useEffect, useState } from "react";

interface PageContent {
  content: string;
  blank_id: number;
}

interface BlankAnswer {
  blank_id: number;
  answer: string | null;
}

interface SingleTextQuestionProps {
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

const SingleTextQuestion: React.FC<SingleTextQuestionProps> = ({
  flow_session_id,
  page,
  page_content,
  blank_answers,
  answer_comment,
  onAnswerUpdate,
}) => {
  const [answer, setAnswer] = useState<string>("");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);

  // Initialize answer
  useEffect(() => {
    const existingAnswer = blank_answers.find((ba) => ba.blank_id === page_content.blank_id);
    setAnswer(existingAnswer?.answer || "");
  }, [blank_answers, page_content.blank_id]);

  // Reset state when props change
  useEffect(() => {
    if (!isAnswered) {
      setIsCorrect(null);
    }
    setIsAnswered(false);
  }, [page_content, blank_answers]);

  const handleAnswerChange = (value: string) => {
    setAnswer(value);
  };

  const registerAnswer = async () => {
    const params = [
      {
        flow_session_id,
        page,
        blank_id: page_content.blank_id,
        answer,
      },
    ];

    try {
      const response = await axios.post<AnswerResponse[]>("/register_blank_answer", params);

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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      registerAnswer();
    }
  };

  return (
    <div className="container mx-auto p-0 sm:px-4 md:px-8 py-4 sm:py-8 max-w-full md:max-w-7xl">
      <div className="min-h-[300px]">
        <div className="p-4">
          <MathJax text={page_content.content} />
        </div>
      </div>

      <div className="p-0">
        <div className="rounded-lg p-8 bg-gray-100">
          <Input
            type="text"
            value={answer}
            onChange={(e) => handleAnswerChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="mb-4"
            placeholder="解答を入力"
          />
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

export default SingleTextQuestion;
