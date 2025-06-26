"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, ChevronLeft, ChevronRight, Eye, ArrowLeft, Play, Target, CheckCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";
import Link from "next/link";

interface FlowSessionInfo {
  flow_session_id: number;
  session_name: string;
  session_order: number;
  session_type: string;
  session_content: string;
  total_pages: number;
  flow_id: number;
  flow_name: string;
}

function FlowSessionPreviewPage() {
  const { loginUser, isLoadingUser } = useLoginUser();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionInfo, setSessionInfo] = useState<FlowSessionInfo | null>(null);
  
  const currentPage = parseInt(params.page as string) || 1;

  useEffect(() => {
    if (!isLoadingUser && !loginUser) {
      router.push("/login");
    }
  }, [loginUser, isLoadingUser, router]);

  useEffect(() => {
    if (params.flow_session_id && params.page) {
      fetchSessionData();
    }
  }, [params.flow_session_id, params.page]);

  const fetchSessionData = async () => {
    try {
      setLoading(true);
      
      const response = await axios.get(`/get_flow_session_info/${params.flow_session_id}?page=${currentPage}`);
      setSessionInfo(response.data);
    } catch (error) {
      console.error("Error fetching session data:", error);
      setErrorMessage("セッション情報の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (page: number) => {
    router.push(`/t/course/${params.course_id}/preview/flow/${params.flow_id}/session/${params.flow_session_id}/${page}`);
  };

  const getSessionTypeIcon = (type: string) => {
    switch (type) {
      case "lecture":
        return <Play className="h-4 w-4" />;
      case "practice":
        return <Target className="h-4 w-4" />;
      case "test":
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Play className="h-4 w-4" />;
    }
  };

  const getSessionTypeName = (type: string) => {
    switch (type) {
      case "lecture":
        return "講義";
      case "practice":
        return "演習";
      case "test":
        return "テスト";
      default:
        return "その他";
    }
  };

  const getSessionTypeColor = (type: string) => {
    switch (type) {
      case "lecture":
        return "bg-blue-500";
      case "practice":
        return "bg-green-500";
      case "test":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  if (isLoadingUser || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* ナビゲーション */}
      <div className="mb-6">
        <Link 
          href={`/t/course/${params.course_id}/preview/flow/${params.flow_id}`}
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          演習問題プレビューに戻る
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Eye className="h-6 w-6" />
            セッションプレビュー
          </CardTitle>
          <CardDescription>
            学生から見たセッションの表示を確認できます
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {sessionInfo && (
            <div className="space-y-8">
              {/* セッション基本情報 */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {getSessionTypeIcon(sessionInfo.session_type)}
                        {sessionInfo.session_name}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline">
                          セッション {sessionInfo.session_order}
                        </Badge>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs text-white ${getSessionTypeColor(sessionInfo.session_type)}`}>
                          {getSessionTypeIcon(sessionInfo.session_type)}
                          {getSessionTypeName(sessionInfo.session_type)}
                        </div>
                        <Badge variant="secondary">
                          {currentPage} / {sessionInfo.total_pages} ページ
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/t/course/${params.course_id}/week/${sessionInfo.flow_id}/edit`}>
                        <Button variant="outline" size="sm">
                          編集
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">所属演習問題</h4>
                      <p className="text-gray-700">{sessionInfo.flow_name}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">セッション内容</h4>
                      <div className="prose prose-sm max-w-none border rounded-lg p-6 bg-gray-50 min-h-[400px]">
                        <div 
                          className="text-gray-700"
                          dangerouslySetInnerHTML={{ __html: sessionInfo.session_content }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ページネーション */}
              {sessionInfo.total_pages > 1 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage <= 1}
                        className="flex items-center gap-2"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        前のページ
                      </Button>
                      
                      <div className="flex items-center gap-2">
                        {Array.from({ length: sessionInfo.total_pages }, (_, i) => i + 1).map((page) => (
                          <Button
                            key={page}
                            variant={page === currentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => goToPage(page)}
                          >
                            {page}
                          </Button>
                        ))}
                      </div>

                      <Button
                        variant="outline"
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage >= sessionInfo.total_pages}
                        className="flex items-center gap-2"
                      >
                        次のページ
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* セッションナビゲーション */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      {sessionInfo.session_type === "test" 
                        ? "テスト形式のセッションです" 
                        : sessionInfo.session_type === "practice"
                        ? "演習形式のセッションです"
                        : "講義形式のセッションです"
                      }
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {currentPage < sessionInfo.total_pages ? (
                        <Button 
                          onClick={() => goToPage(currentPage + 1)}
                          className="flex items-center gap-2"
                        >
                          次へ進む
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button 
                          variant="outline"
                          onClick={() => router.push(`/t/course/${params.course_id}/preview/flow/${params.flow_id}`)}
                          className="flex items-center gap-2"
                        >
                          セッション完了
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* アクション */}
              <div className="flex justify-center gap-4">
                <Link href={`/course/${params.course_id}/flow/${params.flow_id}/session/${params.flow_session_id}/1`}>
                  <Button variant="outline" className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    学生画面で表示
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default FlowSessionPreviewPage;