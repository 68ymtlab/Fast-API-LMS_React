"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AlertCircle, CheckCircle, Info, Image, Hash, BookOpen, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import axios from "@/lib/axios";
import WeekImageEditor from "./WeekImageEditor";

const formSchema = z.object({
  weekName: z.string().min(1, "コンテンツ名を入力してください").max(100, "コンテンツ名は100文字以内で入力してください"),
  weekNum: z.number().min(1, "回数を入力してください"),
  order: z.number().min(1, "並び順を入力してください"),
});

type FormData = z.infer<typeof formSchema>;

interface WeekInfo {
  week_name: string;
  week_num: number;
  order: number;
  update_answer: boolean;
}

interface WeekInfoEditorProps {
  courseId: string;
  weekId: string;
}

function WeekInfoEditor({ courseId, weekId }: WeekInfoEditorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [weekInfo, setWeekInfo] = useState<WeekInfo | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      weekName: "",
      weekNum: 1,
      order: 1,
    },
  });

  useEffect(() => {
    fetchWeekInfo();
  }, [weekId]);

  const fetchWeekInfo = async () => {
    try {
      setInitialLoading(true);
      const response = await axios.get(`/get_week/${weekId}`);
      const data = response.data;
      setWeekInfo(data);

      form.reset({
        weekName: data.week_name,
        weekNum: data.week_num,
        order: data.order,
      });
    } catch (error) {
      console.error("Error fetching week info:", error);
      setErrorMessage("週次情報の取得に失敗しました");
    } finally {
      setInitialLoading(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setErrorMessage("");
    setSuccess(false);

    try {
      const updateData = {
        week_id: weekId,
        week_name: data.weekName,
        week_num: data.weekNum,
        order: data.order,
      };

      const response = await axios.post("/update_week", updateData);

      if (response.data.success) {
        setSuccess(true);
        setShowSuccessDialog(true);
        await fetchWeekInfo(); // データを再取得
        setTimeout(() => {
          setShowSuccessDialog(false);
        }, 2000);
      } else {
        setErrorMessage(response.data.error_msg || "週次情報の更新に失敗しました");
      }
    } catch (error: any) {
      console.error("Error updating week:", error);
      setErrorMessage("週次情報の更新に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      const response = await axios.post("/delete_week", {
        week_id: weekId,
      });

      if (response.data.success) {
        router.push(`/t/course/${courseId}`);
      } else {
        setErrorMessage("週次コンテンツの削除に失敗しました");
      }
    } catch (error) {
      console.error("Error deleting week:", error);
      setErrorMessage("週次コンテンツの削除に失敗しました");
    }
    setShowDeleteDialog(false);
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!weekInfo) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-red-500">週次情報が見つかりません</p>
        </CardContent>
      </Card>
    );
  }

  const canUpdate = weekInfo.update_answer;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="info" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="info" className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            コース情報
          </TabsTrigger>
          <TabsTrigger value="image" className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            画像
          </TabsTrigger>
          <TabsTrigger value="keyword" className="flex items-center gap-2">
            <Hash className="h-4 w-4" />
            キーワード
          </TabsTrigger>
          <TabsTrigger value="material" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            関連教材
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">コンテンツ情報の編集</CardTitle>
            </CardHeader>
            <CardContent>
              {errorMessage && (
                <Alert variant="destructive" className="mb-6">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              {!canUpdate && (
                <Alert className="mb-6">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    この週次コンテンツは編集権限がないため、表示のみとなります
                  </AlertDescription>
                </Alert>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {/* コンテンツ名 */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                    <div className="md:col-span-1">
                      <div className="bg-gray-100 p-4 rounded-lg h-full flex items-center justify-center">
                        <h3 className="font-semibold text-center">コンテンツ名</h3>
                      </div>
                    </div>
                    <div className="md:col-span-3">
                      <FormField
                        control={form.control}
                        name="weekName"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                placeholder="例）数列の和"
                                {...field}
                                disabled={loading || !canUpdate}
                                className="text-base"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* 回数 */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                    <div className="md:col-span-1">
                      <div className="bg-gray-100 p-4 rounded-lg h-full flex items-center justify-center">
                        <h3 className="font-semibold text-center">回</h3>
                      </div>
                    </div>
                    <div className="md:col-span-3">
                      <div className="flex items-center gap-2">
                        <span>第</span>
                        <FormField
                          control={form.control}
                          name="weekNum"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="1"
                                  placeholder="1"
                                  {...field}
                                  disabled={loading || !canUpdate}
                                  className="w-24"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <span>回</span>
                      </div>
                    </div>
                  </div>

                  {/* 並び順 */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                    <div className="md:col-span-1">
                      <div className="bg-gray-100 p-4 rounded-lg h-full flex items-center justify-center">
                        <h3 className="font-semibold text-center">並び順</h3>
                      </div>
                    </div>
                    <div className="md:col-span-3">
                      <FormField
                        control={form.control}
                        name="order"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                placeholder="1"
                                {...field}
                                disabled={loading || !canUpdate}
                                className="w-24"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex justify-center gap-4 pt-6">
                    {canUpdate && (
                      <>
                        <Button
                          type="submit"
                          disabled={loading}
                          className="px-8"
                        >
                          {loading ? "更新中..." : "更新"}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setShowDeleteDialog(true)}
                          disabled={loading}
                          className="px-8"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          削除
                        </Button>
                      </>
                    )}
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="image" className="mt-6">
          <WeekImageEditor />
        </TabsContent>

        <TabsContent value="keyword" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">キーワード管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500 text-center py-8">キーワード管理機能は実装予定です</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="material" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">関連教材管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500 text-center py-8">関連教材管理機能は実装予定です</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 成功ダイアログ */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <DialogTitle className="text-xl">更新完了</DialogTitle>
            <DialogDescription>
              週次情報が正常に更新されました
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-red-600">週次コンテンツの削除</DialogTitle>
            <DialogDescription>
              この週次コンテンツを削除しますか？この操作は取り消すことができません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
            >
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WeekInfoEditor;