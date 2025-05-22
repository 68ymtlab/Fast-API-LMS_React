"use client";

import { DefaultHeader } from "@/components/atoms/layout/DefaultHeader";
import { memo, useState } from "react";
import type { FC } from "react";

export const Root: FC = memo(() => {
  const [email, setEmail] = useState("");
  return (
    <>
      <DefaultHeader />
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-center">学習支援システム</h1>
          <p className="mt-4 text-lg text-center">
            ようこそ、学習支援システムへ！
            <br />
            ここでは、あなたの学びをサポートします。
          </p>
        </div>
      </main>
    </>
  );
});

export default Root;
