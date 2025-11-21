"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApi } from "@/lib/api/useApi";

const InitialPasswordChange = ({ onSuccess }: { onSuccess: () => void }) => {
	const { put } = useApi();

	const [oldPassword, setOldPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [loading, setLoading] = useState(false);

	const handleUpdatePassword = async () => {
		setErrorMessage("");
		setSuccessMessage("");

		if (!oldPassword || !newPassword || !confirmPassword) {
			setErrorMessage("すべてのフィールドを入力してください。");
			return;
		}
		if (newPassword !== confirmPassword) {
			setErrorMessage("新しいパスワードが一致しません。");
			return;
		}
		if (oldPassword === newPassword) {
			setErrorMessage("現在のパスワードと新しいパスワードが同じです。");
			return;
		}

		setLoading(true);

		try {
			const response = await put("/users/me/password", {
				current_password: oldPassword,
				new_password: newPassword,
			});

			if (response.status === 204) {
				setSuccessMessage(
					"パスワードが正常に更新されました。自動的に次のステップに進みます。",
				);
				setOldPassword("");
				setNewPassword("");
				setConfirmPassword("");
				setTimeout(() => {
					onSuccess();
				}, 1500); // 1.5秒後に次のステップへ
			} else {
				setErrorMessage(
					response.data.error_msg || "パスワードの更新に失敗しました。",
				);
			}
		} catch (error) {
			console.error("Error updating password:", error);
			setErrorMessage("パスワードの更新中にエラーが発生しました。");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="space-y-6 text-left">
			<h2 className="text-xl font-semibold text-gray-800">
				パスワードを更新してください
			</h2>
			<p className="text-sm text-gray-600">
				セキュリティのため、初期パスワードから変更することを推奨します。
			</p>

			{errorMessage && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertTitle>エラー</AlertTitle>
					<AlertDescription>{errorMessage}</AlertDescription>
				</Alert>
			)}
			{successMessage && (
				<Alert className="bg-green-100 border-green-300 text-green-800">
					<CheckCircle2 className="h-4 w-4 text-green-600" />
					<AlertTitle>成功</AlertTitle>
					<AlertDescription>{successMessage}</AlertDescription>
				</Alert>
			)}

			<div className="space-y-4">
				<div>
					<Label htmlFor="currentPassword">現在のパスワード</Label>
					<Input
						type="password"
						placeholder="現在のパスワード"
						value={oldPassword}
						onChange={(e) => setOldPassword(e.target.value)}
						className="mt-1"
						disabled={loading}
					/>
				</div>
				<div>
					<Label htmlFor="newPassword">新しいパスワード</Label>
					<Input
						type="password"
						placeholder="新しいパスワード"
						value={newPassword}
						onChange={(e) => setNewPassword(e.target.value)}
						className="mt-1"
						disabled={loading}
					/>
				</div>
				<div>
					<Label htmlFor="confirmPassword">新しいパスワード（確認用）</Label>
					<Input
						type="password"
						placeholder="もう一度入力"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						className="mt-1"
						disabled={loading}
					/>
				</div>
			</div>

			<div className="flex justify-end">
				<Button
					onClick={handleUpdatePassword}
					disabled={loading || !!successMessage}
				>
					{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					パスワードを変更する
				</Button>
			</div>
		</div>
	);
};

export default InitialPasswordChange;
