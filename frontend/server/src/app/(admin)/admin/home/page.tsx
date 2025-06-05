"use client";
import { Button } from "@/components/ui/button";
import withAuth from "@/hocs/withAuth";
import { useAuth } from "@/hooks/useAuth";

export const AdminHome = () => {
  const { logout } = useAuth();
  return (
    <>
      <main>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
          <div className="container mx-auto px-4 py-8">
            <h2>管理者ホーム</h2>
            <Button onClick={logout}>ログアウト</Button>
          </div>
        </div>
      </main>
      <div>管理者ホーム</div>
    </>
  );
};

export default withAuth(AdminHome);
