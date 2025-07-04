"use client";

import { MathJax } from "@/components/shared/MathJax";
import axios from "@/lib/axios";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMediaQuery } from "react-responsive";

import { Button } from "@/components/ui/button";

export const LessonPage = () => {
  const isMobile = useMediaQuery({ query: "(max-width: 768px)" });
  const router = useRouter();
  const params = useParams();
  const course_id = params.course_id as string;
  const lesson_id = params.lesson_id as string;
  const page = params.page as string;

  const [lesson, setLesson] = useState(null);
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

  return (
    <>
      {isMobile ? (
        <div className="flex flex-col textbook">
          <h1>
            第{lesson_id}回 _ {lesson?.week_name}
          </h1>
          <MathJax text={content} />
        </div>
      ) : (
        <div className="container textbook">
          <h1>
            第{lesson_id}回 _ {lesson?.week_name}
          </h1>
          <MathJax text={content} />
          <div className="flex mt-4">
            {Number(page) !== 1 && (
              <Button className="default align-middle" onClick={go_previous_page}>
                前のページ
              </Button>
            )}
            {Number(page) < lesson?.page_num && (
              <Button className="align-middle justify-end" onClick={go_next_page}>
                次のページ
              </Button>
            )}
            {Number(page) === lesson?.page_num && (
              <Button className="default" onClick={go_lesson_page}>
                コンテンツ一覧に戻る
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default LessonPage;
