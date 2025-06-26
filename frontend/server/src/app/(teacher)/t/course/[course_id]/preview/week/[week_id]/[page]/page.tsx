"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, BookOpen, ChevronLeft, ChevronRight, Eye, ArrowLeft, Play, FileText } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";
import Link from "next/link";
import { MathJax, MathJaxSetup, MathJaxHTML } from "@/components/shared/MathJax";

interface WeekInfo {
  week_id: number;
  week_name: string;
  week_detail: string;
  week_num: number;
  week_content: string;
  total_pages: number;
}

interface FlowInfo {
  flow_id: number;
  flow_name: string;
  flow_detail: string;
  flow_order: number;
}

// コンテンツ処理のためのインターフェース
interface ContentAssets {
  image: Array<{ id: number; name: string; id_in_yml: string }>;
  flow: Array<{ id: number; id_in_yml: string }>;
  page: Array<{ week_num: number; order: number; week_id: number }>;
}

function WeekPreviewPage() {
  const { loginUser, isLoadingUser } = useLoginUser();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [weekInfo, setWeekInfo] = useState<WeekInfo | null>(null);
  const [flows, setFlows] = useState<FlowInfo[]>([]);
  const [contentAssets, setContentAssets] = useState<ContentAssets | null>(null);
  const [processedContent, setProcessedContent] = useState("");
  
  const currentPage = parseInt(params.page as string) || 1;

  // Vue版のcontent_replace関数を移植
  const contentReplace = (content: string, assets: ContentAssets): string => {
    if (!assets) return content;

    let processedContent = content;

    // Flow links replacement
    assets.flow.forEach(flow => {
      const regex1 = new RegExp(`\\[(.*?)\\]\\s*\\(\\s*flow/${flow.id_in_yml}\\s*\\)`, 'g');
      processedContent = processedContent.replace(regex1, `<div class="p-3 border-2 border-dashed border-blue-300 bg-blue-50 rounded-lg my-2"><p><a href="/flow/${flow.id}" class="text-blue-600 hover:text-blue-800">$1</a></p></div>`);
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
      return `<div class="p-3 border-2 border-dashed border-green-300 bg-green-50 rounded-lg my-2"><p><a href="/../${weekIdToUse}/${page}" class="text-green-600 hover:text-green-800">${linkText}</a></p></div>`;
    });

    return processedContent;
  };

  // シンプルなmarkdownToHtml関数
  const markdownToHtml = (markdown: string): string => {
    let html = markdown;
    
    // ヘッダー処理
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>');
    
    // 太字・斜体（数式を避ける）
    html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
    
    // 改行処理
    html = html.replace(/\n\n+/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    
    // 段落で囲む
    if (html && !html.startsWith('<')) {
      html = '<p>' + html + '</p>';
    }
    
    return html;
  };

  // 改良された数式処理関数
  const processMathjax = (content: string): string => {
    let processed = content;
    
    // 1. $$...$$（ブロック数式）を先に処理
    processed = processed.replace(/\$\$([^$]+?)\$\$/g, '\\[$1\\]');
    
    // 2. $...$ （インライン数式）を処理
    processed = processed.replace(/\$([^$\n]+?)\$/g, '\\($1\\)');
    
    // 3. 既存の\(...\)と\[...\]はそのまま保持
    
    return processed;
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


  const fetchWeekData = async () => {
    try {
      setLoading(true);
      setErrorMessage("");
      
      console.log('Fetching week data:', {
        course_id: params.course_id,
        week_id: params.week_id,
        page: params.page,
        currentPage
      });
      
      // 週次コンテンツデータを取得
      const response = await axios.get(`/get_week_content/${params.week_id}/${currentPage}`);
      console.log('Week content response:', response.data);

      // コンテンツアセット情報を取得（Vue版のget_week_origin_contentに相当）
      let assets: ContentAssets = { image: [], flow: [], page: [] };
      try {
        const assetsResponse = await axios.get(`/get_week_origin_content/${params.course_id}/${params.week_id}`);
        console.log('Content assets response:', assetsResponse.data);
        assets = {
          image: assetsResponse.data.image || [],
          flow: assetsResponse.data.flow || [],
          page: assetsResponse.data.page || []
        };
        setContentAssets(assets);
      } catch (assetsError) {
        console.warn("Content assets not available:", assetsError);
      }

      // コンテンツを処理
      const rawContent = response.data.content || "";
      const replacedContent = contentReplace(rawContent, assets);
      const markdownProcessed = markdownToHtml(replacedContent);
      const finalContent = processMathjax(markdownProcessed);
      setProcessedContent(finalContent);

      console.log('Content processing:', {
        rawLength: rawContent.length,
        processedLength: finalContent.length,
        hasMath: finalContent.includes('\\(') || finalContent.includes('\\[')
      });

      // 週情報を設定
      setWeekInfo({
        week_id: response.data.week_id,
        week_name: response.data.week_name,
        week_detail: response.data.week_detail || "",
        week_num: response.data.week_num,
        week_content: finalContent,
        total_pages: response.data.page_num || 1
      });
      
      // フロー情報を取得
      try {
        const flowsResponse = await axios.get(`/get_week_flows/${params.week_id}`);
        console.log('Flows response:', flowsResponse.data);
        setFlows(flowsResponse.data);
      } catch (flowError) {
        console.warn("Flows data not available:", flowError);
        setFlows([]);
      }
    } catch (error) {
      console.error("Error fetching week data:", error);
      setErrorMessage("週次コンテンツの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (page: number) => {
    router.push(`/t/course/${params.course_id}/preview/week/${params.week_id}/${page}`);
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
            コースプレビューに戻る
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Eye className="h-6 w-6" />
              週次コンテンツプレビュー
            </CardTitle>
            <CardDescription>
              学生から見た週次コンテンツの表示を確認できます
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
                      {weekInfo.week_detail && (
                        <div>
                          <h4 className="font-semibold mb-2">週の概要</h4>
                          <p className="text-gray-700 whitespace-pre-wrap">{weekInfo.week_detail}</p>
                        </div>
                      )}
                      <div>
                        <h4 className="font-semibold mb-2">学習内容</h4>
                        <div className="prose prose-sm max-w-none border rounded-lg p-4 bg-gray-50" style={{lineHeight: '2'}}>
                          {processedContent ? (
                            <MathJaxHTML html={processedContent} />
                          ) : (
                            <div className="text-gray-500 italic">コンテンツを読み込み中...</div>
                          )}
                        </div>
                        {/* デバッグ情報 */}
                        {process.env.NODE_ENV === 'development' && (
                          <details className="mt-4">
                            <summary className="cursor-pointer text-sm text-gray-500">デバッグ情報</summary>
                            <div className="mt-2 p-2 bg-gray-100 rounded text-xs space-y-2">
                              <div>
                                <p><strong>Raw Content Length:</strong> {weekInfo?.week_content?.length || 0}</p>
                                <p><strong>Processed Content Length:</strong> {processedContent.length}</p>
                                <p><strong>Has Assets:</strong> {contentAssets ? 'Yes' : 'No'}</p>
                                {contentAssets && (
                                  <div>
                                    <p><strong>Images:</strong> {contentAssets.image.length}</p>
                                    <p><strong>Flows:</strong> {contentAssets.flow.length}</p>
                                    <p><strong>Pages:</strong> {contentAssets.page.length}</p>
                                  </div>
                                )}
                              </div>
                              <div>
                                <p><strong>Math Detection:</strong></p>
                                <p>- Inline Math: {processedContent.includes('\\(') ? 'Yes' : 'No'}</p>
                                <p>- Display Math: {processedContent.includes('\\[') ? 'Yes' : 'No'}</p>
                                <p>- Align Environment: {processedContent.includes('align') ? 'Yes' : 'No'}</p>
                              </div>
                              <details className="mt-2">
                                <summary className="cursor-pointer text-gray-600">処理済みコンテンツ（先頭500文字）</summary>
                                <pre className="mt-1 p-2 bg-gray-200 rounded text-xs overflow-auto max-h-32">
                                  {processedContent.substring(0, 500)}
                                </pre>
                              </details>
                            </div>
                          </details>
                        )}
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

                {/* 演習問題一覧 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Play className="h-5 w-5" />
                      演習問題一覧
                    </CardTitle>
                    <CardDescription>
                      この週に含まれる演習問題 ({flows.length}個)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {flows.length === 0 ? (
                      <div className="text-center py-8">
                        <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                        <p className="text-gray-500">演習問題が登録されていません</p>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {flows.map((flow) => (
                          <Card key={flow.flow_id} className="border-l-4 border-l-green-500">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <Badge variant="outline">問題 {flow.flow_order}</Badge>
                                    <h4 className="font-semibold">{flow.flow_name}</h4>
                                  </div>
                                  <p className="text-gray-600 whitespace-pre-wrap">
                                    {flow.flow_detail}
                                  </p>
                                </div>
                                <div className="flex flex-col gap-2 ml-4">
                                  <Link href={`/t/course/${params.course_id}/preview/flow/${flow.flow_id}`}>
                                    <Button size="sm" variant="outline" className="flex items-center gap-2">
                                      <Eye className="h-4 w-4" />
                                      プレビュー
                                    </Button>
                                  </Link>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* アクション */}
                <div className="flex justify-center gap-4">
                  <Link href={`/course/${params.course_id}/week/${params.week_id}/1`}>
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
    </MathJaxSetup>
  );
}

export default WeekPreviewPage;

// Vue版のスタイルを移植（MathJax対応強化）
const styles = `
  .box {
    background: #c4d9ff;
    border-left: #4e7bcc 5px solid;
    padding: 10px;
  }
  .box p {
    margin: 0;
    padding: 0;
  }
  .indent_1 {
    padding-left: 20px;
  }
  .indent_2 {
    padding-left: 40px;
  }
  .solid_border_1 {
    padding: 10px;
    margin-bottom: 10px;
    border: 1px solid #333333;
  }
  .dashed_border_1 {
    padding: 10px;
    margin-bottom: 10px;
    border: 1px dashed #333333;
  }
  .example {
    padding: 10px;
    margin-bottom: 10px;
    border: 2px dashed #333333;
  }
  .answer {
    text-align: center;
    width: 40px;
    margin: 1em;
    border: solid 2px #000000;
  }
  .definition {
    padding: 10px;
    margin-bottom: 10px;
    border: 2px solid #333333;
  }
  
  /* MathJax関連のスタイル */
  .mathjax-content {
    font-size: 16px;
    line-height: 1.8;
  }
  
  .mathjax-content .MathJax {
    outline: none;
  }
  
  .mathjax-content .MathJax_Display {
    text-align: center !important;
    margin: 1em 0 !important;
  }
  
  .mathjax-content .MathJax_Preview {
    color: #888;
  }
  
  /* MathJax v3向けのスタイル */
  .mathjax-content mjx-container[display="true"] {
    margin: 1.5em 0 !important;
    text-align: center !important;
  }
  
  .mathjax-content mjx-container[jax="CHTML"][display="true"] {
    margin: 1.5em 0 !important;
    text-align: center !important;
  }
  
  /* インライン数式の調整 */
  .mathjax-content mjx-container[display="false"] {
    display: inline-block;
    margin: 0 0.1em;
  }
  
  /* 数式フォントの調整 */
  .mathjax-content mjx-math {
    font-family: 'MathJax_Math', 'Times New Roman', serif;
  }
  
  /* 数式の読み込み状態表示 */
  .mathjax-content mjx-container[loading="true"] {
    color: #888;
    font-style: italic;
  }
`;

// スタイルをページに注入
if (typeof window !== 'undefined') {
  const existingStyle = document.getElementById('preview-math-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  const styleElement = document.createElement('style');
  styleElement.id = 'preview-math-styles';
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}