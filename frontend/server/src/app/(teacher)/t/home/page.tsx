"use client";

import { TeacherHeader } from "@/components/atoms/layout/TeacherHeader";
import { Button } from "@/components/ui/button";
import withAuth from "@/hocs/withAuth";
import { useAuth } from "@/hooks/useAuth";

export const TeacherHome = () => {
  const { logout } = useAuth();
  return (
    <>
      <TeacherHeader />
      <main>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
          <div className="container mx-auto px-4 py-8">
            <h2>教師ホーム</h2>
            <Button onClick={logout}>ログアウト</Button>
          </div>
        </div>
      </main>
      <Button onClick={logout}>ログアウト</Button>
    </>
  );
};

export default withAuth(TeacherHome);
