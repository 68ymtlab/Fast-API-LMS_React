"use client";

import { MathJax } from "@/components/shared/MathJax";
import axios from "@/lib/axios";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMediaQuery } from "react-responsive";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type LessonType = {
  week_name: string;
  page_num: number;
  content: string;
  week_id?: string;
};

export const LessonPage = () => {
  const isMobile = useMediaQuery({ query: "(max-width: 768px)" });
  const router = useRouter();
  const params = useParams();
  const course_id = params.course_id as string;
  const lesson_id = params.lesson_id as string;
  const page = params.page as string;

  const [lesson, setLesson] = useState<LessonType | null>(null);
  const [content, setContent] = useState<string>("");

  const getLessonContent = async (page: string) => {
    const response = await axios.get(`/get_week_content/${lesson_id}/${page}`);
    console.log(response.data);
    setLesson(response.data);
    setContent(response.data.content);
  };

  useEffect(() => {
    getLessonContent(page);
  }, [page]);

  const go_previous_page = () => {
    router.push(`/lesson/${course_id}/${lesson_id}/${Number(page) - 1}`);
  };

  const go_next_page = () => {
    router.push(`/lesson/${course_id}/${lesson_id}/${Number(page) + 1}`);
  };

  const go_lesson_page = () => {
    router.push(`/course/${course_id}`);
  };

  const go_exercise_page = () => {
    if (lesson && lesson.week_id) {
      router.push(`/weekflows/${course_id}/${lesson.week_id}`);
    }
  };

  return (
    <>
      <div className="w-full flex justify-center mb-6 sm:px-4 p-4 md:px-8 py-4 sm:py-8 max-w-full md:max-w-7xl">
        {lesson && (
          <Tabs value={Number(page) <= (lesson?.page_num ?? 0) ? page : "exercise"} className="smart-tabs-bar">
            <TabsList className="flex flex-wrap underline-tabs-bar">
              {Array.from({ length: lesson?.page_num ?? 0 }, (_, i) => (
                <TabsTrigger
                  key={i + 1}
                  value={(i + 1).toString()}
                  className="smart-tab-btn flex-1 text-center px-1 py-2 text-sm sm:text-base"
                  onClick={() => router.push(`/lesson/${course_id}/${lesson_id}/${i + 1}`)}
                >
                  {i + 1}
                </TabsTrigger>
              ))}
              <TabsTrigger
                key="exercise"
                value="exercise"
                className="smart-tab-btn exercise flex-1 text-center px-1 py-2 text-sm sm:text-base"
                onClick={() => lesson?.week_id && router.push(`/weekflows/${course_id}/${lesson.week_id}`)}
              >
                演習問題へ →
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      {isMobile ? (
        <div className="flex flex-col textbook p-4">
          <h1>
            第{lesson_id}回 _ {lesson?.week_name}
          </h1>
          <MathJax text={content} />
        </div>
      ) : (
        <div className="container textbook sm:px-4 md:px-8 py-4 sm:py-8 max-w-full md:max-w-7xl">
          <h1>
            第{lesson_id}回 _ {lesson?.week_name}
          </h1>
          <MathJax text={content} />
          <div className="flex mt-4 justify-between items-center sm:px-4 md:px-8 py-4 sm:py-8 max-w-full md:max-w-7xl">
            {Number(page) !== 1 ? (
              <Button className="default align-middle" onClick={go_previous_page}>
                前のページ
              </Button>
            ) : (
              <span />
            )}
            {Number(page) === lesson?.page_num ? (
              <Button className="default align-middle" onClick={go_lesson_page}>
                コンテンツ一覧に戻る
              </Button>
            ) : (
              <span />
            )}
          </div>
          {Number(page) < lesson?.page_num && (
            <Button className="ml-auto mt-8 block" onClick={go_next_page}>
              次のページ
            </Button>
          )}
        </div>
      )}
    </>
  );
};

export default LessonPage;
