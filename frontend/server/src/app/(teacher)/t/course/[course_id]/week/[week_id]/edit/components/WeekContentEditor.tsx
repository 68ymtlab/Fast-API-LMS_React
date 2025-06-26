"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle, Eye, Edit, Save } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MathJax } from "@/components/shared/MathJax";
import axios from "@/lib/axios";

interface ContentBlock {
  page: number;
  content: string;
  content_id: number;
  origin_content_id: number;
}

interface WeekContent {
  block: ContentBlock[];
  image: Array<{ id: number; name: string; id_in_yml: string }>;
  flow: Array<{ id: number; id_in_yml: string }>;
  page: Array<{ week_num: number; order: number; week_id: number }>;
}

interface WeekContentEditorProps {
  courseId: string;
  weekId: string;
}

function WeekContentEditor({ courseId, weekId }: WeekContentEditorProps) {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [weekContent, setWeekContent] = useState<WeekContent | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [content, setContent] = useState("");
  const [previewContent, setPreviewContent] = useState("");

  useEffect(() => {
    fetchWeekContent();
  }, [courseId, weekId]);

  useEffect(() => {
    if (weekContent && weekContent.block.length > 0) {
      const pageContent = weekContent.block.find(block => block.page === currentPage);
      if (pageContent) {
        setContent(pageContent.content);
        updatePreview(pageContent.content);
      }
    }
  }, [currentPage, weekContent]);

  const fetchWeekContent = async () => {
    try {
      setInitialLoading(true);
      const response = await axios.get(`/get_week_origin_content/${courseId}/${weekId}`);
      setWeekContent(response.data);
      
      if (response.data.block.length > 0) {
        setContent(response.data.block[0].content);
        updatePreview(response.data.block[0].content);
      }
    } catch (error) {
      console.error("Error fetching week content:", error);
      setErrorMessage("週次コンテンツの取得に失敗しました");
    } finally {
      setInitialLoading(false);
    }
  };

  const contentReplace = (content: string): string => {
    if (!weekContent) return content;

    let processedContent = content;

    // Flow links replacement
    weekContent.flow.forEach(flow => {
      const regex1 = new RegExp(`\\[(.*?)\\]\\s*\\(\\s*flow/${flow.id_in_yml}\\s*\\)`, 'g');
      processedContent = processedContent.replace(regex1, `<div class="p-3 border-2 border-dashed border-blue-300 bg-blue-50 rounded-lg my-2"><p><a href="/flow/${flow.id}" class="text-blue-600 hover:text-blue-800">$1</a></p></div>`);
    });

    // Image replacement
    weekContent.image.forEach(image => {
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
    weekContent.page.forEach(item => {
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

  const markdownToHtml = (markdown: string): string => {
    // 簡単なMarkdown to HTML変換（実際のプロジェクトではライブラリを使用することを推奨）
    let html = markdown;
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>');
    
    // Bold and italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    
    return html;
  };

  const updatePreview = (rawContent: string) => {
    const replacedContent = contentReplace(rawContent);
    const htmlContent = markdownToHtml(replacedContent);
    setPreviewContent(htmlContent);
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
  };

  const handleReflection = () => {
    updatePreview(content);
  };

  const handleUpdate = async () => {
    if (!weekContent) return;

    const currentBlock = weekContent.block.find(block => block.page === currentPage);
    if (!currentBlock) return;

    setLoading(true);
    setErrorMessage("");

    try {
      const updateData = {
        course_id: courseId,
        week_id: weekId,
        content_id: currentBlock.content_id,
        origin_content_id: currentBlock.origin_content_id,
        content: content,
      };

      const response = await axios.post("/update_week_content", updateData);

      if (response.data.success) {
        setShowSuccessDialog(true);
        await fetchWeekContent(); // データを再取得
        setTimeout(() => {
          setShowSuccessDialog(false);
        }, 2000);
      } else {
        setErrorMessage(response.data.error_msg || "コンテンツの更新に失敗しました");
      }
    } catch (error: any) {
      console.error("Error updating content:", error);
      setErrorMessage("コンテンツの更新に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!weekContent || weekContent.block.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-gray-500">編集可能なコンテンツがありません</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">教科書コンテンツ編集</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs 
            value={currentPage.toString()} 
            onValueChange={(value: string) => setCurrentPage(parseInt(value))}
            className="w-full"
          >
            <TabsList className="grid grid-cols-auto gap-2 h-auto">
              {weekContent.block.map((block) => (
                <TabsTrigger 
                  key={block.page} 
                  value={block.page.toString()}
                  className="px-4 py-2"
                >
                  ページ {block.page}
                </TabsTrigger>
              ))}
            </TabsList>

            {weekContent.block.map((block) => (
              <TabsContent key={block.page} value={block.page.toString()} className="mt-6">
                <div className="flex justify-center gap-3 mb-4">
                  <Button 
                    onClick={handleReflection} 
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    反映
                  </Button>
                  <Button 
                    onClick={handleUpdate} 
                    disabled={loading}
                    className="flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {loading ? "更新中..." : "更新"}
                  </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Editor */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Edit className="h-4 w-4" />
                      編集エリア
                    </h3>
                    <Textarea
                      value={content}
                      onChange={(e) => handleContentChange(e.target.value)}
                      className="min-h-[600px] font-mono text-sm"
                      placeholder="コンテンツを入力してください..."
                    />
                  </div>

                  {/* Preview */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      プレビュー
                    </h3>
                    <div className="border border-gray-200 rounded-lg p-4 min-h-[600px] bg-white overflow-auto">
                      <MathJax text={previewContent} />
                    </div>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* 成功ダイアログ */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <DialogTitle className="text-xl">更新完了</DialogTitle>
            <DialogDescription>
              コンテンツが正常に更新されました
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WeekContentEditor;