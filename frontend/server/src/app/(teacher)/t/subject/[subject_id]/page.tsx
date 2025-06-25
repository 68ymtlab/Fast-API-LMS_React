"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import axios from "@/lib/axios";
import { BarChart2, Calendar, Clock, FileText, Loader2, Users } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Course = {
  course_id: number;
  course_name: string;
  subject_name: string;
  period: string;
  username: string;
  last_accessed?: string;
};

type ApiResponse = {
  created: Course[];
  shared: Course[];
};

export const SubjectPage = () => {
  const { logout } = useAuth();
  const params = useParams();
  const router = useRouter();
  const [createdCourses, setCreatedCourses] = useState<Course[]>([]);
  const [sharedCourses, setSharedCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingButtons, setLoadingButtons] = useState<{ [key: string]: boolean }>({});
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // コース作成用の状態
  const [courseName, setCourseName] = useState("");
  const [startDate, setStartDate] = useState({
    year: "",
    month: "",
    day: "",
    hour: "",
    minute: "",
  });
  const [endDate, setEndDate] = useState({
    year: "",
    month: "",
    day: "",
    hour: "",
    minute: "",
  });
  const [weeks, setWeeks] = useState<number>(1);
  const [isCreating, setIsCreating] = useState(false);

  const handleButtonClick = async (buttonId: string, callback: () => Promise<void> | void) => {
    setLoadingButtons((prev) => ({ ...prev, [buttonId]: true }));
    try {
      await callback();
    } finally {
      setTimeout(() => {
        setLoadingButtons((prev) => ({ ...prev, [buttonId]: false }));
      }, 500);
    }
  };

  useEffect(() => {
    const fetchCourses = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await axios.get<ApiResponse>(`/get_created_courses/${params.subject_id}`, {
          withCredentials: true,
        });
        if (response.status === 200) {
          setCreatedCourses(response.data.created || []);
          setSharedCourses(response.data.shared || []);
        } else {
          setError("コース情報の取得に失敗しました");
        }
      } catch (_error) {
        setError("コース情報の取得に失敗しました");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCourses();
  }, [params.subject_id]);

  // 日時を結合する関数
  const combineDateTime = (date: { year: string; month: string; day: string; hour: string; minute: string }) => {
    const { year, month, day, hour, minute } = date;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00`;
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const response = await axios.post(
        "/create_course",
        {
          subject_id: params.subject_id,
          course_name: courseName,
          start_date_time: combineDateTime(startDate),
          end_date_time: combineDateTime(endDate),
          weeks: weeks,
        },
        { withCredentials: true },
      );

      if (response.data.success) {
        setIsCreateDialogOpen(false);
        // コース一覧を更新
        const coursesResponse = await axios.get<ApiResponse>(`/get_created_courses/${params.subject_id}`, {
          withCredentials: true,
        });
        if (coursesResponse.status === 200) {
          setCreatedCourses(coursesResponse.data.created || []);
          setSharedCourses(coursesResponse.data.shared || []);
        }
      }
    } catch (error) {
      console.error("コースの作成に失敗しました:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const CourseCard = ({ course }: { course: Course }) => (
    <Card
      key={course.course_id}
      className="hover:shadow-2xl transition-all duration-300 rounded-2xl overflow-hidden group shadow-lg hover:shadow-primary/10"
    >
      <CardHeader className="p-4 rounded-t-xl border-b border-primary/10 relative">
        <div className="absolute top-1/2 right-8 -translate-y-1/2 opacity-10 text-secondary/50 transform scale-[2.5] pointer-events-none">
          <FileText className="w-10 h-10" />
        </div>
        <div className="flex items-start justify-between">
          <div className="pl-2">
            <p className="text-xs text-gray-500 mb-0.5">コース名</p>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-gray-800">{course.course_name}</h3>
              <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full">必修</span>
              <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2 py-0.5 rounded-full">基礎</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3 bg-white/80 rounded-xl p-3 shadow-inner">
          <Users className="text-primary w-4 h-4" />
          <span className="text-sm text-neutral-700 font-medium">作成者: {course.username}</span>
        </div>
        <div className="flex items-center gap-3 bg-white/80 rounded-xl p-3 shadow-inner">
          <Calendar className="text-primary w-4 h-4" />
          <span className="text-sm text-neutral-700 font-medium">開講期間: {course.period}</span>
        </div>
        <div className="flex items-center gap-3 bg-white/80 rounded-xl p-3 shadow-inner">
          <Clock className="text-primary w-4 h-4" />
          <span className="text-sm text-neutral-700 font-medium">
            最終アクセス:{" "}
            {course.last_accessed ? new Date(course.last_accessed).toLocaleString("ja-JP") : "アクセス履歴なし"}
          </span>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <div className="w-full flex gap-3">
          <Button
            className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-medium py-2 rounded-xl transition-shadow hover:shadow-xl text-sm flex items-center justify-center gap-2"
            onClick={() =>
              handleButtonClick(`course-${course.course_id}`, () => router.push(`/t/course/${course.course_id}`))
            }
            disabled={loadingButtons[`course-${course.course_id}`]}
          >
            {loadingButtons[`course-${course.course_id}`] ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <FileText className="w-4 h-4" />
                コース詳細
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="flex-1 border border-primary/20 hover:bg-primary/5 text-primary font-medium py-2 rounded-xl transition-all text-sm flex items-center justify-center gap-2 bg-white"
            onClick={() =>
              handleButtonClick(`status-${course.course_id}`, () => router.push(`/t/coursescore/${course.course_id}`))
            }
            disabled={loadingButtons[`status-${course.course_id}`]}
          >
            {loadingButtons[`status-${course.course_id}`] ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <BarChart2 className="w-4 h-4" />
                学習状況照会
              </>
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );

  return (
    <>
      <main className="pt-12">
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
          <div className="container mx-auto px-8 py-12 max-w-7xl">
            <div className="flex items-center justify-between mb-12">
              <h2 className="text-3xl font-bold text-gray-800">コース一覧</h2>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="bg-primary hover:bg-primary/90 text-white"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <title>コース追加アイコン</title>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  コースを追加
                </Button>
              </div>
            </div>

            {/* コース作成ダイアログ */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-gray-800">新規コース作成</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateCourse}>
                  <div className="grid gap-6 py-6">
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="courseName" className="text-base font-medium">
                          コース名
                        </Label>
                        <Input
                          id="courseName"
                          value={courseName}
                          onChange={(e) => setCourseName(e.target.value)}
                          className="h-12 text-base"
                          placeholder="コース名を入力してください"
                          required
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-base font-medium">開始日時</Label>
                        <div className="grid grid-cols-5 gap-3">
                          <div className="grid gap-1">
                            <Input
                              type="number"
                              placeholder="年"
                              value={startDate.year}
                              onChange={(e) => setStartDate((prev) => ({ ...prev, year: e.target.value }))}
                              className="h-12 text-base"
                              required
                            />
                            <p className="text-xs text-gray-500">年</p>
                          </div>
                          <div className="grid gap-1">
                            <Input
                              type="number"
                              placeholder="月"
                              min="1"
                              max="12"
                              value={startDate.month}
                              onChange={(e) => setStartDate((prev) => ({ ...prev, month: e.target.value }))}
                              className="h-12 text-base"
                              required
                            />
                            <p className="text-xs text-gray-500">月</p>
                          </div>
                          <div className="grid gap-1">
                            <Input
                              type="number"
                              placeholder="日"
                              min="1"
                              max="31"
                              value={startDate.day}
                              onChange={(e) => setStartDate((prev) => ({ ...prev, day: e.target.value }))}
                              className="h-12 text-base"
                              required
                            />
                            <p className="text-xs text-gray-500">日</p>
                          </div>
                          <div className="grid gap-1">
                            <Input
                              type="number"
                              placeholder="時"
                              min="0"
                              max="23"
                              value={startDate.hour}
                              onChange={(e) => setStartDate((prev) => ({ ...prev, hour: e.target.value }))}
                              className="h-12 text-base"
                              required
                            />
                            <p className="text-xs text-gray-500">時</p>
                          </div>
                          <div className="grid gap-1">
                            <Input
                              type="number"
                              placeholder="分"
                              min="0"
                              max="59"
                              value={startDate.minute}
                              onChange={(e) => setStartDate((prev) => ({ ...prev, minute: e.target.value }))}
                              className="h-12 text-base"
                              required
                            />
                            <p className="text-xs text-gray-500">分</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-base font-medium">終了日時</Label>
                        <div className="grid grid-cols-5 gap-3">
                          <div className="grid gap-1">
                            <Input
                              type="number"
                              placeholder="年"
                              value={endDate.year}
                              onChange={(e) => setEndDate((prev) => ({ ...prev, year: e.target.value }))}
                              className="h-12 text-base"
                              required
                            />
                            <p className="text-xs text-gray-500">年</p>
                          </div>
                          <div className="grid gap-1">
                            <Input
                              type="number"
                              placeholder="月"
                              min="1"
                              max="12"
                              value={endDate.month}
                              onChange={(e) => setEndDate((prev) => ({ ...prev, month: e.target.value }))}
                              className="h-12 text-base"
                              required
                            />
                            <p className="text-xs text-gray-500">月</p>
                          </div>
                          <div className="grid gap-1">
                            <Input
                              type="number"
                              placeholder="日"
                              min="1"
                              max="31"
                              value={endDate.day}
                              onChange={(e) => setEndDate((prev) => ({ ...prev, day: e.target.value }))}
                              className="h-12 text-base"
                              required
                            />
                            <p className="text-xs text-gray-500">日</p>
                          </div>
                          <div className="grid gap-1">
                            <Input
                              type="number"
                              placeholder="時"
                              min="0"
                              max="23"
                              value={endDate.hour}
                              onChange={(e) => setEndDate((prev) => ({ ...prev, hour: e.target.value }))}
                              className="h-12 text-base"
                              required
                            />
                            <p className="text-xs text-gray-500">時</p>
                          </div>
                          <div className="grid gap-1">
                            <Input
                              type="number"
                              placeholder="分"
                              min="0"
                              max="59"
                              value={endDate.minute}
                              onChange={(e) => setEndDate((prev) => ({ ...prev, minute: e.target.value }))}
                              className="h-12 text-base"
                              required
                            />
                            <p className="text-xs text-gray-500">分</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="weeks" className="text-base font-medium">
                          週数
                        </Label>
                        <Input
                          id="weeks"
                          type="number"
                          min="1"
                          value={weeks}
                          onChange={(e) => setWeeks(Number.parseInt(e.target.value))}
                          className="h-12 text-base"
                          placeholder="週数を入力してください"
                          required
                        />
                        <p className="text-sm text-gray-500">コースの週数を設定してください</p>
                      </div>
                    </div>
                  </div>
                  <DialogFooter className="gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                      className="h-12 text-base"
                    >
                      キャンセル
                    </Button>
                    <Button
                      type="submit"
                      disabled={isCreating}
                      className="h-12 text-base bg-primary hover:bg-primary/90"
                    >
                      {isCreating ? "作成中..." : "作成"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {isLoading ? (
              <div className="text-center py-8">読み込み中...</div>
            ) : error ? (
              <div className="text-center py-8 text-red-500">{error}</div>
            ) : (
              <>
                <div className="mb-12">
                  <div className="flex items-center gap-3 mb-6">
                    <h3 className="text-2xl font-semibold text-gray-800">共有中のコース</h3>
                    <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">共有中</span>
                  </div>
                  {sharedCourses.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {sharedCourses.map((course) => (
                        <CourseCard key={course.course_id} course={course} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 bg-white rounded-xl shadow-sm">
                      共有中のコースはありません
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <h3 className="text-2xl font-semibold text-gray-800">作成したコース</h3>
                    <span className="bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full">
                      作成済み
                    </span>
                  </div>
                  {createdCourses.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {createdCourses.map((course) => (
                        <CourseCard key={course.course_id} course={course} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 bg-white rounded-xl shadow-sm">
                      作成したコースはありません
                    </div>
                  )}
                </div>
              </>
            )}
            <Button onClick={logout} className="mt-4">
              ログアウト
            </Button>
          </div>
        </div>
      </main>
    </>
  );
};

export default SubjectPage;
