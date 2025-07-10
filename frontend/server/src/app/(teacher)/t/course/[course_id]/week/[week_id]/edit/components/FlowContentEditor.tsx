"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AlertCircle, CheckCircle, Plus, Trash2, Eye, Edit, Save } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MathJax } from "@/components/shared/MathJax";
import axios from "@/lib/axios";

interface FlowInfo {
  flow_id: number;
  id_in_yml: string;
  flow_title: string;
  welcome_page_content: string;
  completion_page_content: string;
  page_groups: PageGroup[];
}

interface PageGroup {
  group_id: number;
  group_name: string;
  order: number;
  flowpages: FlowPage[];
}

interface FlowPage {
  flowpage_id: number;
  title: string;
  order: number;
  page_type: string;
  content: string;
  hint_comment: string;
  answer_comment: string;
  correct_answers: CorrectAnswer[];
  choices: Choice[];
  correct_choices: number[];
}

interface CorrectAnswer {
  blank_id?: string;
  blank_name?: string;
  symble?: string;
  type: string;
  value: string;
  answers?: string;
}

interface Choice {
  choice_id: string;
  order: number;
  choice_text: string;
  content?: string;
}

interface FlowContentEditorProps {
  courseId: string;
  weekId: string;
}

const pageTypes = ["SingleTextQuestion", "MultipleTextQuestion", "ChoiceQuestion"];
const answerTypes = ["str", "int", "float"];

