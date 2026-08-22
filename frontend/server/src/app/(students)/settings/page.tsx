"use client";

//// 表示データ変更

import { Edit, EyeOff, Mail, User, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TcAccessTime from "@/components/tc_access_time";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import axios from "@/lib/axios";

type UserProfile = {
	username?: string | null;
	display_name?: string | null;
	email?: string | null;
	role?: {
		name?: string | null;
	};
};

function StudentSettingsPage() {
	const router = useRouter();
	const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchUserProfile = async () => {
			try {
				const res = await axios.get("/users/me");
				setUserProfile(res.data);
			} catch (error) {
				console.error("ユーザー情報の取得に失敗しました:", error);
			} finally {
				setLoading(false);
			}
		};

		fetchUserProfile();
	}, []);

	const roleName = userProfile?.role?.name ?? "student";
	const roleLabel =
		roleName === "student"
			? "Student"
			: roleName === "teacher"
				? "Teacher"
				: roleName === "admin"
					? "Admin"
					: roleName;

	return (
		<>
			<TcAccessTime page="student_settings" />
			<main className="min-h-screen bg-slate-100">
				<div className="container mx-auto max-w-4xl px-4 pb-8 pt-4 sm:pt-6">
					<Card>
					<CardHeader>
						<CardTitle className="text-2xl">ユーザー設定</CardTitle>
						<CardDescription>
							学生アカウント情報の確認と変更ができます
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-6">
							{/* ユーザー基本情報 */}
							<div className="space-y-4">
								<h3 className="text-lg font-semibold border-b pb-2">
									基本情報
								</h3>

								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
										<User className="h-5 w-5 text-gray-500" />
										<div>
											<h4 className="font-semibold text-sm text-gray-600">
												ユーザー名
											</h4>
											<p className="text-lg">
												{loading
													? "読み込み中..."
													: (userProfile?.username ?? "-")}
											</p>
										</div>
									</div>

									<div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
										<Mail className="h-5 w-5 text-gray-500" />
										<div>
											<h4 className="font-semibold text-sm text-gray-600">
												メールアドレス
											</h4>
											<p className="text-lg">
												{loading
													? "読み込み中..."
													: (userProfile?.email ?? "-")}
											</p>
										</div>
									</div>

									<div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
										<UserCheck className="h-5 w-5 text-gray-500" />
										<div>
											<h4 className="font-semibold text-sm text-gray-600">
												ユーザー種別
											</h4>
											<p className="text-lg">{roleLabel}</p>
										</div>
									</div>

									<div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
										<User className="h-5 w-5 text-gray-500" />
										<div>
											<h4 className="font-semibold text-sm text-gray-600">
												ニックネーム
											</h4>
											<p className="text-lg">
												{loading
													? "読み込み中..."
													: (userProfile?.display_name ??
														userProfile?.username ??
														"-")}
											</p>
										</div>
										<Button variant="ghost" size="sm" className="ml-auto">
											<Edit className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</div>

							{/* セキュリティ設定 */}
							<div className="space-y-4">
								<h3 className="text-lg font-semibold border-b pb-2">
									セキュリティ設定
								</h3>

								<div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
									<div className="flex items-center space-x-3">
										<EyeOff className="h-5 w-5 text-gray-500" />
										<div>
											<h4 className="font-semibold text-sm text-gray-600">
												パスワード
											</h4>
											<p className="text-lg">●●●●●●●●</p>
										</div>
									</div>
									<Button
										variant="outline"
									onClick={() => router.push("/settings/password")}
									>
										<Edit className="h-4 w-4 mr-2" />
										パスワード変更
									</Button>
								</div>
							</div>

							{/* アカウント情報 */}
							<div className="space-y-4">
								<h3 className="text-lg font-semibold border-b pb-2">
									アカウント情報
								</h3>

								<div className="p-4 bg-green-50 rounded-lg">
									<div className="flex items-start space-x-3">
										<div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
										<div>
											<h4 className="font-semibold text-green-800">学生権限</h4>
											<p className="text-sm text-green-700 mt-1">
												このアカウントは学生権限を持っています。コースの受講、課題提出、成績の確認など、学生向けの機能を利用できます。
											</p>
										</div>
									</div>
								</div>
							</div>
						</div>
					</CardContent>
					</Card>
				</div>
			</main>
		</>
	);
}

export default StudentSettingsPage;
