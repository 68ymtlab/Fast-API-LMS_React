"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AlertCircle, CheckCircle, Edit, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";
import withAuth from "@/hocs/withAuth";

const nicknameSchema = z.object({
  nickname: z.string().min(1, "ニックネームを入力してください").max(50, "ニックネームは50文字以内で入力してください"),
});

type NicknameFormData = z.infer<typeof nicknameSchema>;

function UserSettingsPage() {
  const { loginUser, isLoadingUser } = useLoginUser();
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isEditingNickname, setIsEditingNickname] = useState(false);

  const form = useForm<NicknameFormData>({
    resolver: zodResolver(nicknameSchema),
    defaultValues: {
      nickname: "",
    },
  });

  useEffect(() => {
    if (!isLoadingUser && !loginUser) {
      router.push("/login");
    }
  }, [loginUser, isLoadingUser, router]);

  useEffect(() => {
    if (loginUser) {
      fetchNickname();
    }
  }, [loginUser]);

  const fetchNickname = async () => {
    try {
      const response = await axios.get("/get_nickname");
      setNickname(response.data);
      form.setValue("nickname", response.data);
    } catch (error) {
      console.error("Error fetching nickname:", error);
    }
  };

  const onSubmitNickname = async (data: NicknameFormData) => {
    setLoading(true);
    setErrorMessage("");
    setSuccess(false);

    try {
      const response = await axios.post("/update_nickname", {
        nickname: data.nickname,
      });

      if (response.data.success) {
        setSuccess(true);
        setNickname(data.nickname);
        setIsEditingNickname(false);
      } else {
        setErrorMessage(response.data.error_msg || "ニックネームの更新に失敗しました");
      }
    } catch (error: any) {
      console.error("Error updating nickname:", error);
      setErrorMessage("ニックネームの更新に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = () => {
    router.push("/settings/password");
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
          <CardTitle className="text-2xl">ユーザー設定</CardTitle>
          <CardDescription>
            アカウント情報の確認と変更ができます
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success && (
            <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                設定が正常に更新されました
              </AlertDescription>
            </Alert>
          )}

          {errorMessage && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-6">
            {/* ユーザー基本情報 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-1">ユーザー名</h3>
                <p className="text-lg">{loginUser?.username}</p>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-1">メールアドレス</h3>
                <p className="text-lg">{loginUser?.email}</p>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-1">ユーザー種別</h3>
                <p className="text-lg">学生</p>
              </div>
            </div>

            {/* ニックネーム設定 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">ニックネーム設定</h3>
                {!isEditingNickname && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingNickname(true)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    変更
                  </Button>
                )}
              </div>

              {isEditingNickname ? (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmitNickname)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="nickname"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ニックネーム（コミュニティ内での表示名）</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="ニックネームを入力"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex gap-2">
                      <Button type="submit" disabled={loading}>
                        {loading ? "更新中..." : "保存"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsEditingNickname(false);
                          form.setValue("nickname", nickname);
                        }}
                        disabled={loading}
                      >
                        キャンセル
                      </Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-lg">{nickname || "設定されていません"}</p>
                </div>
              )}
            </div>

            {/* パスワード設定 */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">パスワード設定</h3>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <EyeOff className="h-4 w-4 text-gray-500" />
                  <span className="text-lg">●●●●●●●●</span>
                </div>
                <Button variant="outline" onClick={handlePasswordUpdate}>
                  <Edit className="h-4 w-4 mr-2" />
                  パスワード変更
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default withAuth(UserSettingsPage, ["student"]);