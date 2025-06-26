"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, BookOpen, Plus, Users, BarChart3, Eye, Calendar, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";

interface SubjectInfo {
  subject_id: number;
  subject_name: string;
}

interface CourseInfo {
  course_id: number;
  course_name: string;
  period: string;
  teacher_name: string;
  student_count: number;
  week_count: number;
  update_answer: boolean;
  is_shared: boolean;
}

interface CreatedCoursesData {
  subject_info: SubjectInfo;
  created_courses: CourseInfo[];
  shared_courses: CourseInfo[];
}

function SubjectPage() {
  const { loginUser, isLoadingUser } = useLoginUser();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [subjectData, setSubjectData] = useState<CreatedCoursesData | null>(null);

  useEffect(() => {
    if (!isLoadingUser && !loginUser) {
      router.push("/login");
    }
  }, [loginUser, isLoadingUser, router]);

  useEffect(() => {
    if (params.subject_id) {
      fetchSubjectData();
    }
  }, [params.subject_id]);

  const fetchSubjectData = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const response = await axios.get(`/get_created_courses/${params.subject_id}`);
      setSubjectData(response.data);
    } catch (error) {
      console.error("Error fetching subject data:", error);
      setErrorMessage("科目データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const navigateToCourse = (courseId: number) => {
    router.push(`/t/course/${courseId}`);
  };

  const navigateToCourseScore = (courseId: number) => {
    router.push(`/t/course/${courseId}/score`);
  };

  const navigateToCourseTaking = (courseId: number) => {
    router.push(`/t/course/${courseId}/taking`);
  };

  const createNewCourse = () => {
    router.push(`/t/subject/${params.subject_id}/create-course`);
  };

  const goBackToHome = () => {
    router.push("/t/home");
  };

  const renderCourseCard = (course: CourseInfo, isShared: boolean = false) => (
    <Card key={course.course_id} className={`${isShared ? 'bg-blue-50 border-blue-200' : ''}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              {course.course_name}
              {isShared && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  共有
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              {course.period} | 担当: {course.teacher_name}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {course.update_answer && (
              <Badge variant="default">編集可能</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            <span className="text-sm">履修者: {course.student_count}人</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <span className="text-sm">週数: {course.week_count}週</span>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => navigateToCourse(course.course_id)}
            variant="default"
            size="sm"
            className="flex items-center gap-2"
          >
            <BookOpen className="h-4 w-4" />
            コース管理
          </Button>
          
          <Button
            onClick={() => navigateToCourseScore(course.course_id)}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            成績管理
          </Button>
          
          <Button
            onClick={() => navigateToCourseTaking(course.course_id)}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <Users className="h-4 w-4" />
            履修者管理
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* ヘッダー */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <BookOpen className="h-6 w-6" />
                {subjectData?.subject_info?.subject_name || "科目管理"}
              </CardTitle>
              <CardDescription>
                この科目に含まれるコースを管理できます
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={goBackToHome}>
                ホームに戻る
              </Button>
              <Button onClick={createNewCourse} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                新しいコースを作成
              </Button>
            </div>
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
      ) : (
        <div className="space-y-8">
          {/* 作成したコース */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="h-5 w-5" />
              <h2 className="text-xl font-semibold">作成したコース</h2>
              {subjectData?.created_courses && (
                <Badge variant="outline">
                  {subjectData.created_courses.length}件
                </Badge>
              )}
            </div>
            
            {subjectData?.created_courses?.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <BookOpen className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-500 mb-4">まだコースが作成されていません</p>
                  <Button onClick={createNewCourse} className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    最初のコースを作成
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid lg:grid-cols-2 gap-6">
                {subjectData?.created_courses?.map((course) => renderCourseCard(course))}
              </div>
            )}
          </div>

          {/* 共有されたコース */}
          {subjectData?.shared_courses && subjectData.shared_courses.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5" />
                <h2 className="text-xl font-semibold">共有されたコース</h2>
                <Badge variant="outline" className="bg-blue-100 text-blue-800">
                  {subjectData.shared_courses.length}件
                </Badge>
              </div>
              
              <div className="grid lg:grid-cols-2 gap-6">
                {subjectData.shared_courses.map((course) => renderCourseCard(course, true))}
              </div>
            </div>
          )}

          {/* 統計情報 */}
          {subjectData && (
            <Card className="bg-gray-50 border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">科目統計</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {subjectData.created_courses?.length || 0}
                    </div>
                    <div className="text-sm text-gray-600">作成したコース</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {subjectData.shared_courses?.length || 0}
                    </div>
                    <div className="text-sm text-gray-600">共有されたコース</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {subjectData.created_courses?.reduce((sum, course) => sum + course.student_count, 0) || 0}
                    </div>
                    <div className="text-sm text-gray-600">総履修者数</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {subjectData.created_courses?.reduce((sum, course) => sum + course.week_count, 0) || 0}
                    </div>
                    <div className="text-sm text-gray-600">総週数</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default SubjectPage;