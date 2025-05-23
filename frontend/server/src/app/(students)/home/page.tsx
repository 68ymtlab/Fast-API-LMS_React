"use client";

import { StudentHeader } from "@/components/atoms/layout/StudentHeader";
import { Button } from "@/components/ui/button";
import withAuth from "@/hocs/withAuth";
import { useAuth } from "@/hooks/useAuth";

export const StudentHome = () => {
	const { logout } = useAuth();
	return (
		<>
			<div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
				<div className="container mx-auto px-4 py-8">
					<h2>学生ホーム</h2>
					<Button onClick={logout}>ログアウト</Button>
				</div>
			</div>
			<Button onClick={logout}>ログアウト</Button>
		</>
	);
};

export default withAuth(StudentHome);
