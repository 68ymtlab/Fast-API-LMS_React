'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Move } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import ChoiceQuestion from '@/components/flow/ChoiceQuestion';
import DescriptiveTextQuestion from '@/components/flow/DescriptiveTextQuestion';
import MultipleTextQuestion from '@/components/flow/MultipleTextQuestion';
import SingleTextQuestion from '@/components/flow/SingleTextQuestion';
import { MathJax } from '@/components/shared/MathJax';
import TcAccessTime from '@/components/tc_access_time';
import { Button } from '@/components/ui/button';
import axios from '@/lib/axios';

interface FlowPageData {
	page_type: string;
	page_content: any;
	blank_answers: any[];
	answer_comment: string;
}

interface FlowSessionData {
	flow_session_id: number;
	flow_title: string;
	current_page: number;
	total_pages: number;
}

interface FlowInfoData {
	flow_title: string;
	num_of_pages: number;
}

type AnswerStatus = 'correct' | 'incorrect' | 'unanswered';

interface SessionState {
	flow_session_id: number;
	current_page: number;
	total_pages: number;
	flow_title: string;
	last_accessed: string;
	answer_status: Record<number, AnswerStatus>;
}

function FlowPreviewPage() {
	const params = useParams();
	const router = useRouter();
	const { course_id, week_id, flow_id } = params;

	const [flowSession, setFlowSession] = useState<FlowSessionData | null>(null);
	const [pageData, setPageData] = useState<FlowPageData | null>(null);
	const [currentPage, setCurrentPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [pageAnswerStatus, setPageAnswerStatus] = useState<Record<number, AnswerStatus>>({});
	const [hintOpen, setHintOpen] = useState(false);
	const [hintText, setHintText] = useState<string>('');
	const [showHintTooltip, setShowHintTooltip] = useState(false);
	const [hintTooltipClosed, setHintTooltipClosed] = useState(false);
	const [hintPosition, setHintPosition] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
	const hintRef = useRef<HTMLDivElement>(null);
	const timerRef = useRef<NodeJS.Timeout | null>(null);

	const saveSessionState = (
		sessionData: FlowSessionData,
		page: number,
		answerStatus?: Record<number, AnswerStatus>,
	) => {
		const sessionKey = `flow_preview_session_${flow_id}`;
		const sessionState: SessionState = {
			flow_session_id: sessionData.flow_session_id,
			current_page: page,
			total_pages: sessionData.total_pages,
			flow_title: sessionData.flow_title,
			last_accessed: new Date().toISOString(),
			answer_status: answerStatus || pageAnswerStatus,
		};
		localStorage.setItem(sessionKey, JSON.stringify(sessionState));
	};

	const loadSessionState = (): SessionState | null => {
		const sessionKey = `flow_preview_session_${flow_id}`;
		const stored = localStorage.getItem(sessionKey);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as SessionState;
				const lastAccessed = new Date(parsed.last_accessed);
				const now = new Date();
				const hoursDiff = (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60);

				if (hoursDiff < 24) {
					return parsed;
				} else {
					localStorage.removeItem(sessionKey);
				}
			} catch (e) {
				localStorage.removeItem(sessionKey);
			}
		}
		return null;
	};

	const clearSessionState = () => {
		const sessionKey = `flow_preview_session_${flow_id}`;
		localStorage.removeItem(sessionKey);
	};

	useEffect(() => {
		const initializeSession = async () => {
			try {
				const savedSession = loadSessionState();

				if (savedSession) {
					console.log('Resuming existing preview session from localStorage');
					setFlowSession({
						flow_session_id: savedSession.flow_session_id,
						flow_title: savedSession.flow_title,
						current_page: savedSession.current_page,
						total_pages: savedSession.total_pages,
					});
					setCurrentPage(savedSession.current_page);
					setPageAnswerStatus(savedSession.answer_status || {});
					return;
				}

				console.log('Starting new preview session');
				const sessionResponse = await axios.post('/start_new_flow_session', {
					flow_id: Number(flow_id),
				});

				const flowSessionId = sessionResponse.data.flow_session_id;

				const infoResponse = await axios.get<FlowInfoData>(
					`/get_flow_info/${flowSessionId}`,
				);

				const newSessionData: FlowSessionData = {
					flow_session_id: flowSessionId,
					flow_title: infoResponse.data.flow_title || '演習問題',
					current_page: 1,
					total_pages: infoResponse.data.num_of_pages || 1,
				};

				setFlowSession(newSessionData);
				setCurrentPage(1);
				saveSessionState(newSessionData, 1);
			} catch (err) {
				setError('セッションの開始に失敗しました');
				console.error(err);
			}
		};

		if (flow_id) {
			initializeSession();
		}
	}, [flow_id]);

	useEffect(() => {
		const checkAllAnswerStatus = async () => {
			if (!flowSession) return;

			const statusMap: Record<number, AnswerStatus> = {};

			for (let page = 1; page <= flowSession.total_pages; page++) {
				try {
					const answerResponse = await axios.get(
						`/get_blank_answer/${flowSession.flow_session_id}/${page}`,
					);

					if (Array.isArray(answerResponse.data) && answerResponse.data.length > 0) {
						const hasAnswers = answerResponse.data.some(
							(answer: any) => answer.answer,
						);
						if (hasAnswers) {
							statusMap[page] = 'unanswered';
						} else {
							statusMap[page] = 'unanswered';
						}
					} else {
						statusMap[page] = 'unanswered';
					}
				} catch (err) {
					statusMap[page] = 'unanswered';
				}
			}

			setPageAnswerStatus(statusMap);
		};

		if (flowSession && Object.keys(pageAnswerStatus).length === 0) {
			checkAllAnswerStatus();
		}
	}, [flowSession]);

	useEffect(() => {
		const fetchPageData = async () => {
			if (!flowSession) return;

			try {
				setLoading(true);
				const pageResponse = await axios.get(
					`/get_flowpage/${flowSession.flow_session_id}/${currentPage}`,
				);
				const answerResponse = await axios.get(
					`/get_blank_answer/${flowSession.flow_session_id}/${currentPage}`,
				);
				setPageData({
					...pageResponse.data,
					blank_answers: answerResponse.data || [],
				});
			} catch (err) {
				setError('ページの読み込みに失敗しました');
				console.error(err);
			} finally {
				setLoading(false);
			}
		};

		fetchPageData();
	}, [flowSession, currentPage]);

	const handlePreviousPage = () => {
		if (currentPage > 1) {
			const newPage = currentPage - 1;
			setCurrentPage(newPage);
			if (flowSession) {
				saveSessionState(flowSession, newPage);
			}
		}
	};

	const handleNextPage = () => {
		if (flowSession && currentPage < flowSession.total_pages) {
			const newPage = currentPage + 1;
			setCurrentPage(newPage);
			saveSessionState(flowSession, newPage);
		}
	};

	const handleJumpToPage = (targetPage: number) => {
		if (targetPage >= 1 && targetPage <= (flowSession?.total_pages || 1)) {
			setCurrentPage(targetPage);
			if (flowSession) {
				saveSessionState(flowSession, targetPage);
			}
		}
	};

	const updateAnswerStatus = (page: number, isCorrect: boolean) => {
		const newStatus = { ...pageAnswerStatus };
		newStatus[page] = isCorrect ? 'correct' : 'incorrect';
		setPageAnswerStatus(newStatus);

		if (flowSession) {
			saveSessionState(flowSession, currentPage, newStatus);
		}
	};

	const handleFinishSession = async () => {
		if (!flowSession) return;

		try {
			await axios.post('/finish_flow_session', {
				flow_session_id: flowSession.flow_session_id,
			});
			clearSessionState();
			router.push(`/t/course/${course_id}/preview/week/${week_id}/1`);
		} catch (err) {
			setError('セッションの終了に失敗しました');
			console.error(err);
		}
	};

	const renderQuestion = () => {
		if (!pageData || !flowSession) return null;

		switch (pageData.page_type) {
			case 'MultipleTextQuestion':
				return (
					<MultipleTextQuestion
						flow_session_id={flowSession.flow_session_id}
						page={currentPage}
						page_content={pageData.page_content}
						blank_answers={pageData.blank_answers}
						answer_comment={pageData.answer_comment}
						onAnswerUpdate={updateAnswerStatus}
					/>
				);
			case 'SingleTextQuestion':
				return (
					<SingleTextQuestion
						flow_session_id={flowSession.flow_session_id}
						page={currentPage}
						page_content={pageData.page_content}
						blank_answers={pageData.blank_answers}
						answer_comment={pageData.answer_comment}
						onAnswerUpdate={updateAnswerStatus}
					/>
				);
			case 'ChoiceQuestion':
				return (
					<ChoiceQuestion
						flow_session_id={flowSession.flow_session_id}
						page={currentPage}
						page_content={pageData.page_content}
						blank_answers={pageData.blank_answers}
						answer_comment={pageData.answer_comment}
						onAnswerUpdate={updateAnswerStatus}
					/>
				);
			case 'DescriptiveTextQuestion':
				return (
					<DescriptiveTextQuestion
						flow_session_id={flowSession.flow_session_id}
						page={currentPage}
						page_content={pageData.page_content}
						blank_answers={pageData.blank_answers}
						answer_comment={pageData.answer_comment}
						onAnswerUpdate={updateAnswerStatus}
					/>
				);
			default:
				return <div>この問題タイプはまだ実装されていません: {pageData.page_type}</div>;
		}
	};

	const getHint = async () => {
		try {
			const res = await axios.get(
				`/get_flowpage_hint/${flowSession?.flow_session_id}/${currentPage}`,
			);
			setHintText(res.data.content);
		} catch (e) {
			setHintText('ヒントの取得に失敗しました');
		}
	};

	useEffect(() => {
		if (hintOpen && flowSession?.flow_session_id && currentPage) {
			getHint();
		}
	}, [hintOpen, flowSession?.flow_session_id, currentPage]);

	const startHintTimer = () => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			setShowHintTooltip(true);
			setHintTooltipClosed(false);
		}, 60000); // 1分
	};
	const resetHintTimer = () => {
		setShowHintTooltip(false);
		setHintTooltipClosed(false);
		if (timerRef.current) clearTimeout(timerRef.current);
		startHintTimer();
	};

	const handleMouseDown = (e: React.MouseEvent) => {
		if (hintRef.current) {
			const rect = hintRef.current.getBoundingClientRect();
			setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
			setIsDragging(true);
		}
	};

	const handleMouseMove = (e: MouseEvent) => {
		if (isDragging && hintRef.current) {
			const newX = e.clientX - dragOffset.x;
			const newY = e.clientY - dragOffset.y;
			const maxX = window.innerWidth - hintRef.current.offsetWidth;
			const maxY = window.innerHeight - hintRef.current.offsetHeight;
			setHintPosition({ x: Math.max(0, Math.min(newX, maxX)), y: Math.max(0, Math.min(newY, maxY)) });
		}
	};

	const handleMouseUp = () => {
		setIsDragging(false);
	};

	useEffect(() => {
		if (isDragging) {
			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
			return () => {
				document.removeEventListener('mousemove', handleMouseMove);
				document.removeEventListener('mouseup', handleMouseUp);
			};
		}
	}, [isDragging, dragOffset]);

	useEffect(() => {
		setShowHintTooltip(false);
		setHintTooltipClosed(false);
		startHintTimer();
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [currentPage, flowSession?.flow_session_id]);

	if (loading && !pageData) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
				<div className="text-lg text-slate-700">読み込み中...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
				<div className="text-red-600">{error}</div>
			</div>
		);
	}

	return (
		<>
			<TcAccessTime page="teacher_weekflows_preview_session" />
			<main>
				<div className="container mx-auto py-8">
					<div className="mb-6">
						<div className="mb-6">
							<h1 className="text-2xl font-bold mb-2">
								{flowSession?.flow_title || "演習問題"}
							</h1>
							<div className="text-gray-600">
								問題 {currentPage} / {flowSession?.total_pages || 1}
							</div>
						</div>

						<div className="w-full bg-gray-200 rounded-full h-2 mb-4 overflow-hidden">
							<div
								className="bg-blue-600 h-2 rounded-full transition-all duration-300"
								style={{
									width: `${(currentPage / (flowSession?.total_pages || 1)) * 100}%`,
								}}
							/>
						</div>

						<div className="flex justify-center space-x-2 mb-8 flex-wrap">
							{Array.from({ length: flowSession?.total_pages || 1 }, (_, i) => {
								const pageNum = i + 1;
								const status = pageAnswerStatus[pageNum] || "unanswered";

								return (
									<button
										key={pageNum}
										onClick={() => handleJumpToPage(pageNum)}
										className={`
											w-10 h-10 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105
											${
												pageNum === currentPage
													? "ring-2 ring-blue-500 ring-offset-2"
													: ""
											}
											${
												status === "correct"
													? "bg-green-500 text-white hover:bg-green-600"
													: status === "incorrect"
													? "bg-red-500 text-white hover:bg-red-600"
													: "bg-gray-200 hover:bg-gray-300 text-gray-700"
											}
										`}
										title={`問題 ${pageNum} (${
											status === "correct"
												? "正解"
												: status === "incorrect"
												? "不正解"
												: "未解答"
										})`}
									>
										{pageNum}
									</button>
								);
							})}
						</div>

						<div className="flex justify-end mb-4 relative">
							<DialogPrimitive.Root open={hintOpen} onOpenChange={setHintOpen}>
								<DialogPrimitive.Trigger asChild>
									<button
										style={{
											backgroundColor: "#FFD600",
											color: "#111",
											fontWeight: 700,
											fontSize: "1rem",
											borderRadius: "9999px",
											padding: "8px 16px",
											boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
											display: "flex",
											alignItems: "center",
											gap: "6px",
											border: "none",
											cursor: "pointer",
											letterSpacing: "0.01em",
										}}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="20"
											height="20"
											fill="#FFD600"
											viewBox="0 0 24 24"
											stroke="#222"
											strokeWidth="2"
											className="inline-block align-middle"
											style={{ marginRight: "4px" }}
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M12 3a7 7 0 0 0-4 12.9V18a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.1A7 7 0 0 0 12 3zm-2 16h4"
											/>
										</svg>
										ヒント
									</button>
								</DialogPrimitive.Trigger>
								{showHintTooltip && !hintTooltipClosed && (
									<div
										style={{
											position: "absolute",
											right: 0,
											top: "-44px",
											background: "#fffbe6",
											color: "#222",
											border: "1.5px solid #FFD600",
											borderRadius: 8,
											padding: "8px 14px 8px 14px",
											fontWeight: 600,
											fontSize: "1rem",
											boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
											zIndex: 300,
											whiteSpace: "nowrap",
											display: "flex",
											alignItems: "center",
											gap: "8px",
										}}
									>
										<span>⏱️ ヒントがありますよ！</span>
										<button
											onClick={() => {
												setHintTooltipClosed(true);
												setShowHintTooltip(false);
											}}
											style={{
												background: "none",
												border: "none",
												cursor: "pointer",
												padding: 0,
												marginLeft: 4,
												display: "flex",
												alignItems: "center",
											}}
											aria-label="ヒント通知を閉じる"
										>
											<svg
												width="18"
												height="18"
												fill="none"
												viewBox="0 0 24 24"
												stroke="#888"
												strokeWidth="2"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													d="M6 18L18 6M6 6l12 12"
												/>
											</svg>
										</button>
									</div>
								)}
								<DialogPrimitive.Portal>
									{hintOpen && (
										<DialogPrimitive.Content
											ref={hintRef}
											style={{
												position: "fixed",
												left: hintPosition.x || "calc(100vw - 520px)",
												top: hintPosition.y || "calc(100vh - 22rem)",
												width: "480px",
												minHeight: "220px",
												maxHeight: "80vh",
												zIndex: 200,
												overflow: "auto",
												padding: "0",
												borderRadius: "20px",
												boxShadow:
													"0 8px 32px rgba(0,0,0,0.12), 0 1.5px 6px rgba(0,0,0,0.08)",
												background: "#fff",
												border: "3px solid #FFD600",
												cursor: isDragging ? "grabbing" : "grab",
											}}
											className="custom-scrollbar"
										>
											<div
												style={{
													position: "relative",
													padding: "24px",
													fontSize: "1rem",
													color: "#222",
													lineHeight: 1.7,
													cursor: "default",
												}}
												onMouseDown={handleMouseDown}
											>
												<div
													style={{
														fontWeight: 700,
														fontSize: "1.08rem",
														marginBottom: "10px",
														letterSpacing: "0.01em",
														color: "#222",
														display: "flex",
														alignItems: "center",
														gap: "8px",
													}}
												>
													<Move className="w-4 h-4" style={{ cursor: "grab" }} />
													ヒント
												</div>
												<DialogPrimitive.Close
													style={{
														position: "absolute",
														top: 12,
														right: 12,
														background: "#f5f5f5",
														border: "none",
														borderRadius: "50%",
														width: 28,
														height: 28,
														display: "flex",
														alignItems: "center",
														justifyContent: "center",
														cursor: "pointer",
														boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
													}}
												>
													<svg
														width="18"
														height="18"
														fill="none"
														viewBox="0 0 24 24"
														stroke="#888"
														strokeWidth="2"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															d="M6 18L18 6M6 6l12 12"
														/>
													</svg>
												</DialogPrimitive.Close>
												<MathJax text={hintText} />
											</div>
										</DialogPrimitive.Content>
									)}
								</DialogPrimitive.Portal>
							</DialogPrimitive.Root>
						</div>

						<div className="mb-8" onInput={resetHintTimer} onChange={resetHintTimer}>
							{renderQuestion()}
						</div>

						<div className="flex justify-between items-center">
							<Button
								variant="outline"
								onClick={handlePreviousPage}
								disabled={currentPage === 1}
								className="flex items-center gap-2 rounded-full"
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
								<Button onClick={handleNextPage} className="flex items-center gap-2">
									次の問題
									<ChevronRight className="w-4 h-4" />
								</Button>
							)}
						</div>
					</div>
			</main>
		</>
	);
}

export default FlowPreviewPage;
