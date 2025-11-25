"use client";

import { Button } from "@/components/ui/button";

const AdminHome = () => {
	return (
		<>
			<main>
				<div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
					<div className="container mx-auto px-4 py-8">
						<h2>管理者ホーム</h2>
						<Button>ログアウト</Button>
					</div>
				</div>
			</main>
			<div>管理者ホーム</div>
		</>
	);
};

export default AdminHome;
