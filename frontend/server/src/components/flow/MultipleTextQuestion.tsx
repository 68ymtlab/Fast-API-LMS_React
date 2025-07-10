"use client"

import React, { useState, useEffect, KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MathJax } from '@/components/shared/MathJax'
import axios from '@/lib/axios'

interface AnswerColumn {
  blank_id: number
  md: string
}

interface PageContent {
  content: string
  answer_column_content: AnswerColumn[]
}

interface BlankAnswer {
  blank_id: number
  answer: string | null
}

interface MultipleTextQuestionProps {
  flow_session_id: number
  page: number
  page_content: PageContent
  blank_answers: BlankAnswer[]
  answer_comment: string
  onAnswerUpdate?: (page: number, isCorrect: boolean) => void
}

interface AnswerResponse {
  is_correct: boolean
}

const MultipleTextQuestion: React.FC<MultipleTextQuestionProps> = ({
  flow_session_id,
  page,
  page_content,
  blank_answers,
  answer_comment,
  onAnswerUpdate
}) => {
  const [blankAnswers, setBlankAnswers] = useState<{ [key: number]: string }>({})
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)

  // Initialize blank answers
  useEffect(() => {
    const initialAnswers: { [key: number]: string } = {}
    blank_answers.forEach(ba => {
      initialAnswers[ba.blank_id] = ba.answer || ''
    })
    setBlankAnswers(initialAnswers)
  }, [blank_answers])

  // Reset state when props change
  useEffect(() => {
    if (!isAnswered) {
      setIsCorrect(null)
    }
    setIsAnswered(false)
  }, [page_content, blank_answers])

  const handleAnswerChange = (blankId: number, value: string) => {
    setBlankAnswers(prev => ({
      ...prev,
      [blankId]: value
    }))
  }

  const registerAnswer = async () => {
    const params = Object.entries(blankAnswers).map(([blankId, answer]) => ({
      flow_session_id,
      page,
      blank_id: Number(blankId),
      answer
    }))

    try {
      const response = await axios.post<AnswerResponse[]>('/register_blank_answer', params)
      
      // Check if all answers are correct
      const blanklength = page_content.answer_column_content.length
      const correctCount = response.data.filter(item => item.is_correct).length
      
      const isAnswerCorrect = correctCount === blanklength
      setIsAnswered(true)
      setIsCorrect(isAnswerCorrect)
      
      // Notify parent component of answer status
      if (onAnswerUpdate) {
        onAnswerUpdate(page, isAnswerCorrect)
      }
    } catch (error) {
      console.error('Error registering answer:', error)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      registerAnswer()
    }
  }

  return (
    <div className="container mx-auto p-0">
      <div className="min-h-[300px]">
        <div className="p-4">
          <MathJax text={page_content.content} />
        </div>
      </div>
      
      <div className="p-0">
        <div className="rounded-lg p-8 bg-gray-100">
          {page_content.answer_column_content.map((answer_column) => (
            <div key={answer_column.blank_id} className="mx-2 mb-4">
              <MathJax text={answer_column.md} />
              <Input
                type="text"
                value={blankAnswers[answer_column.blank_id] || ''}
                onChange={(e) => handleAnswerChange(answer_column.blank_id, e.target.value)}
                onKeyDown={handleKeyDown}
                className="mt-2"
                placeholder="解答を入力"
              />
            </div>
          ))}
          <div className="flex justify-end mt-4">
            <Button onClick={registerAnswer}>
              解答する
            </Button>
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
  )
}

export default MultipleTextQuestion