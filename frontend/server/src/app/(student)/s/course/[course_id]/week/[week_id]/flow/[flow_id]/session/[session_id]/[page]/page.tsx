"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, ArrowLeft, ArrowRight, Lightbulb, CheckCircle, XCircle, Flag } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";

interface QuestionData {
  question_id: number;
  question_type: string;
  question_content: string;
  question_number: number;
  hint?: string;
  choices?: string[];
  max_page: number;
  is_last_page: boolean;
}

interface AnswerData {
  [key: string]: any;
}

interface SubmissionResult {
  is_correct: boolean;
  comment?: string;
  correct_answer?: string;
}

function FlowSessionPage() {
  const { loginUser, isLoadingUser } = useLoginUser();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [questionData, setQuestionData] = useState<QuestionData | null>(null);
  const [answerData, setAnswerData] = useState<AnswerData>({});
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showFinishDialog, setShowFinishDialog] = useState(false);

  const currentPage = parseInt(params.page as string);

  useEffect(() => {
    if (!isLoadingUser && !loginUser) {
      router.push("/login");
    }
  }, [loginUser, isLoadingUser, router]);

  useEffect(() => {
    if (params.session_id && params.page) {
      fetchQuestionData();
      fetchAnswerData();
    }
  }, [params.session_id, params.page]);

  const fetchQuestionData = async () => {
    try {
      setLoading(true);
      setErrorMessage("");
      setSubmissionResult(null);

      const response = await axios.get(`/get_flowpage/${params.session_id}/${params.page}`);
      setQuestionData(response.data);
    } catch (error) {
      console.error("Error fetching question data:", error);
      setErrorMessage("問題データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const fetchAnswerData = async () => {
    try {
      const response = await axios.get(`/get_blank_answer/${params.session_id}/${params.page}`);
      setAnswerData(response.data || {});
    } catch (error) {
      console.error("Error fetching answer data:", error);
    }
  };

  const submitAnswer = async () => {
    try {
      setSubmitting(true);
      setErrorMessage("");

      const response = await axios.post("/register_blank_answer", {
        flow_session_id: parseInt(params.session_id as string),
        page: currentPage,
        answer_data: answerData,
      });

      setSubmissionResult(response.data);
    } catch (error) {
      console.error("Error submitting answer:", error);
      setErrorMessage("解答の送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const navigateToPage = (page: number) => {
    if (page >= 1 && questionData && page <= questionData.max_page) {
      router.push(`/s/course/${params.course_id}/week/${params.week_id}/flow/${params.flow_id}/session/${params.session_id}/${page}`);
    }
  };

  const finishSession = async () => {
    try {
      setLoading(true);
      await axios.post("/finish_flow_session", {
        flow_session_id: parseInt(params.session_id as string),
      });
      
      router.push(`/s/course/${params.course_id}/week/${params.week_id}/flow/${params.flow_id}/completion/${params.session_id}`);
    } catch (error) {
      console.error("Error finishing session:", error);
      setErrorMessage("セッションの終了に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    router.push(`/s/course/${params.course_id}/week/${params.week_id}/flow/${params.flow_id}`);
  };

  const handleInputChange = (key: string, value: any) => {
    setAnswerData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const renderQuestion = () => {
    if (!questionData) return null;

    switch (questionData.question_type) {
      case "SingleTextQuestion":
        return (
          <div className="space-y-4">
            <Input
              placeholder="回答を入力してください"
              value={answerData.answer || ""}
              onChange={(e) => handleInputChange("answer", e.target.value)}
            />
          </div>
        );

      case "MultipleTextQuestion":
        const answerCount = questionData.question_content.match(/\[answer\d+\]/g)?.length || 1;
        return (
          <div className="space-y-4">
            {Array.from({ length: answerCount }, (_, i) => (
              <div key={i}>
                <label className="text-sm font-medium">回答 {i + 1}</label>
                <Input
                  placeholder={`回答${i + 1}を入力してください`}
                  value={answerData[`answer${i + 1}`] || ""}
                  onChange={(e) => handleInputChange(`answer${i + 1}`, e.target.value)}
                />
              </div>
            ))}
          </div>
        );

      case "ChoiceQuestion":
        return (
          <div className="space-y-3">
            {questionData.choices?.map((choice, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Checkbox
                  checked={answerData.choices?.includes(index) || false}
                  onCheckedChange={(checked) => {
                    const currentChoices = answerData.choices || [];
                    if (checked) {
                      handleInputChange("choices", [...currentChoices, index]);
                    } else {
                      handleInputChange("choices", currentChoices.filter((c: number) => c !== index));
                    }
                  }}
                />
                <label className="text-sm">{choice}</label>
              </div>
            ))}
          </div>
        );

      case "DescriptiveTextQuestion":
        return (
          <div className="space-y-4">
            <Textarea
              placeholder="回答を入力してください"
              value={answerData.answer || ""}
              onChange={(e) => handleInputChange("answer", e.target.value)}
              rows={6}
            />
          </div>
        );

      default:
        return <p className="text-gray-500">未対応の問題形式です</p>;
    }
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
      {/* ナビゲーションバー */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={goBack} className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              もどる
            </Button>
            
            {questionData && (
              <div className="flex items-center gap-2">
                {Array.from({ length: questionData.max_page }, (_, i) => (
                  <Button
                    key={i + 1}
                    variant={currentPage === i + 1 ? "default" : "outline"}
                    size="sm"
                    onClick={() => navigateToPage(i + 1)}
                  >
                    {i + 1}
                  </Button>
                ))}
              </div>
            )}

            <Button
              variant="destructive"
              onClick={() => setShowFinishDialog(true)}
              className="flex items-center gap-2"
            >
              <Flag className="h-4 w-4" />
              終了
            </Button>
          </div>
        </CardHeader>
      </Card>

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
      ) : questionData && (
        <div className="space-y-6">
          {/* 問題 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  問題 {questionData.question_number}
                </CardTitle>
                {questionData.hint && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowHint(!showHint)}
                    className="flex items-center gap-2"
                  >
                    <Lightbulb className="h-4 w-4" />
                    ヒント
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div 
                className="prose prose-sm max-w-none mb-6"
                dangerouslySetInnerHTML={{ __html: questionData.question_content }}
              />

              {showHint && questionData.hint && (
                <Alert className="mb-6">
                  <Lightbulb className="h-4 w-4" />
                  <AlertDescription>
                    <div dangerouslySetInnerHTML={{ __html: questionData.hint }} />
                  </AlertDescription>
                </Alert>
              )}

              {renderQuestion()}

              <div className="flex justify-center mt-6">
                <Button
                  onClick={submitAnswer}
                  disabled={submitting}
                  className="flex items-center gap-2"
                >
                  {submitting ? "送信中..." : "解答"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 解答結果 */}
          {submissionResult && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  {submissionResult.is_correct ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <Badge variant={submissionResult.is_correct ? "default" : "destructive"}>
                    {submissionResult.is_correct ? "正解" : "不正解"}
                  </Badge>
                </div>

                {submissionResult.comment && (
                  <div 
                    className="prose prose-sm max-w-none mb-4"
                    dangerouslySetInnerHTML={{ __html: submissionResult.comment }}
                  />
                )}

                {submissionResult.correct_answer && !submissionResult.is_correct && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">正解:</h4>
                    <div dangerouslySetInnerHTML={{ __html: submissionResult.correct_answer }} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ナビゲーション */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => navigateToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              前のページ
            </Button>

            {questionData.is_last_page ? (
              <Button
                onClick={() => setShowFinishDialog(true)}
                className="flex items-center gap-2"
              >
                <Flag className="h-4 w-4" />
                演習を終了
              </Button>
            ) : (
              <Button
                onClick={() => navigateToPage(currentPage + 1)}
                className="flex items-center gap-2"
              >
                次のページ
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 終了確認ダイアログ */}
      <Dialog open={showFinishDialog} onOpenChange={setShowFinishDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>演習を終了しますか？</DialogTitle>
            <DialogDescription>
              演習を終了すると、現在のセッションが完了されます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinishDialog(false)}>
              キャンセル
            </Button>
            <Button onClick={finishSession} disabled={loading}>
              {loading ? "終了中..." : "終了"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FlowSessionPage;