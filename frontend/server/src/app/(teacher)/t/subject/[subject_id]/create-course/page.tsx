"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AlertCircle, CheckCircle, Calendar, Clock, BookOpen } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";


const formSchema = z.object({
  courseName: z.string().min(1, "コース名を入力してください").max(100, "コース名は100文字以内で入力してください"),
  startYear: z.string().min(4, "年を4桁で入力してください").max(4),
  startMonth: z.string().min(1, "月を入力してください").max(2),
  startDay: z.string().min(1, "日を入力してください").max(2),
  startHour: z.string().min(1, "時を入力してください").max(2),
  startMinute: z.string().min(1, "分を入力してください").max(2),
  endYear: z.string().min(4, "年を4桁で入力してください").max(4),
  endMonth: z.string().min(1, "月を入力してください").max(2),
  endDay: z.string().min(1, "日を入力してください").max(2),
  endHour: z.string().min(1, "時を入力してください").max(2),
  endMinute: z.string().min(1, "分を入力してください").max(2),
  weeks: z.number().min(1, "週数を入力してください"),
}).refine((data) => {
  const startDate = new Date(`${data.startYear}-${data.startMonth.padStart(2, '0')}-${data.startDay.padStart(2, '0')}T${data.startHour.padStart(2, '0')}:${data.startMinute.padStart(2, '0')}:00`);
  const endDate = new Date(`${data.endYear}-${data.endMonth.padStart(2, '0')}-${data.endDay.padStart(2, '0')}T${data.endHour.padStart(2, '0')}:${data.endMinute.padStart(2, '0')}:00`);
  return endDate > startDate;
}, {
  message: "終了日時は開始日時より後に設定してください",
  path: ["endYear"],
});

type FormData = z.infer<typeof formSchema>;

function CreateCoursePage() {
  const { loginUser, isLoadingUser } = useLoginUser();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      courseName: "",
      startYear: new Date().getFullYear().toString(),
      startMonth: "4",
      startDay: "1",
      startHour: "00",
      startMinute: "00",
      endYear: (new Date().getFullYear() + 1).toString(),
      endMonth: "3",
      endDay: "31",
      endHour: "23",
      endMinute: "59",
      weeks: 15,
    },
  });

  useEffect(() => {
    if (!isLoadingUser && !loginUser) {
      router.push("/login");
    }
  }, [loginUser, isLoadingUser, router]);

  const combineDateTime = (year: string, month: string, day: string, hour: string, minute: string) => {
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`;
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setErrorMessage("");
    setSuccess(false);

    try {
      const courseData = {
        subject_id: params.subject_id,
        course_name: data.courseName,
        start_date_time: combineDateTime(data.startYear, data.startMonth, data.startDay, data.startHour, data.startMinute),
        end_date_time: combineDateTime(data.endYear, data.endMonth, data.endDay, data.endHour, data.endMinute),
        weeks: data.weeks,
      };

      const response = await axios.post("/create_course", courseData);

      if (response.data.success) {
        setSuccess(true);
        setShowSuccessDialog(true);
        setTimeout(() => {
          setShowSuccessDialog(false);
          router.push(`/t/subject/${params.subject_id}`);
        }, 2000);
      } else {
        setErrorMessage(response.data.error_msg || "コースの作成に失敗しました");
      }
    } catch (error: any) {
      console.error("Error creating course:", error);
      setErrorMessage("コースの作成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.push(`/t/subject/${params.subject_id}`);
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
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            新規コースの登録
          </CardTitle>
          <CardDescription>
            新しいコースを作成し、学生の学習環境を整備します
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* コース名 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                <div className="md:col-span-1">
                  <div className="bg-gray-100 p-4 rounded-lg h-full flex items-center justify-center">
                    <h3 className="font-semibold text-center">コース名</h3>
                  </div>
                </div>
                <div className="md:col-span-3">
                  <FormField
                    control={form.control}
                    name="courseName"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            placeholder="例）線形代数学_1AA1"
                            {...field}
                            disabled={loading}
                            className="text-base"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* 表示開始日時 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                <div className="md:col-span-1">
                  <div className="bg-gray-100 p-4 rounded-lg h-full flex items-center justify-center">
                    <h3 className="font-semibold text-center flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      表示開始日時
                    </h3>
                  </div>
                </div>
                <div className="md:col-span-3 space-y-4">
                  <div className="flex items-center gap-2">
                    <FormField
                      control={form.control}
                      name="startYear"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="2024"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <span>年</span>
                    <FormField
                      control={form.control}
                      name="startMonth"
                      render={({ field }) => (
                        <FormItem className="w-20">
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="12"
                              placeholder="4"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <span>月</span>
                    <FormField
                      control={form.control}
                      name="startDay"
                      render={({ field }) => (
                        <FormItem className="w-20">
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="31"
                              placeholder="1"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <span>日</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FormField
                      control={form.control}
                      name="startHour"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="23"
                              placeholder="00"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <span>時</span>
                    <FormField
                      control={form.control}
                      name="startMinute"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="59"
                              placeholder="00"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <span>分</span>
                  </div>
                </div>
              </div>

              {/* 表示終了日時 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                <div className="md:col-span-1">
                  <div className="bg-gray-100 p-4 rounded-lg h-full flex items-center justify-center">
                    <h3 className="font-semibold text-center flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      表示終了日時
                    </h3>
                  </div>
                </div>
                <div className="md:col-span-3 space-y-4">
                  <div className="flex items-center gap-2">
                    <FormField
                      control={form.control}
                      name="endYear"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="2025"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <span>年</span>
                    <FormField
                      control={form.control}
                      name="endMonth"
                      render={({ field }) => (
                        <FormItem className="w-20">
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="12"
                              placeholder="3"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <span>月</span>
                    <FormField
                      control={form.control}
                      name="endDay"
                      render={({ field }) => (
                        <FormItem className="w-20">
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="31"
                              placeholder="31"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <span>日</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FormField
                      control={form.control}
                      name="endHour"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="23"
                              placeholder="23"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <span>時</span>
                    <FormField
                      control={form.control}
                      name="endMinute"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="59"
                              placeholder="59"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <span>分</span>
                  </div>
                </div>
              </div>

              {/* 週数 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                <div className="md:col-span-1">
                  <div className="bg-gray-100 p-4 rounded-lg h-full flex items-center justify-center">
                    <h3 className="font-semibold text-center">週数</h3>
                  </div>
                </div>
                <div className="md:col-span-3">
                  <FormField
                    control={form.control}
                    name="weeks"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="1"
                              placeholder="15"
                              {...field}
                              disabled={loading}
                              className="w-32"
                            />
                            <span>回</span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="flex justify-center gap-4 pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={loading}
                  className="px-8"
                >
                  キャンセル
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="px-8"
                >
                  {loading ? "作成中..." : "作成"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* 成功ダイアログ */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <DialogTitle className="text-xl">登録完了</DialogTitle>
            <DialogDescription>
              コースが正常に登録されました
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CreateCoursePage;