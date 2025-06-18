"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import axios from "@/lib/axios"
import MultipleTextQuestion from "@/components/flow/MultipleTextQuestion"
import SingleTextQuestion from "@/components/flow/SingleTextQuestion"
import ChoiceQuestion from "@/components/flow/ChoiceQuestion"
import DescriptiveTextQuestion from "@/components/flow/DescriptiveTextQuestion"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import withAuth from "@/hocs/withAuth"

interface FlowPageData {
  page_type: string
  page_content: any
  blank_answers: any[]
  answer_comment: string
}

interface FlowSessionData {
  flow_session_id: number
  flow_title: string
  current_page: number
  total_pages: number
}

interface FlowInfoData {
  flow_title: string
  num_of_pages: number
}

type AnswerStatus = 'correct' | 'incorrect' | 'unanswered'

interface SessionState {
  flow_session_id: number
  current_page: number
  total_pages: number
  flow_title: string
  last_accessed: string
  answer_status: Record<number, AnswerStatus>
}

function FlowSessionPage() {
  const params = useParams()
  const router = useRouter()
  const { course_id, week_id, flow_id } = params

  const [flowSession, setFlowSession] = useState<FlowSessionData | null>(null)
  const [pageData, setPageData] = useState<FlowPageData | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pageAnswerStatus, setPageAnswerStatus] = useState<Record<number, AnswerStatus>>({})

  // Session state management functions
  const saveSessionState = (sessionData: FlowSessionData, page: number, answerStatus?: Record<number, AnswerStatus>) => {
    const sessionKey = `flow_session_${flow_id}`
    const sessionState: SessionState = {
      flow_session_id: sessionData.flow_session_id,
      current_page: page,
      total_pages: sessionData.total_pages,
      flow_title: sessionData.flow_title,
      last_accessed: new Date().toISOString(),
      answer_status: answerStatus || pageAnswerStatus
    }
    localStorage.setItem(sessionKey, JSON.stringify(sessionState))
  }

  const loadSessionState = (): SessionState | null => {
    const sessionKey = `flow_session_${flow_id}`
    const stored = localStorage.getItem(sessionKey)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as SessionState
        // Check if session is recent (within 24 hours)
        const lastAccessed = new Date(parsed.last_accessed)
        const now = new Date()
        const hoursDiff = (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60)
        
        if (hoursDiff < 24) {
          return parsed
        } else {
          // Remove old session
          localStorage.removeItem(sessionKey)
        }
      } catch (e) {
        localStorage.removeItem(sessionKey)
      }
    }
    return null
  }

  const clearSessionState = () => {
    const sessionKey = `flow_session_${flow_id}`
    localStorage.removeItem(sessionKey)
  }

  // Initialize or resume flow session
  useEffect(() => {
    const initializeSession = async () => {
      try {
        // First, try to load existing session state from localStorage
        const savedSession = loadSessionState()
        
        if (savedSession) {
          // Resume existing session
          console.log("Resuming existing session from localStorage")
          setFlowSession({
            flow_session_id: savedSession.flow_session_id,
            flow_title: savedSession.flow_title,
            current_page: savedSession.current_page,
            total_pages: savedSession.total_pages
          })
          setCurrentPage(savedSession.current_page)
          setPageAnswerStatus(savedSession.answer_status || {})
          return
        }
        
        // Start new session
        console.log("Starting new session")
        const sessionResponse = await axios.post("/start_new_flow_session", {
          flow_id: Number(flow_id)
        })
        
        const flowSessionId = sessionResponse.data.flow_session_id
        
        // Get flow info to retrieve total pages
        const infoResponse = await axios.get<FlowInfoData>(`/get_flow_info/${flowSessionId}`)
        
        const newSessionData: FlowSessionData = {
          flow_session_id: flowSessionId,
          flow_title: infoResponse.data.flow_title || "演習問題",
          current_page: 1,
          total_pages: infoResponse.data.num_of_pages || 1
        }
        
        setFlowSession(newSessionData)
        setCurrentPage(1)
        
        // Save to localStorage
        saveSessionState(newSessionData, 1)
      } catch (err) {
        setError("セッションの開始に失敗しました")
        console.error(err)
      }
    }

    if (flow_id) {
      initializeSession()
    }
  }, [flow_id])

  // Check answer status for all pages when session starts
  useEffect(() => {
    const checkAllAnswerStatus = async () => {
      if (!flowSession) return

      const statusMap: Record<number, AnswerStatus> = {}

      for (let page = 1; page <= flowSession.total_pages; page++) {
        try {
          const answerResponse = await axios.get(
            `/get_blank_answer/${flowSession.flow_session_id}/${page}`
          )
          
          if (answerResponse.data && answerResponse.data.length > 0) {
            // Check if there are answers for this page
            const hasAnswers = answerResponse.data.some((answer: any) => answer.answer)
            if (hasAnswers) {
              // For now, we'll check the correct status when the user visits the page
              // This could be enhanced to check correctness immediately
              statusMap[page] = 'unanswered' // Will be updated when user visits the page
            } else {
              statusMap[page] = 'unanswered'
            }
          } else {
            statusMap[page] = 'unanswered'
          }
        } catch (err) {
          statusMap[page] = 'unanswered'
        }
      }

      setPageAnswerStatus(statusMap)
    }

    if (flowSession && Object.keys(pageAnswerStatus).length === 0) {
      checkAllAnswerStatus()
    }
  }, [flowSession])

  // Fetch page data when session is ready or page changes
  useEffect(() => {
    const fetchPageData = async () => {
      if (!flowSession) return

      try {
        setLoading(true)
        
        // Get page content
        const pageResponse = await axios.get(
          `/get_flowpage/${flowSession.flow_session_id}/${currentPage}`
        )
        
        // Get blank answers if exists
        const answerResponse = await axios.get(
          `/get_blank_answer/${flowSession.flow_session_id}/${currentPage}`
        )
        
        setPageData({
          ...pageResponse.data,
          blank_answers: answerResponse.data || []
        })
      } catch (err) {
        setError("ページの読み込みに失敗しました")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchPageData()
  }, [flowSession, currentPage])

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1
      setCurrentPage(newPage)
      if (flowSession) {
        saveSessionState(flowSession, newPage)
      }
    }
  }

  const handleNextPage = () => {
    if (flowSession && currentPage < flowSession.total_pages) {
      const newPage = currentPage + 1
      setCurrentPage(newPage)
      saveSessionState(flowSession, newPage)
    }
  }

  const handleJumpToPage = (targetPage: number) => {
    if (targetPage >= 1 && targetPage <= (flowSession?.total_pages || 1)) {
      setCurrentPage(targetPage)
      if (flowSession) {
        saveSessionState(flowSession, targetPage)
      }
    }
  }

  const updateAnswerStatus = (page: number, isCorrect: boolean) => {
    const newStatus = { ...pageAnswerStatus }
    newStatus[page] = isCorrect ? 'correct' : 'incorrect'
    setPageAnswerStatus(newStatus)
    
    if (flowSession) {
      saveSessionState(flowSession, currentPage, newStatus)
    }
  }

  const handleFinishSession = async () => {
    if (!flowSession) return

    try {
      await axios.post("/finish_flow_session", {
        flow_session_id: flowSession.flow_session_id
      })
      
      // Clear localStorage when session is finished
      clearSessionState()
      
      // Navigate back to week flows
      router.push(`/weekflows/${course_id}/${week_id}`)
    } catch (err) {
      setError("セッションの終了に失敗しました")
      console.error(err)
    }
  }

  const renderQuestion = () => {
    if (!pageData || !flowSession) return null

    switch (pageData.page_type) {
      case "MultipleTextQuestion":
        return (
          <MultipleTextQuestion
            flow_session_id={flowSession.flow_session_id}
            page={currentPage}
            page_content={pageData.page_content}
            blank_answers={pageData.blank_answers}
            answer_comment={pageData.answer_comment}
            onAnswerUpdate={updateAnswerStatus}
          />
        )
      case "SingleTextQuestion":
        return (
          <SingleTextQuestion
            flow_session_id={flowSession.flow_session_id}
            page={currentPage}
            page_content={pageData.page_content}
            blank_answers={pageData.blank_answers}
            answer_comment={pageData.answer_comment}
            onAnswerUpdate={updateAnswerStatus}
          />
        )
      case "ChoiceQuestion":
        return (
          <ChoiceQuestion
            flow_session_id={flowSession.flow_session_id}
            page={currentPage}
            page_content={pageData.page_content}
            blank_answers={pageData.blank_answers}
            answer_comment={pageData.answer_comment}
            onAnswerUpdate={updateAnswerStatus}
          />
        )
      case "DescriptiveTextQuestion":
        return (
          <DescriptiveTextQuestion
            flow_session_id={flowSession.flow_session_id}
            page={currentPage}
            page_content={pageData.page_content}
            blank_answers={pageData.blank_answers}
            answer_comment={pageData.answer_comment}
            onAnswerUpdate={updateAnswerStatus}
          />
        )
      default:
        return <div>この問題タイプはまだ実装されていません: {pageData.page_type}</div>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">読み込み中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">{error}</div>
      </div>
    )
  }

  return (
    <main>
        <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">
          {flowSession?.flow_title || "演習問題"}
        </h1>
        <div className="text-gray-600">
          問題 {currentPage} / {flowSession?.total_pages || 1}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{
            width: `${(currentPage / (flowSession?.total_pages || 1)) * 100}%`
          }}
        />
      </div>

      {/* Page Navigation */}
      <div className="flex justify-center space-x-2 mb-8 flex-wrap">
        {Array.from({ length: flowSession?.total_pages || 1 }, (_, i) => {
          const pageNum = i + 1
          const status = pageAnswerStatus[pageNum] || 'unanswered'
          
          return (
            <button
              key={pageNum}
              onClick={() => handleJumpToPage(pageNum)}
              className={`
                w-10 h-10 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105
                ${pageNum === currentPage 
                  ? 'ring-2 ring-blue-500 ring-offset-2' 
                  : ''
                }
                ${status === 'correct' 
                  ? 'bg-green-500 text-white hover:bg-green-600' 
                  : status === 'incorrect'
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }
              `}
              title={`問題 ${pageNum} (${
                status === 'correct' ? '正解' : 
                status === 'incorrect' ? '不正解' : 
                '未解答'
              })`}
            >
              {pageNum}
            </button>
          )
        })}
      </div>

      {/* Question Content */}
      <div className="mb-8">
        {renderQuestion()}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={handlePreviousPage}
          disabled={currentPage === 1}
          className="flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          前の問題
        </Button>

        <div className="text-sm text-gray-600">
          {currentPage} / {flowSession?.total_pages || 1}
        </div>

        {currentPage === flowSession?.total_pages ? (
          <Button
            onClick={handleFinishSession}
            className="bg-green-600 hover:bg-green-700"
          >
            演習を終了
          </Button>
        ) : (
          <Button
            onClick={handleNextPage}
            className="flex items-center gap-2"
          >
            次の問題
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
        </div>
    </main>
  )
}

export default withAuth(FlowSessionPage)