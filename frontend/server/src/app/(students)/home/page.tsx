"use client";
import { Button } from "@/components/ui/button";
import withAuth from "@/hocs/withAuth";
import { useAuth } from "@/hooks/useAuth";

export const StudentHome = () => {
  const { logout } = useAuth();
  return (
    <>
      <div className="w-full flex flex-col justify-center min-h-screen bg-gray-100 px-4 py-8">
        <h2>学生ホーム</h2>
        <Button onClick={logout}>ログアウト</Button>
      </div>
    </>
  );
};

export default withAuth(StudentHome);
