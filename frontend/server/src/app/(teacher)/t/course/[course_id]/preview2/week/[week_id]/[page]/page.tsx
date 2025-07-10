"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, BookOpen, ChevronLeft, ChevronRight, Eye, ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";
import Link from "next/link";
import { MathJax, MathJaxSetup } from "@/components/shared/MathJax";

interface WeekInfo {
  week_id: number;
  week_name: string;
  week_detail: string;
  week_num: number;
  total_pages: number;
}

interface ContentAssets {
  image: Array<{ id: number; name: string; id_in_yml: string }>;
  flow: Array<{ id: number; id_in_yml: string }>;
  page: Array<{ week_num: number; order: number; week_id: number }>;
}

function WeekPreview2Page() {
  const { loginUser, isLoadingUser } = useLoginUser();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [weekInfo, setWeekInfo] = useState<WeekInfo | null>(null);
  const [processedContent, setProcessedContent] = useState("");
  
  const currentPage = parseInt(params.page as string) || 1;

  // 編集ページと同じcontentReplace関数
  const contentReplace = (content: string, assets: ContentAssets | null): string => {
    if (!assets) return content;

    let processedContent = content;

    // Flow links replacement
    assets.flow.forEach(flow => {
      const regex1 = new RegExp(`\\[(.*?)\\]\\s*\\(\\s*flow/${flow.id_in_yml}\\s*\\)`, 'g');
      processedContent = processedContent.replace(regex1, `<div class="p-3 border-2 border-dashed border-blue-300 bg-blue-50 rounded-lg my-2"><p><a href="/t/course/${params.course_id}/preview2/flow/${flow.id}" class="text-blue-600 hover:text-blue-800">$1</a></p></div>`);
    });

    // Image replacement
    assets.image.forEach(image => {
      const regex2 = new RegExp(`\\(\\s*image/${image.name}\\s*\\)`, 'g');
      processedContent = processedContent.replace(regex2, `![contentsimage](/api/get_image/${image.id})`);

      const regex3 = new RegExp(`\\[\\s*image/${image.name}(.*?)\\s*\\]`, 'g');
      processedContent = processedContent.replace(regex3, (_, optionsStr) => {
        const widthMatch = optionsStr.match(/width=([0-9]+)/);
        const heightMatch = optionsStr.match(/height=([0-9]+)/);
        
        const widthAttr = widthMatch ? ` width="${widthMatch[1]}"` : '';
        const heightAttr = heightMatch ? ` height="${heightMatch[1]}"` : '';
        
        return `<img src="/api/get_image/${image.id}"${widthAttr}${heightAttr} class="max-w-full h-auto" />`;
      });
    });

    // Page links replacement
    const weekNumOrderToWeekId: { [key: string]: number } = {};
    assets.page.forEach(item => {
      const key = `${item.week_num}_${item.order}`;
      weekNumOrderToWeekId[key] = item.week_id;
    });

    const regex4 = /\[(.*?)\]\s*\(\s*page\/(\d+)\/(\d+)\/(\d+)\s*\)/g;
    processedContent = processedContent.replace(regex4, (match, linkText, weekNum, order, page) => {
      const key = `${weekNum}_${order}`;
      const weekIdToUse = weekNumOrderToWeekId[key] || weekNum;
      return `<div class="p-3 border-2 border-dashed border-green-300 bg-green-50 rounded-lg my-2"><p><a href="/t/course/${params.course_id}/preview2/week/${weekIdToUse}/${page}" class="text-green-600 hover:text-green-800">${linkText}</a></p></div>`;
    });

    return processedContent;
  };

  useEffect(() => {
    if (!isLoadingUser && !loginUser) {
      router.push("/login");
    }
  }, [loginUser, isLoadingUser, router]);

  useEffect(() => {
    if (params.course_id && params.week_id && params.page) {
      fetchWeekData();
    }
  }, [params.course_id, params.week_id, params.page]);

  // MathJaxの再レンダリングをトリガー
  useEffect(() => {
    if (processedContent && typeof window !== 'undefined' && window.MathJax) {
      window.MathJax.typesetPromise().catch((err: any) => console.log(err));
    }
  }, [processedContent]);

  const fetchWeekData = async () => {
    try {
      setLoading(true);
      setErrorMessage("");
      
      console.log('Fetching week data for preview2:', {
        course_id: params.course_id,
        week_id: params.week_id,
        page: params.page,
        currentPage
      });
      
      // 編集ページと同じAPIエンドポイントを使用
      const assetsResponse = await axios.get(`/get_week_origin_content/${params.course_id}/${params.week_id}`);
      console.log('Assets response for preview2:', assetsResponse.data);
      
      const assets = {
        image: assetsResponse.data.image || [],
        flow: assetsResponse.data.flow || [],
        page: assetsResponse.data.page || []
      };

      // 編集ページと同じように、現在ページのコンテンツを取得
      const pageContent = assetsResponse.data.block.find((block: any) => block.page === currentPage);
      if (pageContent) {
        const rawContent = pageContent.content || "";
        console.log('Raw content length:', rawContent.length);
        const replacedContent = contentReplace(rawContent, assets);
        console.log('Processed content length:', replacedContent.length);
        
        // Markdown から HTML への変換
        let htmlContent = replacedContent
          .replace(/\n/g, '<br>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        setProcessedContent(htmlContent);
      }

      // 週情報を設定
      setWeekInfo({
        week_id: parseInt(params.week_id as string),
        week_name: `第${currentPage}ページ`,
        week_detail: "",
        week_num: 1,
        total_pages: assetsResponse.data.block?.length || 1
      });
      
    } catch (error) {
      console.error("Error fetching week data:", error);
      setErrorMessage("週次コンテンツの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (page: number) => {
    router.push(`/t/course/${params.course_id}/preview2/week/${params.week_id}/${page}`);
  };

  if (isLoadingUser || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <MathJaxSetup>
      <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* ナビゲーション */}
      <div className="mb-6">
        <Link 
          href={`/t/course/${params.course_id}/preview`}
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          コースプレビューに戻る (Preview2)
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Eye className="h-6 w-6" />
            週次コンテンツプレビュー2 (編集ページベース)
          </CardTitle>
          <CardDescription>
            編集ページと同じ実装でMathJaxをテスト
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {weekInfo && (
            <div className="space-y-8">
              {/* 週の基本情報 */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        {weekInfo.week_name}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline">第{weekInfo.week_num}週</Badge>
                        <Badge variant="secondary">
                          {currentPage} / {weekInfo.total_pages} ページ
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/t/course/${params.course_id}/week/${params.week_id}/edit`}>
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
                      <h4 className="font-semibold mb-2">学習内容</h4>
                      <div className="border border-gray-200 rounded-lg min-h-[600px] bg-white overflow-auto">
                        <div className="container mx-auto p-0">
                          <div className="min-h-[300px]">
                            <div className="p-4">
                              {processedContent ? (
                                <div dangerouslySetInnerHTML={{ __html: processedContent }} />
                              ) : (
                                <div className="text-gray-500 italic">コンテンツを読み込み中...</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ページネーション */}
              {weekInfo.total_pages > 1 && (
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
                        <span className="text-sm text-gray-600">
                          {currentPage} / {weekInfo.total_pages} ページ
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {currentPage < weekInfo.total_pages ? (
                          <Button
                            variant="outline"
                            onClick={() => goToPage(currentPage + 1)}
                            className="flex items-center gap-2"
                          >
                            次のページ
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Link href={`/t/course/${params.course_id}/preview`}>
                            <Button variant="default" className="flex items-center gap-2">
                              コースプレビューに戻る
                              <ArrowLeft className="h-4 w-4" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </MathJaxSetup>
  );
}

export default WeekPreview2Page;