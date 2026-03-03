"use client";

import { Download, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import axios from "@/lib/axios";

type AccessHistory = {
	id: number;
	user_id: number;
	username: string | null;
	display_name: string | null;
	email: string;
	role_id: number;
	access_date: string;
	page: string;
	time: number;
	details: string | null;
	created_at: string;
};

const AdminLoginHistoryPage = () => {
	const [logs, setLogs] = useState<AccessHistory[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pageFilter, setPageFilter] = useState("");
	const [userIdFilter, setUserIdFilter] = useState("");

	const fetchLogs = async () => {
		setLoading(true);
		setError(null);
		try {
			const params: Record<string, string | number> = { limit: 300 };
			if (pageFilter.trim()) {
				params.page = pageFilter.trim();
			}
			if (userIdFilter.trim()) {
				params.user_id = Number.parseInt(userIdFilter, 10);
			}

			const response = await axios.get<AccessHistory[]>("/admin/access-histories", {
				params,
				withCredentials: true,
			});
			setLogs(response.data);
		} catch (_error) {
			setError("ログイン履歴の取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const exportCsv = () => {
		if (logs.length === 0) {
			return;
		}

		const headers = [
			"id",
			"created_at",
			"user_id",
			"username",
			"display_name",
			"email",
			"role_id",
			"page",
			"time_seconds",
			"details",
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
			log.id,
			log.created_at,
			log.user_id,
			log.username,
			log.display_name,
			log.email,
			log.role_id,
			log.page,
			log.time,
			log.details,
		]);

		const csv = [headers, ...rows]
			.map((row) => row.map((cell) => escapeCsv(cell)).join(","))
			.join("\n");

		const bom = "\uFEFF";
		const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `login-history-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	};

	useEffect(() => {
		fetchLogs();
	}, []);

	return (
		<div className="min-h-[calc(100vh-3.5rem)] bg-gray-100 p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-bold">ログイン履歴</h1>
				<p className="text-sm text-muted-foreground">アクセス履歴ログを検索・確認できます。</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>検索条件</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 md:flex-row">
					<Input
						placeholder="ページ名で絞り込み"
						value={pageFilter}
						onChange={(e) => setPageFilter(e.target.value)}
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
					<CardTitle>履歴一覧</CardTitle>
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
										<th className="p-2">日時</th>
										<th className="p-2">ユーザー</th>
										<th className="p-2">ページ</th>
										<th className="p-2">滞在(秒)</th>
										<th className="p-2">詳細</th>
									</tr>
								</thead>
								<tbody>
									{logs.map((log) => (
										<tr key={log.id} className="border-b align-top">
											<td className="p-2 whitespace-nowrap">
												{new Date(log.created_at).toLocaleString("ja-JP")}
											</td>
											<td className="p-2">
												<div>{log.display_name || log.username || "-"}</div>
												<div className="text-xs text-muted-foreground">{log.email}</div>
											</td>
											<td className="p-2">{log.page}</td>
											<td className="p-2">{log.time}</td>
											<td className="p-2">{log.details ?? "-"}</td>
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

export default AdminLoginHistoryPage;
