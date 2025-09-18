"use client";

import TcAccessTime from "@/components/tc_access_time";

import { MathJax } from "@/components/shared/MathJax";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";
import { AlertCircle, Calendar, ChevronDown, ChevronRight, Target, User } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface FlowSession {
  flow_session_grade: number;
  finish_date_time: string;
  flow_page: Array<{
    content: string;
  }>;
}

interface FlowSessionHistory {
  [weekName: string]: {
    [flowName: string]: FlowSession[];
  };
}

function ProfilePage() {
  const { loginUser, isLoadingUser } = useLoginUser();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [flowSessionHistory, setFlowSessionHistory] = useState<FlowSessionHistory[]>([]);
  const [expandedWeeks, setExpandedWeeks] = useState<{ [key: string]: boolean }>({});
  const [expandedFlows, setExpandedFlows] = useState<{ [key: string]: boolean }>({});
  const [expandedSessions, setExpandedSessions] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    if (!isLoadingUser && !loginUser) {
      router.push("/login");
    }
  }, [loginUser, isLoadingUser, router]);

  useEffect(() => {
    if (params.course_id) {
      fetchFlowSessionHistory();
    }
  }, [params.course_id]);

  const fetchFlowSessionHistory = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/get_flow_session_history/${params.course_id}`);
      console.log("API Response:", response.data);
      setFlowSessionHistory(response.data);
    } catch (error) {
      console.error("Error fetching flow session history:", error);
      setErrorMessage("演習履歴の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const processDate = (dateString: string): string => {
    if (!dateString) return "未完了";
    const date = new Date(dateString);
    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const markdownToHtml = (markdown: string): string => {
    let html = markdown;
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>');
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
    html = html.replace(/\n/g, "<br>");
    return html;
  };

  const toggleWeekExpansion = (weekIndex: number, weekKey: string) => {
    const key = `${weekIndex}-${weekKey}`;
    setExpandedWeeks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleFlowExpansion = (weekIndex: number, weekKey: string, flowIndex: number, flowKey: string) => {
    const key = `${weekIndex}-${weekKey}-${flowIndex}-${flowKey}`;
    setExpandedFlows((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSessionExpansion = (sessionKey: string) => {
    setExpandedSessions((prev) => ({ ...prev, [sessionKey]: !prev[sessionKey] }));
  };

  const getGradeColor = (grade: number): string => {
    if (grade >= 80) return "bg-green-500";
    if (grade >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getGradeBadgeVariant = (grade: number): "default" | "secondary" | "destructive" => {
    if (grade >= 80) return "default";
    if (grade >= 60) return "secondary";
    return "destructive";
  };

  if (isLoadingUser || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      <TcAccessTime page="student_profile" />
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <User className="h-6 w-6" />
              学習プロフィール
            </CardTitle>
            <CardDescription>科目別の学習履歴と演習成績を確認できます</CardDescription>
          </CardHeader>
          <CardContent>
            {errorMessage && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-5 w-5" />
                <h2 className="text-xl font-semibold">演習履歴</h2>
              </div>

              {flowSessionHistory.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <p className="text-gray-500">演習履歴がありません</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {flowSessionHistory.map((week, weekIndex) => {
                    console.log(`Week ${weekIndex}:`, week);

                    // weekがオブジェクトでない場合のエラーハンドリング
                    if (!week || typeof week !== "object") {
                      console.warn(`Week at index ${weekIndex} is not an object:`, week);
                      return null;
                    }

                    return (
                      <div key={Object.keys(week)[0] || weekIndex}>
                        {Object.entries(week).map(([weekKey, weekContent]) => {
                          console.log(`WeekContent for ${weekKey}:`, weekContent);

                          // weekContentがオブジェクトでない場合のエラーハンドリング
                          if (!weekContent || typeof weekContent !== "object") {
                            console.warn(`WeekContent for ${weekKey} is not an object:`, weekContent);
                            return null;
                          }

                          const weekExpandKey = `${weekIndex}-${weekKey}`;
                          const isWeekExpanded = expandedWeeks[weekExpandKey];

                          return (
                            <Card key={weekKey} className="overflow-hidden">
                              <Collapsible
                                open={isWeekExpanded}
                                onOpenChange={() => toggleWeekExpansion(weekIndex, weekKey)}
                              >
                                <CollapsibleTrigger className="w-full">
                                  <CardHeader className="hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4" />
                                        <h3 className="text-lg font-medium text-left">{weekKey}</h3>
                                      </div>
                                      {isWeekExpanded ? (
                                        <ChevronDown className="h-5 w-5" />
                                      ) : (
                                        <ChevronRight className="h-5 w-5" />
                                      )}
                                    </div>
                                  </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <CardContent className="pt-0">
                                    <div className="space-y-3">
                                      {Object.entries(weekContent).map(([flowKey, flowContent], flowIndex) => {
                                        console.log(`FlowContent for ${flowKey}:`, flowContent);

                                        const flowExpandKey = `${weekIndex}-${weekKey}-${flowIndex}-${flowKey}`;
                                        const isFlowExpanded = expandedFlows[flowExpandKey];

                                        // flowContentが配列でない場合のエラーハンドリング
                                        if (!Array.isArray(flowContent)) {
                                          console.warn(`flowContent is not an array for ${flowKey}:`, flowContent);
                                          return null;
                                        }

                                        return (
                                          <Card key={flowKey} className="ml-4">
                                            <Collapsible
                                              open={isFlowExpanded}
                                              onOpenChange={() =>
                                                toggleFlowExpansion(weekIndex, weekKey, flowIndex, flowKey)
                                              }
                                            >
                                              <CollapsibleTrigger className="w-full">
                                                <CardHeader className="py-3 hover:bg-gray-50 transition-colors">
                                                  <div className="flex items-center justify-between">
                                                    <h4 className="text-base font-medium text-left">{flowKey}</h4>
                                                    {isFlowExpanded ? (
                                                      <ChevronDown className="h-4 w-4" />
                                                    ) : (
                                                      <ChevronRight className="h-4 w-4" />
                                                    )}
                                                  </div>
                                                </CardHeader>
                                              </CollapsibleTrigger>
                                              <CollapsibleContent>
                                                <CardContent className="pt-0">
                                                  <div className="space-y-3">
                                                    {flowContent.map((flowSession, sessionIndex) => {
                                                      const sessionKey = `${weekIndex}-${weekKey}-${flowIndex}-${flowKey}-${sessionIndex}`;
                                                      const isSessionExpanded = expandedSessions[sessionKey];
                                                      const isCompleted = flowSession.flow_session_grade === 100;

                                                      return (
                                                        <Card
                                                          key={sessionKey}
                                                          className="ml-4 border-l-4 border-l-blue-200"
                                                        >
                                                          <Collapsible
                                                            open={isSessionExpanded}
                                                            onOpenChange={() => toggleSessionExpansion(sessionKey)}
                                                          >
                                                            <CollapsibleTrigger
                                                              className="w-full"
                                                              disabled={isCompleted}
                                                            >
                                                              <CardHeader
                                                                className={`py-3 ${!isCompleted && "hover:bg-gray-50 transition-colors"}`}
                                                              >
                                                                <div className="flex items-center justify-between">
                                                                  <div className="flex items-center gap-3">
                                                                    <span className="text-sm text-gray-600">
                                                                      {processDate(flowSession.finish_date_time)}
                                                                    </span>
                                                                    <Badge
                                                                      variant={getGradeBadgeVariant(
                                                                        flowSession.flow_session_grade,
                                                                      )}
                                                                    >
                                                                      {Math.ceil(flowSession.flow_session_grade)}%
                                                                    </Badge>
                                                                  </div>
                                                                  <div className="flex items-center gap-2">
                                                                    <div className="w-24">
                                                                      <Progress
                                                                        value={flowSession.flow_session_grade}
                                                                        className="h-2"
                                                                      />
                                                                    </div>
                                                                    {!isCompleted &&
                                                                      (isSessionExpanded ? (
                                                                        <ChevronDown className="h-4 w-4" />
                                                                      ) : (
                                                                        <ChevronRight className="h-4 w-4" />
                                                                      ))}
                                                                  </div>
                                                                </div>
                                                              </CardHeader>
                                                            </CollapsibleTrigger>
                                                            {!isCompleted && (
                                                              <CollapsibleContent>
                                                                <CardContent className="pt-0">
                                                                  <h5 className="font-medium mb-3 text-red-600">
                                                                    あなたが間違えた問題
                                                                  </h5>
                                                                  <div className="space-y-4">
                                                                    {flowSession.flow_page &&
                                                                      Array.isArray(flowSession.flow_page) &&
                                                                      flowSession.flow_page.map(
                                                                        (flowpage, flowpageIndex) => (
                                                                          <div
                                                                            key={`${sessionKey}-flowpage-${flowpage.content}`}
                                                                            className="p-4 bg-red-50 border border-red-200 rounded-lg"
                                                                          >
                                                                            <MathJax text={flowpage.content} />
                                                                          </div>
                                                                        ),
                                                                      )}
                                                                  </div>
                                                                </CardContent>
                                                              </CollapsibleContent>
                                                            )}
                                                          </Collapsible>
                                                        </Card>
                                                      );
                                                    })}
                                                  </div>
                                                </CardContent>
                                              </CollapsibleContent>
                                            </Collapsible>
                                          </Card>
                                        );
                                      })}
                                    </div>
                                  </CardContent>
                                </CollapsibleContent>
                              </Collapsible>
                            </Card>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default ProfilePage;
