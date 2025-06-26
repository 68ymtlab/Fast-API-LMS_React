"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Trophy, ArrowLeft, RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";

interface CompletionData {
  content?: string;
  accuracy_rate?: number;
  total_questions?: number;
  correct_answers?: number;
  session_number?: number;
}

function FlowCompletionPage() {
  const { loginUser, isLoadingUser } = useLoginUser();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [completionData, setCompletionData] = useState<CompletionData | null>(null);

  useEffect(() => {
    if (!isLoadingUser && !loginUser) {
      router.push("/login");
    }
  }, [loginUser, isLoadingUser, router]);

  useEffect(() => {
    if (params.flow_id && params.session_id) {
      fetchCompletionData();
    }
  }, [params.flow_id, params.session_id]);

  const fetchCompletionData = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      // Fetch completion page content
      const response = await axios.get(`/get_flow_completion_page/${params.flow_id}`);
      setCompletionData(response.data);
    } catch (error) {
      console.error("Error fetching completion data:", error);
      setErrorMessage("完了情報の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const returnToFlow = () => {
    router.push(`/s/course/${params.course_id}/week/${params.week_id}/flow/${params.flow_id}`);
  };

  const startNewSession = () => {
    router.push(`/s/course/${params.course_id}/week/${params.week_id}/flow/${params.flow_id}`);
  };

  const getAccuracyBadgeVariant = (accuracy: number) => {
    if (accuracy >= 90) return "default";
    if (accuracy >= 70) return "secondary";
    return "destructive";
  };

  const getPerformanceMessage = (accuracy?: number) => {
    if (!accuracy) return "";
    
    if (accuracy >= 90) return "素晴らしい結果です！";
    if (accuracy >= 70) return "良い結果です！";
    if (accuracy >= 50) return "もう少し頑張りましょう";
    return "復習して再挑戦してみましょう";
  };

  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
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
        <div className="space-y-6">
          {/* 完了メッセージ */}
          <Card className="text-center">
            <CardHeader className="pb-6">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-green-100 p-4">
                  <CheckCircle className="h-16 w-16 text-green-600" />
                </div>
              </div>
              <CardTitle className="text-2xl text-green-700">
                演習完了！
              </CardTitle>
              <CardDescription className="text-lg">
                お疲れ様でした。演習セッションが完了しました。
              </CardDescription>
            </CardHeader>
          </Card>

          {/* 成績表示 */}
          {completionData?.accuracy_rate !== undefined && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Trophy className="h-6 w-6" />
                  成績結果
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-primary mb-2">
                        {completionData.accuracy_rate.toFixed(1)}%
                      </div>
                      <Badge variant={getAccuracyBadgeVariant(completionData.accuracy_rate)} className="text-sm">
                        正答率
                      </Badge>
                    </div>
                    
                    {completionData.total_questions && completionData.correct_answers !== undefined && (
                      <div className="text-center text-sm text-gray-600">
                        {completionData.correct_answers} / {completionData.total_questions} 問正解
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium mb-2">評価</h4>
                      <p className="text-sm text-gray-700">
                        {getPerformanceMessage(completionData.accuracy_rate)}
                      </p>
                    </div>

                    {completionData.session_number && (
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h4 className="font-medium mb-2">セッション情報</h4>
                        <p className="text-sm text-gray-700">
                          セッション #{completionData.session_number}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 完了コンテンツ */}
          {completionData?.content && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">メッセージ</CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: completionData.content }}
                />
              </CardContent>
            </Card>
          )}

          {/* アクションボタン */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  onClick={returnToFlow}
                  variant="default"
                  size="lg"
                  className="flex items-center gap-2"
                >
                  <ArrowLeft className="h-5 w-5" />
                  演習フローに戻る
                </Button>
                
                <Button
                  onClick={startNewSession}
                  variant="outline"
                  size="lg"
                  className="flex items-center gap-2"
                >
                  <RotateCcw className="h-5 w-5" />
                  再度挑戦する
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 次のステップ */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="text-center">
                <h3 className="font-medium mb-2">次のステップ</h3>
                <p className="text-sm text-gray-600 mb-4">
                  他の演習問題にも挑戦して、理解を深めましょう。
                </p>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/s/course/${params.course_id}/week/${params.week_id}`)}
                  className="flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  教科書ページに戻る
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default FlowCompletionPage;