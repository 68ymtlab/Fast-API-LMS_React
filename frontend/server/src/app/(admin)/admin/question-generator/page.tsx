"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload, FileText, CheckCircle2 } from "lucide-react";
import axios from "axios";
import { useToast } from "@/hooks/use-toast";

// MathJaxの型定義
declare global {
	interface Window {
		MathJax: any;
	}
}

interface Question {
	id: string;
	question: string;
	answer: string;
	difficulty: number;
	selected?: boolean;
}

export default function QuestionGeneratorPage() {
	const { toast } = useToast();
	const [loading, setLoading] = useState(false);
	const [loadingStatus, setLoadingStatus] = useState("");
	const [difficulty, setDifficulty] = useState(3);
	const [number, setNumber] = useState(10);
	const [keyword, setKeyword] = useState("");
	const [custom, setCustom] = useState("");
	const [ruleFile, setRuleFile] = useState<File | null>(null);
	const [exercisesFile, setExercisesFile] = useState<File | null>(null);
	const [testDataFile, setTestDataFile] = useState<File | null>(null);
	const [questions, setQuestions] = useState<Question[]>([]);

	// MathJaxの初期化と読み込み
	useEffect(() => {
		// すでにスクリプトが存在する場合は何もしない
		if (document.getElementById("mathjax-script")) {
			return;
		}

		// MathJaxの設定
		window.MathJax = {
			tex: {
				inlineMath: [
					["$", "$"],
					["\\(", "\\)"],
				],
				displayMath: [
					["$$", "$$"],
					["\\[", "\\]"],
				],
				processEscapes: true,
			},
			svg: {
				fontCache: "global",
			},
			startup: {
				typeset: false, // 自動レンダリングを無効化
			},
		};

		// スクリプトの動的読み込み
		const script = document.createElement("script");
		script.id = "mathjax-script";
		script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
		script.async = true;
		script.onload = () => {
			console.log("MathJax loaded manually");
		};
		document.body.appendChild(script);

		return () => {
			// コンポーネントのアンマウント時にスクリプトを削除しない（再読み込みを防ぐため）
		};
	}, []);

	// 問題が更新されたらMathJaxでレンダリング
	useEffect(() => {
		if (questions.length > 0) {
			// MathJaxが利用可能になるまでポーリングしてレンダリング
			const renderMath = () => {
				if (window.MathJax && window.MathJax.typesetPromise) {
					window.MathJax.typesetPromise()
						.then(() => console.log("MathJax typeset complete"))
						.catch((err: any) => console.error("MathJax typeset error:", err));
				}
			};

			// 即時実行
			renderMath();

			// 読み込み待ちのリトライ（最大5秒）
			const intervalId = setInterval(() => {
				if (window.MathJax && window.MathJax.typesetPromise) {
					renderMath();
					clearInterval(intervalId);
				}
			}, 500);

			setTimeout(() => clearInterval(intervalId), 5000);
		}
	}, [questions]);

	const handleGenerate = async () => {
		if (!ruleFile || !exercisesFile || !testDataFile) {
			toast({
				title: "エラー",
				description: "すべてのファイルをアップロードしてください",
				variant: "destructive",
			});
			return;
		}

		setLoading(true);
		setQuestions([]); // 前回の結果をクリア
		setLoadingStatus("ファイルをアップロード中...");

		try {
			const formData = new FormData();
			formData.append("difficulty", difficulty.toString());
			formData.append("number", number.toString());
			formData.append("keyword", keyword);
			formData.append("rule", ruleFile);
			formData.append("exercises", exercisesFile);
			formData.append("test_data", testDataFile);
			formData.append("custom", custom);

			console.log("[Question Generator] Sending request...");
			console.log("Difficulty:", difficulty);
			console.log("Number:", number);
			console.log("Keyword:", keyword);

			// トークンを取得
			const token = localStorage.getItem("token");
			
			setLoadingStatus("Dify AIに問題生成をリクエスト中...");
			
			// バックエンドAPIのURL（直接アクセス）
			// 環境変数の設定ミス（/api/proxyなど）を回避するため、強制的にローカルバックエンドを使用
			const apiUrl = "http://localhost:8000";
			
			const requestUrl = `${apiUrl}/dify/generate-question`;
			console.log("[Question Generator] Request URL:", requestUrl);
			
			const response = await axios.post(
				requestUrl,
				formData,
				{
					headers: {
						"Content-Type": "multipart/form-data",
						...(token && { Authorization: `Bearer ${token}` }),
					},
				}
			);

			console.log("[Question Generator] Response received:", JSON.stringify(response.data, null, 2));

			setLoadingStatus("問題データを解析中...");

			// Difyからのレスポンスを解析
			let generatedQuestions = [];
			const responseData = response.data.data; // Difyの生のレスポンスデータ
			
			// 1. outputs.questions (標準的なパターン)
			if (responseData?.outputs?.questions) {
				generatedQuestions = responseData.outputs.questions;
			} 
			// 2. outputs.text (テキストとして返ってきた場合、JSONパースを試みる)
			else if (typeof responseData?.outputs?.text === 'string') {
				try {
					// マークダウンのコードブロックが含まれている場合の除去
					const cleanJson = responseData.outputs.text.replace(/```json\n?|\n?```/g, '').trim();
					generatedQuestions = JSON.parse(cleanJson);
				} catch (e) {
					console.warn("Failed to parse outputs.text as JSON", e);
				}
			}
			// 3. outputs内の最初の配列を探す
			else if (responseData?.outputs) {
				const possibleArray = Object.values(responseData.outputs).find(val => Array.isArray(val));
				if (possibleArray) {
					generatedQuestions = possibleArray;
				}
			}
			
			// まだ見つからない場合のフォールバック
			if (!generatedQuestions || generatedQuestions.length === 0) {
				if (responseData?.questions) {
					generatedQuestions = responseData.questions;
				} else if (Array.isArray(responseData)) {
					generatedQuestions = responseData;
				} else if (response.data.questions) {
					generatedQuestions = response.data.questions;
				}
			}

			// 最終チェック
			if (!generatedQuestions || !Array.isArray(generatedQuestions) || generatedQuestions.length === 0) {
				console.warn("[Question Generator] Unexpected response structure. Full data:", JSON.stringify(response.data, null, 2));
				toast({
					title: "警告",
					description: "問題データの形式が想定と異なります。コンソールで詳細を確認してください。",
					variant: "destructive",
				});
				return;
			}

			console.log("[Question Generator] Parsed questions:", generatedQuestions);
			
			// 問題データを整形
			const formattedQuestions: Question[] = generatedQuestions.map((q: any, index: number) => ({
				id: q.id || `Q${index + 1}`,
				question: q.question || "",
				answer: q.answer || "",
				difficulty: q.difficulty || difficulty,
				selected: false,
			}));

			setQuestions(formattedQuestions);

			toast({
				title: "成功",
				description: `${formattedQuestions.length}個の問題を生成しました`,
			});
		} catch (error: any) {
			console.error("[Question Generator] Error:", error);
			console.error("[Question Generator] Error response:", error.response?.data);
			
			let errorMessage = "問題生成に失敗しました";
			
			if (error.response?.data?.detail) {
				errorMessage = error.response.data.detail;
			} else if (error.response?.status === 401) {
				errorMessage = "認証エラー: ログインし直してください";
			} else if (error.response?.status === 403) {
				errorMessage = "権限エラー: 管理者または教師のみアクセス可能です";
			} else if (error.message) {
				errorMessage = error.message;
			}
			
			toast({
				title: "エラー",
				description: errorMessage,
				variant: "destructive",
			});
		} finally {
			setLoading(false);
			setLoadingStatus("");
		}
	};

	const toggleQuestion = (id: string) => {
		setQuestions((prev) =>
			prev.map((q) => (q.id === id ? { ...q, selected: !q.selected } : q))
		);
	};

	const selectedCount = questions.filter((q) => q.selected).length;

	return (
		<div className="container mx-auto py-8 px-4 max-w-7xl">
			<div className="mb-8">
				<h1 className="text-3xl font-bold mb-2">問題生成</h1>
				<p className="text-muted-foreground">
					Dify AIを使用して問題を自動生成します
				</p>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* 左側: 入力フォーム */}
				<div className="lg:col-span-1">
					<Card>
						<CardHeader>
							<CardTitle>生成設定</CardTitle>
							<CardDescription>
								問題生成のパラメータを設定してください
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="difficulty">難易度 (1-5)</Label>
								<Input
									id="difficulty"
									type="number"
									min={1}
									max={5}
									value={difficulty}
									onChange={(e) => setDifficulty(Number(e.target.value))}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="number">問題数</Label>
								<Input
									id="number"
									type="number"
									min={1}
									max={50}
									value={number}
									onChange={(e) => setNumber(Number(e.target.value))}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="keyword">キーワード</Label>
								<Input
									id="keyword"
									placeholder="例: 微分、積分"
									value={keyword}
									onChange={(e) => setKeyword(e.target.value)}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="rule">ルールブック</Label>
								<Input
									id="rule"
									type="file"
									accept=".md,.pdf,.txt,.docx"
									onChange={(e) => setRuleFile(e.target.files?.[0] || null)}
								/>
								{ruleFile && (
									<p className="text-sm text-muted-foreground flex items-center gap-1">
										<FileText className="h-4 w-4" />
										{ruleFile.name}
									</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="exercises">演習問題データ</Label>
								<Input
									id="exercises"
									type="file"
									accept=".md,.pdf,.txt,.docx"
									onChange={(e) => setExercisesFile(e.target.files?.[0] || null)}
								/>
								{exercisesFile && (
									<p className="text-sm text-muted-foreground flex items-center gap-1">
										<FileText className="h-4 w-4" />
										{exercisesFile.name}
									</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="testData">学習データ</Label>
								<Input
									id="testData"
									type="file"
									accept=".md,.pdf,.txt,.docx"
									onChange={(e) => setTestDataFile(e.target.files?.[0] || null)}
								/>
								{testDataFile && (
									<p className="text-sm text-muted-foreground flex items-center gap-1">
										<FileText className="h-4 w-4" />
										{testDataFile.name}
									</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="custom">その他の要望</Label>
								<Textarea
									id="custom"
									placeholder="例: 中学生向けの問題を作成してください"
									value={custom}
									onChange={(e) => setCustom(e.target.value)}
									rows={3}
								/>
							</div>

							<Button
								onClick={handleGenerate}
								disabled={loading}
								className="w-full"
							>
								{loading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										{loadingStatus || "生成中..."}
									</>
								) : (
									<>
										<Upload className="mr-2 h-4 w-4" />
										問題を生成
									</>
								)}
							</Button>
						</CardContent>
					</Card>
				</div>

				{/* 右側: 生成された問題 */}
				<div className="lg:col-span-2">
					<Card>
						<CardHeader>
							<CardTitle>生成された問題</CardTitle>
							<CardDescription>
								{questions.length > 0
									? `${questions.length}個の問題 / ${selectedCount}個選択中`
									: "問題を生成すると、ここに表示されます"}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{questions.length === 0 ? (
								<div className="text-center py-12 text-muted-foreground">
									<FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
									<p>まだ問題が生成されていません</p>
								</div>
							) : (
								<div className="space-y-4">
									{questions.map((question) => (
										<Card
											key={question.id}
											className={`transition-all ${
												question.selected
													? "ring-2 ring-primary"
													: "hover:shadow-md"
											}`}
										>
											<CardContent className="pt-6">
												<div className="flex items-start gap-3">
													<Checkbox
														id={question.id}
														checked={question.selected}
														onCheckedChange={() => toggleQuestion(question.id)}
														className="mt-1"
													/>
													<div className="flex-1 space-y-3">
														<div className="flex items-center gap-2">
															<Label
																htmlFor={question.id}
																className="text-lg font-semibold cursor-pointer"
															>
																{question.id}
															</Label>
															<span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
																難易度 {question.difficulty}
															</span>
															{question.selected && (
																<CheckCircle2 className="h-4 w-4 text-primary ml-auto" />
															)}
														</div>

														<div className="prose prose-sm max-w-none">
															<div
																className="math-content"
																dangerouslySetInnerHTML={{
																	__html: question.question,
																}}
															/>
														</div>

														<details className="group">
															<summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
																解答を表示
															</summary>
															<div className="mt-3 prose prose-sm max-w-none pl-4 border-l-2 border-primary/20">
																<div
																	className="math-content"
																	dangerouslySetInnerHTML={{
																		__html: question.answer,
																	}}
																/>
															</div>
														</details>
													</div>
												</div>
											</CardContent>
										</Card>
									))}

									{selectedCount > 0 && (
										<div className="sticky bottom-4 bg-background border rounded-lg p-4 shadow-lg">
											<div className="flex items-center justify-between">
												<p className="font-medium">
													{selectedCount}個の問題を選択中
												</p>
												<Button>
													選択した問題を保存
													<span className="ml-2 text-xs opacity-75">
														（今後実装予定）
													</span>
												</Button>
											</div>
										</div>
									)}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
