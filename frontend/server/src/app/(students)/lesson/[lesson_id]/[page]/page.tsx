"use client";

import { MathJax } from "@/components/shared/MathJax";
import axios from "@/lib/axios";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMediaQuery } from "react-responsive";

export const LessonPage = () => {
  const isMobile = useMediaQuery({ query: "(max-width: 768px)" });
  const router = useRouter();
  const params = useParams();
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

  return (
    <>
      {isMobile ? (
        <div className="flex flex-col">
          <h1>
            Lesson {lesson_id} {page}
          </h1>
          <MathJax text={content} />
        </div>
      ) : (
        <div className="container">
          <h1>
            Lesson {lesson_id} {page}
          </h1>
          <MathJax text={content} />
        </div>
      )}
    </>
  );
};

export default LessonPage;