function FlowContentEditor({ courseId, weekId }: FlowContentEditorProps) {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [flowInfo, setFlowInfo] = useState<FlowInfo[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<FlowInfo | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<PageGroup | null>(null);
  const [selectedPage, setSelectedPage] = useState<FlowPage | null>(null);
  const [isAddingContent, setIsAddingContent] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [previewHint, setPreviewHint] = useState("");
  const [previewAnswer, setPreviewAnswer] = useState("");
  const [selectedChoices, setSelectedChoices] = useState<Choice[]>([]);

  useEffect(() => {
    fetchFlowInfo();
  }, [weekId]);

  const fetchFlowInfo = async () => {
    try {
      setInitialLoading(true);
      // この部分は実際のAPIエンドポイントに合わせて調整してください
      const response = await axios.get(`/get_week_flowpage/${weekId}`);
      setFlowInfo(response.data);
    } catch (error) {
      console.error("Error fetching flow info:", error);
      setErrorMessage("演習問題情報の取得に失敗しました");
    } finally {
      setInitialLoading(false);
    }
  };

  const updatePreview = (content: string, hint: string, answer: string) => {
    // 学生側と同じシンプルな実装に変更
    setPreviewContent(content);
    setPreviewHint(hint);
    setPreviewAnswer(answer);
  };

  const handleFlowSelect = (flow: FlowInfo) => {
    setSelectedFlow(flow);
    setSelectedGroup(null);
    setSelectedPage(null);
    setIsAddingContent(flow.flow_id === 0);
  };

  const handleGroupSelect = (group: PageGroup) => {
    setSelectedGroup(group);
    setSelectedPage(null);
    setIsAddingContent(group.group_id === 0);
  };

  const handlePageSelect = (page: FlowPage) => {
    setSelectedPage(page);
    setIsAddingContent(page.flowpage_id === 0);
    updatePreview(page.content, page.hint_comment, page.answer_comment);
  };

  const addFlow = () => {
    const newFlow: FlowInfo = {
      flow_id: 0,
      id_in_yml: "",
      flow_title: "",
      welcome_page_content: "",
      completion_page_content: "",
      page_groups: [],
    };
    setFlowInfo([...flowInfo, newFlow]);
    handleFlowSelect(newFlow);
  };

  const addGroup = () => {
    if (!selectedFlow) return;
    const newGroup: PageGroup = {
      group_id: 0,
      group_name: "",
      order: 0,
      flowpages: [],
    };
    selectedFlow.page_groups.push(newGroup);
    handleGroupSelect(newGroup);
  };

  const addPage = () => {
    if (!selectedGroup) return;
    const newPage: FlowPage = {
      flowpage_id: 0,
      title: "",
      order: 0,
      page_type: "",
      content: "",
      hint_comment: "",
      answer_comment: "",
      correct_answers: [],
      choices: [],
      correct_choices: [],
    };
    selectedGroup.flowpages.push(newPage);
    handlePageSelect(newPage);
  };

  const addAnswer = () => {
    if (!selectedPage) return;
    
    if (["SingleTextQuestion", "single_text_question"].includes(selectedPage.page_type)) {
      selectedPage.correct_answers.push({
        blank_name: "",
        type: "",
        value: "",
      });
    } else if (["MultipleTextQuestion", "multiple_text_question"].includes(selectedPage.page_type)) {
      selectedPage.correct_answers.push({
        blank_id: "",
        symble: "",
        type: "",
        value: "",
        answers: "",
      });
    } else if (["ChoiceQuestion", "choice_question"].includes(selectedPage.page_type)) {
      selectedPage.choices.push({
        choice_id: "",
        order: selectedPage.choices.length + 1,
        choice_text: "",
        content: "",
      });
    }
  };

  const deleteAnswer = (index: number) => {
    if (!selectedPage) return;
    selectedPage.correct_answers.splice(index, 1);
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
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
          <CardTitle className="text-xl">演習問題編集</CardTitle>
        </CardHeader>
        <CardContent>
          {/* 選択エリア */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {/* Flow選択 */}
            <div>
              <label className="text-sm font-medium mb-2 block">Flow</label>
              <Select 
                value={selectedFlow?.flow_title || ""} 
                onValueChange={(value) => {
                  const flow = flowInfo.find(f => f.flow_title === value);
                  if (flow) handleFlowSelect(flow);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Flowを選択" />
                </SelectTrigger>
                <SelectContent>
                  {flowInfo.map((flow) => (
                    <SelectItem key={flow.flow_id} value={flow.flow_title}>
                      {flow.flow_title}
                    </SelectItem>
                  ))}
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start text-primary"
                    onClick={addFlow}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    追加
                  </Button>
                </SelectContent>
              </Select>
            </div>

            {/* Group選択 */}
            <div>
              <label className="text-sm font-medium mb-2 block">PageGroup</label>
              <Select 
                value={selectedGroup?.group_name || ""} 
                onValueChange={(value) => {
                  const group = selectedFlow?.page_groups.find(g => g.group_name === value);
                  if (group) handleGroupSelect(group);
                }}
                disabled={!selectedFlow || selectedFlow.flow_id === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Groupを選択" />
                </SelectTrigger>
                <SelectContent>
                  {selectedFlow?.page_groups.map((group) => (
                    <SelectItem key={group.group_id} value={group.group_name}>
                      {group.group_name}
                    </SelectItem>
                  ))}
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start text-primary"
                    onClick={addGroup}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    追加
                  </Button>
                </SelectContent>
              </Select>
            </div>

            {/* Page選択 */}
            <div>
              <label className="text-sm font-medium mb-2 block">Page</label>
              <Select 
                value={selectedPage?.title || ""} 
                onValueChange={(value) => {
                  const page = selectedGroup?.flowpages.find(p => p.title === value);
                  if (page) handlePageSelect(page);
                }}
                disabled={!selectedGroup || selectedGroup.group_id === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pageを選択" />
                </SelectTrigger>
                <SelectContent>
                  {selectedGroup?.flowpages.map((page) => (
                    <SelectItem key={page.flowpage_id} value={page.title}>
                      {page.title}
                    </SelectItem>
                  ))}
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start text-primary"
                    onClick={addPage}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    追加
                  </Button>
                </SelectContent>
              </Select>
            </div>

            {/* 操作ボタン */}
            <div className="flex flex-col gap-2">
              <Button 
                onClick={() => {/* 実装: 更新処理 */}}
                disabled={loading || !selectedPage}
              >
                <Save className="h-4 w-4 mr-2" />
                {isAddingContent ? "追加" : "更新"}
              </Button>
            </div>
          </div>

          {/* コンテンツ編集エリア */}
          {selectedPage && (
            <div className="space-y-6">
              {/* 基本情報 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">問題名</label>
                  <Input
                    value={selectedPage.title}
                    onChange={(e) => {
                      selectedPage.title = e.target.value;
                      setSelectedPage({...selectedPage});
                    }}
                    placeholder="演習問題名"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">表示順</label>
                  <Input
                    type="number"
                    value={selectedPage.order}
                    onChange={(e) => {
                      selectedPage.order = parseInt(e.target.value);
                      setSelectedPage({...selectedPage});
                    }}
                    placeholder="表示順"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">形式</label>
                  <Select 
                    value={selectedPage.page_type} 
                    onValueChange={(value) => {
                      selectedPage.page_type = value;
                      setSelectedPage({...selectedPage});
                    }}
                    disabled={!isAddingContent}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="ページタイプ" />
                    </SelectTrigger>
                    <SelectContent>
                      {pageTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 問題文 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">問題文</label>
                  <Textarea
                    value={selectedPage.content}
                    onChange={(e) => {
                      selectedPage.content = e.target.value;
                      setSelectedPage({...selectedPage});
                      // リアルタイムプレビュー更新
                      updatePreview(e.target.value, selectedPage.hint_comment, selectedPage.answer_comment);
                    }}
                    className="min-h-[200px]"
                    placeholder="問題文を入力"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">プレビュー（学生表示）</label>
                  <div className="border border-gray-200 rounded-lg min-h-[200px] bg-white overflow-auto">
                    <div className="container mx-auto p-0">
                      <div className="min-h-[150px]">
                        <div className="p-4">
                          <MathJax text={previewContent} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ヒント */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">ヒント</label>
                  <Textarea
                    value={selectedPage.hint_comment}
                    onChange={(e) => {
                      selectedPage.hint_comment = e.target.value;
                      setSelectedPage({...selectedPage});
                      // リアルタイムプレビュー更新
                      updatePreview(selectedPage.content, e.target.value, selectedPage.answer_comment);
                    }}
                    className="min-h-[150px]"
                    placeholder="ヒントを入力"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">プレビュー（学生表示）</label>
                  <div className="border border-gray-200 rounded-lg min-h-[150px] bg-white overflow-auto">
                    <div className="container mx-auto p-0">
                      <div className="min-h-[100px]">
                        <div className="p-4">
                          <MathJax text={previewHint} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 解説 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">解説</label>
                  <Textarea
                    value={selectedPage.answer_comment}
                    onChange={(e) => {
                      selectedPage.answer_comment = e.target.value;
                      setSelectedPage({...selectedPage});
                      // リアルタイムプレビュー更新
                      updatePreview(selectedPage.content, selectedPage.hint_comment, e.target.value);
                    }}
                    className="min-h-[150px]"
                    placeholder="解説を入力"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">プレビュー（学生表示）</label>
                  <div className="border border-gray-200 rounded-lg min-h-[150px] bg-white overflow-auto">
                    <div className="container mx-auto p-0">
                      <div className="min-h-[100px]">
                        <div className="p-4">
                          <MathJax text={previewAnswer} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 解答設定 */}
              {selectedPage.page_type === "ChoiceQuestion" && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-sm font-medium">選択肢</label>
                    <Button onClick={addAnswer} disabled={!isAddingContent}>
                      <Plus className="h-4 w-4 mr-2" />
                      追加
                    </Button>
                  </div>
                  {selectedPage.choices.map((choice, index) => (
                    <div key={index} className="flex items-center gap-4 mb-2 p-4 bg-gray-50 rounded-lg">
                      <div className="w-16">
                        <Checkbox
                          checked={selectedChoices.includes(choice)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedChoices([...selectedChoices, choice]);
                            } else {
                              setSelectedChoices(selectedChoices.filter(c => c !== choice));
                            }
                          }}
                        />
                        {choice.order}
                      </div>
                      <div className="flex-1">
                        <Input
                          value={choice.choice_id}
                          onChange={(e) => {
                            choice.choice_id = e.target.value;
                            setSelectedPage({...selectedPage});
                          }}
                          placeholder="ID"
                        />
                      </div>
                      <div className="flex-[2]">
                        <Input
                          value={choice.choice_text}
                          onChange={(e) => {
                            choice.choice_text = e.target.value;
                            setSelectedPage({...selectedPage});
                          }}
                          placeholder="選択肢"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {["SingleTextQuestion", "MultipleTextQuestion"].includes(selectedPage.page_type) && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-sm font-medium">解答</label>
                    <Button onClick={addAnswer} disabled={!isAddingContent}>
                      <Plus className="h-4 w-4 mr-2" />
                      追加
                    </Button>
                  </div>
                  {selectedPage.correct_answers.map((answer, index) => (
                    <div key={index} className="flex items-center gap-4 mb-2 p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <Input
                          value={answer.blank_id || ""}
                          onChange={(e) => {
                            answer.blank_id = e.target.value;
                            setSelectedPage({...selectedPage});
                          }}
                          placeholder="ID"
                          disabled={!isAddingContent || selectedPage.page_type === "SingleTextQuestion"}
                        />
                      </div>
                      {selectedPage.page_type === "MultipleTextQuestion" && (
                        <div className="flex-1">
                          <Input
                            value={answer.symble || ""}
                            onChange={(e) => {
                              answer.symble = e.target.value;
                              setSelectedPage({...selectedPage});
                            }}
                            placeholder="記号"
                            disabled={!isAddingContent}
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <Select 
                          value={answer.type} 
                          onValueChange={(value) => {
                            answer.type = value;
                            setSelectedPage({...selectedPage});
                          }}
                          disabled={!isAddingContent}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="形式" />
                          </SelectTrigger>
                          <SelectContent>
                            {answerTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-[2]">
                        <Input
                          value={answer.value}
                          onChange={(e) => {
                            answer.value = e.target.value;
                            setSelectedPage({...selectedPage});
                          }}
                          placeholder="解答"
                          disabled={!isAddingContent}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteAnswer(index)}
                        disabled={!isAddingContent}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Group編集エリア */}
          {selectedGroup && !selectedPage && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">グループ設定</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">グループ名</label>
                  <Input
                    value={selectedGroup.group_name}
                    onChange={(e) => {
                      selectedGroup.group_name = e.target.value;
                      setSelectedGroup({...selectedGroup});
                    }}
                    placeholder="グループ名"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">表示順</label>
                  <Input
                    type="number"
                    value={selectedGroup.order}
                    onChange={(e) => {
                      selectedGroup.order = parseInt(e.target.value);
                      setSelectedGroup({...selectedGroup});
                    }}
                    placeholder="表示順"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Flow編集エリア */}
          {selectedFlow && !selectedGroup && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Flow設定</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">名称</label>
                  <Input
                    value={selectedFlow.id_in_yml}
                    onChange={(e) => {
                      selectedFlow.id_in_yml = e.target.value;
                      setSelectedFlow({...selectedFlow});
                    }}
                    placeholder="コンテンツ内での名称"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">演習問題名</label>
                  <Input
                    value={selectedFlow.flow_title}
                    onChange={(e) => {
                      selectedFlow.flow_title = e.target.value;
                      setSelectedFlow({...selectedFlow});
                    }}
                    placeholder="演習問題名"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">演習開始前</label>
                  <Textarea
                    value={selectedFlow.welcome_page_content}
                    onChange={(e) => {
                      selectedFlow.welcome_page_content = e.target.value;
                      setSelectedFlow({...selectedFlow});
                    }}
                    placeholder="演習問題開始前"
                    className="min-h-[100px]"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">演習終了後</label>
                  <Textarea
                    value={selectedFlow.completion_page_content}
                    onChange={(e) => {
                      selectedFlow.completion_page_content = e.target.value;
                      setSelectedFlow({...selectedFlow});
                    }}
                    placeholder="演習問題終了後"
                    className="min-h-[100px]"
                  />
                </div>
              </div>
            </div>
          )}
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
              演習問題が正常に更新されました
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FlowContentEditor;