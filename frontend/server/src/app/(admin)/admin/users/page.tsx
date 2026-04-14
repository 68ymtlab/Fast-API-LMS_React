"use client";

import {
	AlertCircle,
	KeyRound,
	Loader2,
	Pencil,
	RefreshCw,
	Trash2,
	Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import axios from "@/lib/axios";

type AdminUser = {
	id: number;
	username: string | null;
	display_name: string | null;
	email: string;
	role_id: number;
	is_disabled: boolean;
	role?: {
		id: number;
		name: string;
		description?: string | null;
	};
};

const roleLabel = (user: AdminUser) => {
	if (user.role?.name) return user.role.name;
	switch (user.role_id) {
		case 1:
			return "admin";
		case 2:
			return "teacher";
		case 3:
			return "student";
		case 4:
			return "demo";
		default:
			return `role:${user.role_id}`;
	}
};

type RoleFilter = "all" | "1" | "2" | "3" | "4";
type StatusFilter = "all" | "active" | "disabled";

export default function AdminUsersPage() {
	const [mounted, setMounted] = useState(false);
	const [loading, setLoading] = useState(false);
	const [users, setUsers] = useState<AdminUser[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

	const [targetEmail, setTargetEmail] = useState<string | null>(null);
	const [newPassword, setNewPassword] = useState("");
	const [adminPassword, setAdminPassword] = useState("");
	const [resetLoading, setResetLoading] = useState(false);
	const [resetError, setResetError] = useState<string | null>(null);
	const [resetSuccess, setResetSuccess] = useState<string | null>(null);

	const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
	const [editLoading, setEditLoading] = useState(false);
	const [editError, setEditError] = useState<string | null>(null);
	const [editSuccess, setEditSuccess] = useState<string | null>(null);
	const [editUsername, setEditUsername] = useState("");
	const [editDisplayName, setEditDisplayName] = useState("");
	const [editEmail, setEditEmail] = useState("");
	const [editRoleId, setEditRoleId] = useState("3");
	const [editStatus, setEditStatus] = useState<"active" | "disabled">("active");
	const [editAdminPassword, setEditAdminPassword] = useState("");

	const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
	const [deleteAdminPassword, setDeleteAdminPassword] = useState("");
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

	useEffect(() => {
		setMounted(true);
	}, []);

	const fetchUsers = async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await axios.get<AdminUser[]>("/admin/users", {
				withCredentials: true,
			});
			setUsers(res.data ?? []);
		} catch (_e) {
			setError("ユーザー一覧の取得に失敗しました。");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (!mounted) return;
		void fetchUsers();
	}, [mounted]);

	const filteredUsers = useMemo(() => {
		const q = query.trim().toLowerCase();
		return users.filter((u) => {
			const matchQuery = q
				? `${u.email} ${u.username ?? ""} ${u.display_name ?? ""}`
						.toLowerCase()
						.includes(q)
				: true;
			const matchRole = roleFilter === "all" ? true : String(u.role_id) === roleFilter;
			const matchStatus =
				statusFilter === "all"
					? true
					: statusFilter === "active"
						? !u.is_disabled
						: u.is_disabled;
			return matchQuery && matchRole && matchStatus;
		});
	}, [users, query, roleFilter, statusFilter]);

	const matchesActiveFilters = (u: AdminUser) => {
		const q = query.trim().toLowerCase();
		const matchQuery = q
			? `${u.email} ${u.username ?? ""} ${u.display_name ?? ""}`
					.toLowerCase()
					.includes(q)
			: true;
		const matchRole = roleFilter === "all" ? true : String(u.role_id) === roleFilter;
		const matchStatus =
			statusFilter === "all"
				? true
				: statusFilter === "active"
					? !u.is_disabled
					: u.is_disabled;
		return matchQuery && matchRole && matchStatus;
	};

	const openResetDialog = (email: string) => {
		setTargetEmail(email);
		setNewPassword("");
		setAdminPassword("");
		setResetError(null);
		setResetSuccess(null);
	};

	const closeResetDialog = () => {
		setTargetEmail(null);
		setNewPassword("");
		setAdminPassword("");
		setResetError(null);
	};

	const submitReset = async () => {
		if (!targetEmail) return;
		if (newPassword.length < 4) {
			setResetError("新しいパスワードは4文字以上で入力してください。");
			return;
		}
		if (adminPassword.length < 4) {
			setResetError("管理者パスワードを入力してください。");
			return;
		}

		setResetLoading(true);
		setResetError(null);
		try {
			await axios.post(
				"/admin/users/password-reset",
				{
					email: targetEmail,
					new_password: newPassword,
					admin_password: adminPassword,
				},
				{ withCredentials: true },
			);
			setResetSuccess("パスワードを更新しました。");
			setTimeout(() => {
				closeResetDialog();
			}, 900);
		} catch (e: any) {
			const detail = e?.response?.data?.detail;
			setResetError(
				typeof detail === "string"
					? detail
					: "パスワード更新に失敗しました。",
			);
		} finally {
			setResetLoading(false);
		}
	};

	const openEditDialog = (user: AdminUser) => {
		setEditingUser(user);
		setEditUsername(user.username ?? "");
		setEditDisplayName(user.display_name ?? "");
		setEditEmail(user.email);
		setEditRoleId(String(user.role_id));
		setEditStatus(user.is_disabled ? "disabled" : "active");
		setEditAdminPassword("");
		setEditError(null);
		setEditSuccess(null);
	};

	const closeEditDialog = () => {
		setEditingUser(null);
		setEditError(null);
		setEditSuccess(null);
		setEditAdminPassword("");
	};

	const submitEdit = async () => {
		if (!editingUser) return;
		if (!editEmail.trim()) {
			setEditError("メールアドレスを入力してください。");
			return;
		}
		if (editAdminPassword.length < 4) {
			setEditError("管理者パスワードを入力してください。");
			return;
		}

		setEditLoading(true);
		setEditError(null);
		try {
			const payload = {
				admin_password: editAdminPassword,
				username: editUsername.trim() || null,
				display_name: editDisplayName.trim() || null,
				email: editEmail.trim(),
				role_id: Number(editRoleId),
				is_disabled: editStatus === "disabled",
			};
			const res = await axios.put<AdminUser>(
				`/admin/users/${editingUser.id}`,
				payload,
				{ withCredentials: true },
			);
			const updated = res.data;
			setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
			if (!matchesActiveFilters(updated)) {
				setQuery("");
				setRoleFilter("all");
				setStatusFilter("all");
				setEditSuccess("ユーザー情報を更新しました（表示のためフィルタをリセットしました）。");
			} else {
				setEditSuccess("ユーザー情報を更新しました。");
			}
			setTimeout(() => {
				closeEditDialog();
			}, 900);
		} catch (e: any) {
			const detail = e?.response?.data?.detail;
			setEditError(
				typeof detail === "string"
					? detail
					: "ユーザー情報の更新に失敗しました。",
			);
		} finally {
			setEditLoading(false);
		}
	};

	const openDeleteDialog = (user: AdminUser) => {
		setDeletingUser(user);
		setDeleteAdminPassword("");
		setDeleteError(null);
		setDeleteSuccess(null);
	};

	const closeDeleteDialog = () => {
		setDeletingUser(null);
		setDeleteAdminPassword("");
		setDeleteError(null);
	};

	const submitDelete = async () => {
		if (!deletingUser) return;
		if (deleteAdminPassword.length < 4) {
			setDeleteError("管理者パスワードを入力してください。");
			return;
		}

		setDeleteLoading(true);
		setDeleteError(null);
		try {
			await axios.delete(`/admin/users/${deletingUser.id}`, {
				withCredentials: true,
				data: {
					admin_password: deleteAdminPassword,
				},
			});
			setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
			setDeleteSuccess("ユーザーを削除しました。");
			setTimeout(() => {
				closeDeleteDialog();
			}, 900);
		} catch (e: any) {
			const detail = e?.response?.data?.detail;
			setDeleteError(
				typeof detail === "string" ? detail : "ユーザー削除に失敗しました。",
			);
		} finally {
			setDeleteLoading(false);
		}
	};

	if (!mounted) {
		return null;
	}

	return (
		<div className="min-h-[calc(100vh-3.5rem)] bg-gray-100 p-6 space-y-6">
			<Card>
				<CardHeader className="space-y-2">
					<CardTitle className="flex items-center gap-2">
						<Users className="h-5 w-5" />
						ユーザー管理
					</CardTitle>
					<CardDescription>
						ユーザー一覧、フィルタ、情報編集、パスワード再設定を実行できます。機密操作には管理者パスワード確認が必要です。
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap items-center gap-2">
						<Input
							placeholder="メール / ユーザー名 / 表示名で検索"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="w-full max-w-md bg-white"
						/>
						<Select
							value={roleFilter}
							onValueChange={(v) => setRoleFilter(v as RoleFilter)}
						>
							<SelectTrigger className="w-[150px] bg-white">
								<SelectValue placeholder="ロール" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">ロール: すべて</SelectItem>
								<SelectItem value="1">admin</SelectItem>
								<SelectItem value="2">teacher</SelectItem>
								<SelectItem value="3">student</SelectItem>
								<SelectItem value="4">demo</SelectItem>
							</SelectContent>
						</Select>
						<Select
							value={statusFilter}
							onValueChange={(v) => setStatusFilter(v as StatusFilter)}
						>
							<SelectTrigger className="w-[150px] bg-white">
								<SelectValue placeholder="状態" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">状態: すべて</SelectItem>
								<SelectItem value="active">有効</SelectItem>
								<SelectItem value="disabled">無効</SelectItem>
							</SelectContent>
						</Select>
						<Button variant="outline" onClick={fetchUsers} disabled={loading}>
							{loading ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<RefreshCw className="h-4 w-4" />
							)}
							再読込
						</Button>
					</div>

					<p className="text-xs text-muted-foreground">
						表示件数: {filteredUsers.length} / 全 {users.length}
					</p>

					{error ? (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					) : null}

					<div className="overflow-x-auto rounded-md border bg-white">
						<table className="w-full min-w-[980px] text-sm">
							<thead className="bg-gray-50">
								<tr>
									<th className="px-3 py-2 text-left">ID</th>
									<th className="px-3 py-2 text-left">表示名</th>
									<th className="px-3 py-2 text-left">ユーザー名</th>
									<th className="px-3 py-2 text-left">メール</th>
									<th className="px-3 py-2 text-left">ロール</th>
									<th className="px-3 py-2 text-left">状態</th>
									<th className="px-3 py-2 text-right">操作</th>
								</tr>
							</thead>
							<tbody>
								{filteredUsers.map((u) => (
									<tr key={u.id} className="border-t">
										<td className="px-3 py-2">{u.id}</td>
										<td className="px-3 py-2">{u.display_name || "-"}</td>
										<td className="px-3 py-2">{u.username || "-"}</td>
										<td className="px-3 py-2">{u.email}</td>
										<td className="px-3 py-2">{roleLabel(u)}</td>
										<td className="px-3 py-2">
											{u.is_disabled ? "無効" : "有効"}
										</td>
										<td className="px-3 py-2 text-right">
											<div className="inline-flex gap-2">
												<Button
													size="sm"
													variant="outline"
													onClick={() => openEditDialog(u)}
												>
													<Pencil className="h-4 w-4" />
													情報編集
												</Button>
												<Button
													size="sm"
													variant="outline"
													onClick={() => openResetDialog(u.email)}
												>
													<KeyRound className="h-4 w-4" />
													パスワード再設定
												</Button>
												<Button
													size="sm"
													variant="outline"
													onClick={() => openDeleteDialog(u)}
												>
													<Trash2 className="h-4 w-4" />
													削除
												</Button>
											</div>
										</td>
									</tr>
								))}
								{!loading && filteredUsers.length === 0 ? (
									<tr>
										<td
											className="px-3 py-6 text-center text-muted-foreground"
											colSpan={7}
										>
											対象ユーザーが見つかりません。
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>

			<Dialog open={!!targetEmail} onOpenChange={(open) => !open && closeResetDialog()}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>パスワード再設定</DialogTitle>
						<DialogDescription>
							対象: {targetEmail}
							<br />
							この操作には、管理者パスワードの再入力が必要です。
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<Input
							type="password"
							placeholder="新しいパスワード"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							autoComplete="new-password"
							disabled={resetLoading}
						/>
						<Input
							type="password"
							placeholder="管理者パスワード（確認）"
							value={adminPassword}
							onChange={(e) => setAdminPassword(e.target.value)}
							autoComplete="current-password"
							disabled={resetLoading}
						/>
						{resetError ? (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{resetError}</AlertDescription>
							</Alert>
						) : null}
						{resetSuccess ? (
							<Alert>
								<AlertDescription>{resetSuccess}</AlertDescription>
							</Alert>
						) : null}
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={closeResetDialog}
								disabled={resetLoading}
							>
								キャンセル
							</Button>
							<Button onClick={submitReset} disabled={resetLoading}>
								{resetLoading ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" />
										実行中...
									</>
								) : (
									"更新"
								)}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={!!editingUser} onOpenChange={(open) => !open && closeEditDialog()}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>ユーザー情報編集</DialogTitle>
						<DialogDescription>
							対象: {editingUser?.email}
							<br />
							この操作には、管理者パスワードの再入力が必要です。
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<Input
							placeholder="表示名"
							value={editDisplayName}
							onChange={(e) => setEditDisplayName(e.target.value)}
							disabled={editLoading}
						/>
						<Input
							placeholder="ユーザー名"
							value={editUsername}
							onChange={(e) => setEditUsername(e.target.value)}
							disabled={editLoading}
						/>
						<Input
							type="email"
							placeholder="メールアドレス"
							value={editEmail}
							onChange={(e) => setEditEmail(e.target.value)}
							disabled={editLoading}
						/>
						<div className="grid grid-cols-2 gap-2">
							<Select value={editRoleId} onValueChange={setEditRoleId}>
								<SelectTrigger className="bg-white">
									<SelectValue placeholder="ロール" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="1">admin</SelectItem>
									<SelectItem value="2">teacher</SelectItem>
									<SelectItem value="3">student</SelectItem>
									<SelectItem value="4">demo</SelectItem>
								</SelectContent>
							</Select>
							<Select
								value={editStatus}
								onValueChange={(v) => setEditStatus(v as "active" | "disabled")}
							>
								<SelectTrigger className="bg-white">
									<SelectValue placeholder="状態" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="active">有効</SelectItem>
									<SelectItem value="disabled">無効</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<Input
							type="password"
							placeholder="管理者パスワード（確認）"
							value={editAdminPassword}
							onChange={(e) => setEditAdminPassword(e.target.value)}
							autoComplete="current-password"
							disabled={editLoading}
						/>
						{editError ? (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{editError}</AlertDescription>
							</Alert>
						) : null}
						{editSuccess ? (
							<Alert>
								<AlertDescription>{editSuccess}</AlertDescription>
							</Alert>
						) : null}
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={closeEditDialog}
								disabled={editLoading}
							>
								キャンセル
							</Button>
							<Button onClick={submitEdit} disabled={editLoading}>
								{editLoading ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" />
										保存中...
									</>
								) : (
									"保存"
								)}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!deletingUser}
				onOpenChange={(open) => !open && closeDeleteDialog()}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>ユーザー削除</DialogTitle>
						<DialogDescription>
							対象: {deletingUser?.email}
							<br />
							この操作には、管理者パスワードの再入力が必要です。
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<Input
							type="password"
							placeholder="管理者パスワード（確認）"
							value={deleteAdminPassword}
							onChange={(e) => setDeleteAdminPassword(e.target.value)}
							autoComplete="current-password"
							disabled={deleteLoading}
						/>
						{deleteError ? (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{deleteError}</AlertDescription>
							</Alert>
						) : null}
						{deleteSuccess ? (
							<Alert>
								<AlertDescription>{deleteSuccess}</AlertDescription>
							</Alert>
						) : null}
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={closeDeleteDialog}
								disabled={deleteLoading}
							>
								キャンセル
							</Button>
							<Button onClick={submitDelete} disabled={deleteLoading}>
								{deleteLoading ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" />
										削除中...
									</>
								) : (
									"削除する"
								)}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
