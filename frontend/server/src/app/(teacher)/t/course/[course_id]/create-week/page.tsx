"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AlertCircle, CheckCircle, Upload, FolderOpen, CalendarDays } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";


const formSchema = z.object({
  weekName: z.string().min(1, "週名を入力してください").max(100, "週名は100文字以内で入力してください"),
  weekNum: z.number().min(1, "週番号を入力してください"),
  order: z.number().min(1, "並び順を入力してください"),
});

type FormData = z.infer<typeof formSchema>;

interface FileItem {
  file_path: string;
  file_text: string;
}

function CreateWeekPage() {
  const { loginUser, isLoadingUser } = useLoginUser();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFolderName, setSelectedFolderName] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      weekName: "線形代数学_第1週",
      weekNum: 1,
      order: 1,
    },
  });

  useEffect(() => {
    if (!isLoadingUser && !loginUser) {
      router.push("/login");
    }
  }, [loginUser, isLoadingUser, router]);

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const readFileAsBinary = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as ArrayBuffer;
        const uint8Array = new Uint8Array(result);
        let binaryString = "";
        
        for (let i = 0; i < uint8Array.length; i++) {
          const hex = uint8Array[i] < 0x10 ? "0" + uint8Array[i].toString(16) : uint8Array[i].toString(16);
          binaryString += "\\x" + hex;
        }
        
        resolve(binaryString);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) {
      setFiles([]);
      setSelectedFolderName("");
      return;
    }

    const fileForUpload: FileItem[] = [];
    
    // フォルダ名を取得（最初のファイルのパスから）
    const firstFile = selectedFiles[0];
    if (firstFile.webkitRelativePath) {
      const pathParts = firstFile.webkitRelativePath.split('/');
      setSelectedFolderName(pathParts[0]);
    }

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const filePath = file.webkitRelativePath;
        
        let fileContent: string;
        
        if (file.type.startsWith('image/')) {
          // 画像ファイルはバイナリとして読み取り
          fileContent = await readFileAsBinary(file);
        } else {
          // その他のファイルはテキストとして読み取り
          fileContent = await readFileAsText(file);
        }
        
        fileForUpload.push({
          file_path: filePath,
          file_text: fileContent
        });
      }
      
      setFiles(fileForUpload);
    } catch (error) {
      console.error("Error reading files:", error);
      setErrorMessage("ファイルの読み取りに失敗しました");
    }
  }, []);

  const validateForm = () => {
    if (files.length === 0) {
      setErrorMessage("登録するコースのフォルダを選択してください");
      return false;
    }
    return true;
  };

  const onSubmit = async (data: FormData) => {
    if (!validateForm()) return;

    setLoading(true);
    setErrorMessage("");

    try {
      const weekData = {
        week_name: data.weekName,
        week_num: data.weekNum,
        order: data.order,
        course_id: params.course_id,
        week_files: files
      };

      const response = await axios.post("/register_week", weekData);

      if (response.data.success) {
        setShowSuccessDialog(true);
        setTimeout(() => {
          setShowSuccessDialog(false);
          router.push(`/t/course/${params.course_id}`);
        }, 2000);
      } else {
        setErrorMessage(response.data.error_msg || "週次コンテンツの登録に失敗しました");
      }
    } catch (error: any) {
      console.error("Error creating week:", error);
      setErrorMessage("週次コンテンツの登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.push(`/t/course/${params.course_id}`);
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
            <CalendarDays className="h-6 w-6" />
            新規週次コンテンツの登録
          </CardTitle>
          <CardDescription>
            新しい週次学習コンテンツを作成し、学生に提供します
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
              {/* 週名 */}
              <FormField
                control={form.control}
                name="weekName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">週名</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="例）線形代数学_第1週"
                        {...field}
                        disabled={loading}
                        className="text-base"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 週番号と並び順 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="weekNum"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">第○週、第○回</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          placeholder="1"
                          {...field}
                          disabled={loading}
                          className="text-base"
                        />
                      </FormControl>
                      <p className="text-sm text-gray-500">数値のみを入力してください</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">並び順</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          placeholder="1"
                          {...field}
                          disabled={loading}
                          className="text-base"
                        />
                      </FormControl>
                      <p className="text-sm text-gray-500">数値のみを入力してください　昇順でコンテンツが並びます</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* ファイルアップロード */}
              <div className="space-y-4">
                <FormLabel className="text-base font-semibold">コンテンツファイル</FormLabel>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <FolderOpen className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <div className="space-y-2">
                    <p className="text-base font-medium">フォルダを選択してください</p>
                    <p className="text-sm text-gray-500">
                      週次コンテンツが含まれるフォルダを選択してアップロードします
                    </p>
                  </div>
                  <input
                    type="file"
                    // @ts-ignore
                    webkitdirectory=""
                    multiple
                    onChange={handleFileChange}
                    className="mt-4 block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-primary file:text-white
                      hover:file:bg-primary/90"
                    disabled={loading}
                  />
                </div>

                {selectedFolderName && (
                  <Alert className="border-blue-200 bg-blue-50">
                    <Upload className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                      選択されたフォルダ: <strong>{selectedFolderName}</strong> ({files.length}ファイル)
                    </AlertDescription>
                  </Alert>
                )}
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
                  disabled={loading || files.length === 0}
                  className="px-8"
                >
                  {loading ? "登録中..." : "コースを登録"}
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
              週次コンテンツが正常に登録されました
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CreateWeekPage;