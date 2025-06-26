"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, BookOpen, Play, ArrowLeft, Clock, CheckCircle, RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";

interface FlowInfo {
  flow_id: number;
  flow_name: string;
  content_name: string;
  week_name: string;
  course_name: string;
  subject_name: string;
}

interface FlowSession {
  flow_session_id: number;
  session_number: number;
  start_time: string;
  end_time: string | null;
  is_completed: boolean;
  accuracy_rate: number | null;
}

interface WelcomePageContent {
  content: string;
}

function FlowDetailPage() {
  const { loginUser, isLoadingUser } = useLoginUser();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [flowInfo, setFlowInfo] = useState<FlowInfo | null>(null);
  const [welcomeContent, setWelcomeContent] = useState<WelcomePageContent | null>(null);
  const [flowSessions, setFlowSessions] = useState<FlowSession[]>([]);

  useEffect(() => {
    if (!isLoadingUser && !loginUser) {
      router.push("/login");
    }
  }, [loginUser, isLoadingUser, router]);

  useEffect(() => {
    if (params.flow_id) {
      fetchFlowData();
    }
  }, [params.flow_id]);

  const fetchFlowData = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      // Fetch flow basic info
      const flowResponse = await axios.get(`/get_flow/${params.flow_id}`);
      setFlowInfo(flowResponse.data);

      // Fetch welcome page content
      const welcomeResponse = await axios.get(`/get_flow_welcome_page/${params.flow_id}`);
      setWelcomeContent(welcomeResponse.data);

      // Fetch flow sessions history
      const sessionsResponse = await axios.get(`/get_flow_sessions/${params.flow_id}`);
      setFlowSessions(sessionsResponse.data || []);
    } catch (error) {
      console.error("Error fetching flow data:", error);
      setErrorMessage("演習フローの情報取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const startNewSession = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const response = await axios.post("/start_new_flow_session", {
        flow_id: parseInt(params.flow_id as string),
      });

      const flowSessionId = response.data.flow_session_id;
      router.push(`/s/course/${params.course_id}/week/${params.week_id}/flow/${params.flow_id}/session/${flowSessionId}/1`);
    } catch (error) {
      console.error("Error starting new session:", error);
      setErrorMessage("新しいセッションの開始に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const resumeSession = (sessionId: number) => {
    router.push(`/s/course/${params.course_id}/week/${params.week_id}/flow/${params.flow_id}/session/${sessionId}/1`);
  };

  const returnToWeek = () => {
    router.push(`/s/course/${params.course_id}/week/${params.week_id}`);
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* ヘッダー情報 */}
      {flowInfo && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <BookOpen className="h-6 w-6" />
                  {flowInfo.flow_name}
                </CardTitle>
                <CardDescription className="mt-2">
                  {flowInfo.subject_name} / {flowInfo.course_name} / {flowInfo.week_name} / {flowInfo.content_name}
                </CardDescription>
              </div>
              <Button variant="outline" onClick={returnToWeek} className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                教科書ページに戻る
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      {errorMessage && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* 演習フロー情報 */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">演習フロー情報</CardTitle>
              </CardHeader>
              <CardContent>
                {welcomeContent?.content ? (
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: welcomeContent.content }}
                  />
                ) : (
                  <p className="text-gray-500">演習フローの説明がありません</p>
                )}
                
                <Separator className="my-6" />
                
                <div className="flex justify-center">
                  <Button 
                    onClick={startNewSession}
                    disabled={loading}
                    size="lg"
                    className="flex items-center gap-2"
                  >
                    <Play className="h-5 w-5" />
                    {loading ? "開始中..." : "演習問題を開始"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* セッション履歴 */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  セッション履歴
                </CardTitle>
              </CardHeader>
              <CardContent>
                {flowSessions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    まだセッションがありません
                  </div>
                ) : (
                  <div className="space-y-3">
                    {flowSessions.map((session) => (
                      <Card key={session.flow_session_id} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              #{session.session_number}
                            </Badge>
                            {session.is_completed ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <Clock className="h-4 w-4 text-orange-500" />
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => resumeSession(session.flow_session_id)}
                            className="flex items-center gap-1"
                          >
                            <RotateCcw className="h-3 w-3" />
                            {session.is_completed ? "再開" : "続行"}
                          </Button>
                        </div>
                        
                        <div className="text-sm text-gray-600 space-y-1">
                          <div>開始: {formatDateTime(session.start_time)}</div>
                          {session.end_time && (
                            <div>終了: {formatDateTime(session.end_time)}</div>
                          )}
                          <div className="flex items-center justify-between">
                            <span>
                              状態: {session.is_completed ? "解答済み" : "未解答"}
                            </span>
                            {session.accuracy_rate !== null && (
                              <Badge variant={session.accuracy_rate >= 70 ? "default" : "secondary"}>
                                正答率: {session.accuracy_rate.toFixed(1)}%
                              </Badge>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export default FlowDetailPage;