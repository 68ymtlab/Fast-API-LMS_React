"use client";

import {
	AlertTriangle,
	ArrowRight,
	BarChart3,
	BookOpen,
	Clock3,
	Loader2,
	LogIn,
	ShieldCheck,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import axios from "@/lib/axios";

type AccessHistory = {
	id: number;
	user_id: number;
	display_name: string | null;
	username: string | null;
	email: string;
	page: string;
	time: number;
	details: string | null;
	created_at: string;
};

type ExerciseSession = {
	session_id: number;
	user_id: number;
	display_name: string | null;
	username: string | null;
	course_name: string;
	score: number | null;
	started_at: string;
	completed_at: string | null;
};

type Subject = {
	id: number;
	is_active: boolean;
};

const DASHBOARD_THRESHOLDS = {
	alertUnfinishedSessions: 30,
} as const;

const formatDateTime = (iso: string) => {
	const date = new Date(iso);
	const y = date.getFullYear();
	const m = `${date.getMonth() + 1}`.padStart(2, "0");
	const d = `${date.getDate()}`.padStart(2, "0");
	const hh = `${date.getHours()}`.padStart(2, "0");
	const mm = `${date.getMinutes()}`.padStart(2, "0");
	return `${y}/${m}/${d} ${hh}:${mm}`;
};

const getDateKey = (date: Date) => {
	const y = date.getFullYear();
	const m = `${date.getMonth() + 1}`.padStart(2, "0");
	const d = `${date.getDate()}`.padStart(2, "0");
	return `${y}-${m}-${d}`;
};

const AdminHome = () => {
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [accessLogs, setAccessLogs] = useState<AccessHistory[]>([]);
	const [exerciseSessions, setExerciseSessions] = useState<ExerciseSession[]>([]);
	const [subjects, setSubjects] = useState<Subject[]>([]);

	const handleLogout = async () => {
		await signOut({ callbackUrl: "/login" });
	};

	const fetchDashboardData = async () => {
		setLoading(true);
		setError(null);
		try {
			const [accessRes, exerciseRes, subjectsRes] = await Promise.all([
				axios.get<AccessHistory[]>("/admin/access-histories", {
					params: { limit: 300 },
					withCredentials: true,
				}),
				axios.get<ExerciseSession[]>("/admin/exercise-sessions", {
					params: { limit: 300 },
					withCredentials: true,
				}),
				axios.get<Subject[]>("/subjects", { withCredentials: true }),
			]);
			setAccessLogs(accessRes.data ?? []);
			setExerciseSessions(exerciseRes.data ?? []);
			setSubjects(subjectsRes.data ?? []);
		} catch (_e) {
			setError("管理者ホームのデータ取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchDashboardData();
	}, []);

	const todayKey = useMemo(() => getDateKey(new Date()), []);

	const todayLogins = useMemo(
		() =>
			accessLogs.filter((log) => getDateKey(new Date(log.created_at)) === todayKey)
				.length,
		[accessLogs, todayKey],
	);

	const todayActiveUsers = useMemo(
		() =>
			new Set(
				accessLogs
					.filter((log) => getDateKey(new Date(log.created_at)) === todayKey)
					.map((log) => log.user_id),
			).size,
		[accessLogs, todayKey],
	);

	const todayExerciseAttempts = useMemo(
		() =>
			exerciseSessions.filter(
				(session) => getDateKey(new Date(session.started_at)) === todayKey,
			).length,
		[exerciseSessions, todayKey],
	);

	const unfinishedSessions = useMemo(
		() => exerciseSessions.filter((session) => !session.completed_at).length,
		[exerciseSessions],
	);

	const activeSubjectCount = useMemo(
		() => subjects.filter((subject) => subject.is_active).length,
		[subjects],
	);

	const adminRecentOperations = useMemo(
		() =>
			accessLogs
				.filter((log) => log.page?.startsWith("admin_"))
				.sort(
					(a, b) =>
						new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
				)
				.slice(0, 20),
		[accessLogs],
	);

	const alerts = useMemo(() => {
		const items: string[] = [];
		if (todayLogins === 0) {
			items.push("本日のアクセス履歴がまだ記録されていません。");
		}
		if (unfinishedSessions > DASHBOARD_THRESHOLDS.alertUnfinishedSessions) {
			items.push(
				`未完了の演習セッションが${DASHBOARD_THRESHOLDS.alertUnfinishedSessions}件を超えています。`,
			);
		} else if (unfinishedSessions > 0) {
			items.push(`未完了の演習セッションが${unfinishedSessions}件あります。`);
		}
		if (activeSubjectCount === 0) {
			items.push("有効な科目が0件です。公開設定を確認してください。");
		}
		return items;
	}, [todayLogins, unfinishedSessions, activeSubjectCount]);

	const sevenDayTrend = useMemo(() => {
		const dayKeys: string[] = [];
		const today = new Date();
		for (let i = 6; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(today.getDate() - i);
			dayKeys.push(getDateKey(d));
		}

		return dayKeys.map((key) => {
			const loginCount = accessLogs.filter(
				(log) => getDateKey(new Date(log.created_at)) === key,
			).length;
			const exerciseCount = exerciseSessions.filter(
				(session) => getDateKey(new Date(session.started_at)) === key,
			).length;
			return {
				key,
				label: key.slice(5).replace("-", "/"),
				loginCount,
				exerciseCount,
			};
		});
	}, [accessLogs, exerciseSessions]);

	const trendMax = useMemo(() => {
		const maxValue = sevenDayTrend.reduce(
			(acc, item) => Math.max(acc, item.loginCount, item.exerciseCount),
			0,
		);
		return maxValue > 0 ? maxValue : 1;
	}, [sevenDayTrend]);

	return (
		<div className="min-h-[calc(100vh-3.5rem)] bg-gray-100 p-6 space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">管理者ホーム</h1>
					<p className="text-sm text-muted-foreground">
						今日の運用状況と要対応項目を確認できます。
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={fetchDashboardData} disabled={loading}>
						{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "再読込"}
					</Button>
					<Button onClick={handleLogout}>ログアウト</Button>
				</div>
			</div>

			{error ? <p className="text-sm text-red-500">{error}</p> : null}

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							本日のログイン数
						</CardTitle>
					</CardHeader>
					<CardContent className="flex items-center justify-between">
						<p className="text-3xl font-bold">{todayLogins}</p>
						<LogIn className="h-5 w-5 text-muted-foreground" />
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							本日のアクティブユーザー
						</CardTitle>
					</CardHeader>
					<CardContent className="flex items-center justify-between">
						<p className="text-3xl font-bold">{todayActiveUsers}</p>
						<ShieldCheck className="h-5 w-5 text-muted-foreground" />
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							本日の演習解答数
						</CardTitle>
					</CardHeader>
					<CardContent className="flex items-center justify-between">
						<p className="text-3xl font-bold">{todayExerciseAttempts}</p>
						<BookOpen className="h-5 w-5 text-muted-foreground" />
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							未完了セッション
						</CardTitle>
					</CardHeader>
					<CardContent className="flex items-center justify-between">
						<p className="text-3xl font-bold">{unfinishedSessions}</p>
						<Clock3 className="h-5 w-5 text-muted-foreground" />
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 xl:grid-cols-3">
				<Card className="xl:col-span-1">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5" />
							要対応アラート
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						{alerts.length === 0 ? (
							<p className="text-muted-foreground">現在、要対応のアラートはありません。</p>
						) : (
							alerts.map((item) => (
								<div
									key={item}
									className="rounded-md border border-amber-200 bg-amber-50 p-2"
								>
									{item}
								</div>
							))
						)}
					</CardContent>
				</Card>

				<Card className="xl:col-span-2">
					<CardHeader>
						<CardTitle>最近の管理操作</CardTitle>
					</CardHeader>
					<CardContent>
						{loading ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								読み込み中...
							</div>
						) : adminRecentOperations.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								管理者操作ログがありません。
							</p>
						) : (
							<div className="space-y-2">
								{adminRecentOperations.map((log) => (
									<div
										key={log.id}
										className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"
									>
										<div className="min-w-0">
											<p className="truncate font-medium">{log.page}</p>
											<p className="truncate text-xs text-muted-foreground">
												{log.display_name || log.username || log.email}
											</p>
										</div>
										<p className="shrink-0 text-xs text-muted-foreground">
											{formatDateTime(log.created_at)}
										</p>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<BarChart3 className="h-5 w-5" />
						7日推移（ログイン / 演習解答）
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-7 gap-3">
						{sevenDayTrend.map((item) => (
							<div key={item.key} className="flex flex-col items-center gap-2">
								<div className="h-28 w-full flex items-end justify-center gap-1 rounded-md bg-gray-50 px-2">
									<div
										className="w-3 rounded-t bg-blue-500"
										style={{ height: `${(item.loginCount / trendMax) * 100}%` }}
										title={`ログイン: ${item.loginCount}`}
									/>
									<div
										className="w-3 rounded-t bg-emerald-500"
										style={{
											height: `${(item.exerciseCount / trendMax) * 100}%`,
										}}
										title={`演習解答: ${item.exerciseCount}`}
									/>
								</div>
								<div className="text-[11px] text-muted-foreground">{item.label}</div>
							</div>
						))}
					</div>
					<div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
						<div className="flex items-center gap-1">
							<span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
							ログイン
						</div>
						<div className="flex items-center gap-1">
							<span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
							演習解答
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>ショートカット</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
					<Button
						variant="outline"
						className="justify-between"
						onClick={() => router.push("/admin/courses")}
					>
						科目・コース管理
						<ArrowRight className="h-4 w-4" />
					</Button>
					<Button
						variant="outline"
						className="justify-between"
						onClick={() => router.push("/admin/login-history")}
					>
						ログイン履歴
						<ArrowRight className="h-4 w-4" />
					</Button>
					<Button
						variant="outline"
						className="justify-between"
						onClick={() => router.push("/admin/flow-log")}
					>
						演習問題ログ
						<ArrowRight className="h-4 w-4" />
					</Button>
					<Button
						variant="outline"
						className="justify-between"
						onClick={() => router.push("/t/users/add")}
					>
						ユーザー登録
						<ArrowRight className="h-4 w-4" />
					</Button>
				</CardContent>
			</Card>

			<p className="text-xs text-muted-foreground">
				アラート閾値: 未完了セッション &gt;{" "}
				{DASHBOARD_THRESHOLDS.alertUnfinishedSessions}
			</p>
		</div>
	);
};

export default AdminHome;
