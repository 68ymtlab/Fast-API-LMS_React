"use client";

import { Download, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import axios from "@/lib/axios";

type ExerciseSessionLog = {
	session_id: number;
	user_id: number;
	username: string | null;
	display_name: string | null;
	email: string;
	grade: number | null;
	department: string | null;
	course_id: number;
	course_name: string;
	exercise_set_id: number;
	exercise_set_title: string;
	score: number | null;
	started_at: string;
	completed_at: string | null;
};

const AdminFlowLogPage = () => {
	const [logs, setLogs] = useState<ExerciseSessionLog[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [courseIdFilter, setCourseIdFilter] = useState("");
	const [userIdFilter, setUserIdFilter] = useState("");

	const fetchLogs = async () => {
		setLoading(true);
		setError(null);
		try {
			const params: Record<string, string | number> = { limit: 300 };
			if (courseIdFilter.trim()) {
				params.course_id = Number.parseInt(courseIdFilter, 10);
			}
			if (userIdFilter.trim()) {
				params.user_id = Number.parseInt(userIdFilter, 10);
			}
			const response = await axios.get<ExerciseSessionLog[]>("/admin/exercise-sessions", {
				params,
				withCredentials: true,
			});
			setLogs(response.data);
		} catch (_error) {
			setError("演習ログの取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const exportCsv = () => {
		if (logs.length === 0) {
			return;
		}

		const headers = [
			"session_id",
			"started_at",
			"completed_at",
			"user_id",
			"username",
			"display_name",
			"email",
			"grade",
			"department",
			"course_id",
			"course_name",
			"exercise_set_id",
			"exercise_set_title",
			"score",
		];

		const escapeCsv = (value: unknown) => {
			if (value === null || value === undefined) {
				return "";
			}
			const str = String(value);
			if (str.includes(",") || str.includes("\n") || str.includes('"')) {
				return `"${str.replace(/"/g, '""')}"`;
			}
			return str;
		};

		const rows = logs.map((log) => [
			log.session_id,
			log.started_at,
			log.completed_at,
			log.user_id,
			log.username,
			log.display_name,
			log.email,
			log.grade,
			log.department,
			log.course_id,
			log.course_name,
			log.exercise_set_id,
			log.exercise_set_title,
			log.score,
		]);

		const csv = [headers, ...rows]
			.map((row) => row.map((cell) => escapeCsv(cell)).join(","))
			.join("\n");

		const bom = "\uFEFF";
		const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `flow-log-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	};

	useEffect(() => {
		fetchLogs();
	}, []);

	return (
		<div className="p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-bold">演習問題ログ</h1>
				<p className="text-sm text-muted-foreground">演習セッションの実行履歴を表示します。</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>検索条件</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 md:flex-row">
					<Input
						placeholder="コースID"
						type="number"
						value={courseIdFilter}
						onChange={(e) => setCourseIdFilter(e.target.value)}
					/>
					<Input
						placeholder="ユーザーID"
						type="number"
						value={userIdFilter}
						onChange={(e) => setUserIdFilter(e.target.value)}
					/>
					<Button onClick={fetchLogs}>
						<Search className="h-4 w-4" />
						検索
					</Button>
					<Button variant="outline" onClick={exportCsv} disabled={logs.length === 0}>
						<Download className="h-4 w-4" />
						CSV出力
					</Button>
				</CardContent>
			</Card>

			{error ? <p className="text-sm text-red-500">{error}</p> : null}

			<Card>
				<CardHeader>
					<CardTitle>ログ一覧</CardTitle>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" /> 読み込み中...
						</div>
					) : logs.length === 0 ? (
						<p className="text-sm text-muted-foreground">データがありません</p>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left border-b">
										<th className="p-2">開始日時</th>
										<th className="p-2">ユーザー</th>
										<th className="p-2">コース</th>
										<th className="p-2">演習セット</th>
										<th className="p-2">スコア</th>
										<th className="p-2">完了日時</th>
									</tr>
								</thead>
								<tbody>
									{logs.map((log) => (
										<tr key={log.session_id} className="border-b align-top">
											<td className="p-2 whitespace-nowrap">
												{new Date(log.started_at).toLocaleString("ja-JP")}
											</td>
											<td className="p-2">
												<div>{log.display_name || log.username || "-"}</div>
												<div className="text-xs text-muted-foreground">{log.email}</div>
											</td>
											<td className="p-2">{log.course_name} (#{log.course_id})</td>
											<td className="p-2">{log.exercise_set_title}</td>
											<td className="p-2">{log.score ?? "-"}</td>
											<td className="p-2 whitespace-nowrap">
												{log.completed_at
													? new Date(log.completed_at).toLocaleString("ja-JP")
													: "未完了"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};

export default AdminFlowLogPage;
