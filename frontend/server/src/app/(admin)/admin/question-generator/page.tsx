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
			
			const requestUrl = `${apiUrl}/api/dify/generate-question`;
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
			let generatedQuestions: any[] = [];
			const responseData = response.data.data; // Difyの生のレスポンスデータ
			
			// デバッグ: outputs構造をログ出力
			console.log("[Question Generator] responseData:", responseData);
			console.log("[Question Generator] outputs:", responseData?.outputs);
			console.log("[Question Generator] outputs keys:", responseData?.outputs ? Object.keys(responseData.outputs) : "none");
			
			// outputs内の全キーと値をログ出力
			if (responseData?.outputs) {
				for (const [key, val] of Object.entries(responseData.outputs)) {
					const valStr = typeof val === 'string' ? val.substring(0, 200) : JSON.stringify(val);
					console.log(`[Question Generator] outputs.${key} (${typeof val}):`, valStr);
				}
			}
			
			// まずoutputs.textを優先的にチェック（最も一般的なパターン）
			const outputText = responseData?.outputs?.text;
			const outputQuestions = responseData?.outputs?.questions;
			
			console.log("[Question Generator] outputText type:", typeof outputText);
			console.log("[Question Generator] outputText empty?:", outputText === "" || outputText === null || outputText === undefined);
			console.log("[Question Generator] outputQuestions:", outputQuestions);
			
			// 1. outputs.text (テキストとして返ってきた場合、JSONパースを試みる) - 最優先
			if (typeof outputText === 'string' && outputText.trim() !== '') {
				console.log("[Question Generator] Found text in outputs.text, attempting JSON parse");
				console.log("[Question Generator] outputs.text length:", outputText.length);
				console.log("[Question Generator] outputs.text preview:", outputText.substring(0, 300));
				try {
					// マークダウンのコードブロックが含まれている場合の除去
					let cleanJson = outputText.replace(/```json\n?|\n?```/g, '').trim();
					console.log("[Question Generator] cleanJson preview:", cleanJson.substring(0, 300));
					
					const parsed = JSON.parse(cleanJson);
					console.log("[Question Generator] JSON.parse succeeded!");
					console.log("[Question Generator] parsed type:", typeof parsed);
					console.log("[Question Generator] parsed isArray:", Array.isArray(parsed));
					console.log("[Question Generator] parsed length:", Array.isArray(parsed) ? parsed.length : "N/A");
					
					if (Array.isArray(parsed)) {
						generatedQuestions = parsed;
					} else if (parsed && typeof parsed === 'object') {
						// オブジェクトの場合、questionsプロパティを探す
						if (Array.isArray(parsed.questions)) {
							generatedQuestions = parsed.questions;
						} else {
							// 単一オブジェクトを配列に変換
							generatedQuestions = [parsed];
						}
					}
					console.log("[Question Generator] generatedQuestions length:", generatedQuestions.length);
				} catch (e: any) {
					console.error("[Question Generator] Failed to parse outputs.text as JSON:", e.message);
					console.error("[Question Generator] JSON parse error position:", e);
				}
			}
			// 2. outputs.questions (配列として直接返ってきた場合)
			else if (Array.isArray(outputQuestions) && outputQuestions.length > 0) {
				console.log("[Question Generator] Found questions in outputs.questions");
				generatedQuestions = outputQuestions;
			}
			// 3. outputs.result (別の出力変数名の可能性)
			else if (typeof responseData?.outputs?.result === 'string' && responseData.outputs.result.trim() !== '') {
				console.log("[Question Generator] Found text in outputs.result, attempting JSON parse");
				try {
					const cleanJson = responseData.outputs.result.replace(/```json\n?|\n?```/g, '').trim();
					generatedQuestions = JSON.parse(cleanJson);
				} catch (e) {
					console.warn("[Question Generator] Failed to parse outputs.result as JSON:", e);
				}
			}
			// 4. outputs.output (別の出力変数名の可能性)
			else if (typeof responseData?.outputs?.output === 'string' && responseData.outputs.output.trim() !== '') {
				console.log("[Question Generator] Found text in outputs.output, attempting JSON parse");
				try {
					const cleanJson = responseData.outputs.output.replace(/```json\n?|\n?```/g, '').trim();
					generatedQuestions = JSON.parse(cleanJson);
				} catch (e) {
					console.warn("[Question Generator] Failed to parse outputs.output as JSON:", e);
				}
			}
			// 5. outputs内の最初の配列を探す
			else if (responseData?.outputs) {
				console.log("[Question Generator] Searching for array in outputs...");
				for (const [key, val] of Object.entries(responseData.outputs)) {
					console.log(`[Question Generator] outputs.${key}:`, typeof val, Array.isArray(val) ? `(array length: ${(val as any[]).length})` : '');
					if (Array.isArray(val) && (val as any[]).length > 0) {
						generatedQuestions = val as any[];
						console.log(`[Question Generator] Found questions in outputs.${key}`);
						break;
					}
					// 文字列でJSONパース可能なものを探す
					if (typeof val === 'string' && val.trim() !== '' && val.trim().startsWith('[')) {
						try {
							const cleanJson = (val as string).replace(/```json\n?|\n?```/g, '').trim();
							const parsed = JSON.parse(cleanJson);
							if (Array.isArray(parsed) && parsed.length > 0) {
								generatedQuestions = parsed;
								console.log(`[Question Generator] Found questions in outputs.${key} (parsed JSON)`);
								break;
							}
						} catch (e) {
							// パース失敗、続行
						}
					}
				}
			}
			
			// まだ見つからない場合のフォールバック
			if (!generatedQuestions || generatedQuestions.length === 0) {
				console.log("[Question Generator] Trying fallback locations...");
				if (responseData?.questions) {
					generatedQuestions = responseData.questions;
					console.log("[Question Generator] Found questions in responseData.questions");
				} else if (Array.isArray(responseData)) {
					generatedQuestions = responseData;
					console.log("[Question Generator] responseData is array");
				} else if (response.data.questions) {
					generatedQuestions = response.data.questions;
					console.log("[Question Generator] Found questions in response.data.questions");
				}
			}

			// 最終チェック
			if (!generatedQuestions || !Array.isArray(generatedQuestions) || generatedQuestions.length === 0) {
				console.error("[Question Generator] No questions found! Full response:", JSON.stringify(response.data, null, 2));
				console.error("[Question Generator] Dify workflow status:", responseData?.status);
				console.error("[Question Generator] Dify outputs:", JSON.stringify(responseData?.outputs, null, 2));
				
				// outputs内のキーを取得
				const outputKeys = responseData?.outputs ? Object.keys(responseData.outputs) : [];
				const outputsInfo = outputKeys.length > 0 
					? `出力変数: ${outputKeys.join(", ")}` 
					: "出力変数なし";
				
				// 各出力変数の値の有無を確認
				const outputsDetail = outputKeys.map(key => {
					const val = responseData.outputs[key];
					if (val === null || val === undefined) return `${key}: null`;
					if (typeof val === 'string') return `${key}: "${val.substring(0, 50)}${val.length > 50 ? '...' : ''}"`;
					if (Array.isArray(val)) return `${key}: Array(${val.length})`;
					return `${key}: ${typeof val}`;
				}).join(", ");
				
				console.error("[Question Generator] Outputs detail:", outputsDetail);
				
				// Difyワークフローが成功したが出力が空の場合の詳細なエラーメッセージ
				let errorMessage = "問題データが見つかりませんでした。";
				let errorDetail = "";
				
				if (responseData?.status === "succeeded") {
					// 出力が空または空文字の場合
					const hasEmptyOutput = outputKeys.some(key => {
						const val = responseData.outputs[key];
						return val === "" || val === null || val === undefined || 
							(Array.isArray(val) && val.length === 0);
					});
					
					if (hasEmptyOutput || outputKeys.length === 0) {
						errorMessage = "Difyワークフローは成功しましたが、出力が空です。";
						errorDetail = `Difyワークフローの「終了」ノードで出力変数が正しく設定されているか確認してください。\n\n期待する出力形式: JSON配列 [{id, question, answer, difficulty}, ...]\n\n現在の出力: ${outputsDetail || "なし"}`;
					} else {
						errorMessage = "問題データの形式が認識できません。";
						errorDetail = `Difyワークフローの出力形式を確認してください。\n\n現在の出力変数: ${outputsDetail}`;
					}
				} else if (responseData?.status === "failed") {
					errorMessage = `Difyワークフローが失敗しました: ${responseData?.error || "不明なエラー"}`;
				}
				
				toast({
					title: "問題生成エラー",
					description: errorMessage,
					variant: "destructive",
				});
				
				// 詳細情報をアラートで表示（開発者向け）
				if (errorDetail) {
					console.error("[Question Generator] Error detail:", errorDetail);
					alert(`デバッグ情報:\n\n${errorDetail}`);
				}
				
				return;
			}

			console.log("[Question Generator] Parsed questions:", generatedQuestions);
			
			// 問題データを整形（重複IDを防ぐためにインデックスを使用してユニークなIDを生成）
			const formattedQuestions: Question[] = generatedQuestions.map((q: any, index: number) => ({
				id: q.id || `Q${index + 1}`, // 元のIDを使用、なければインデックスから生成
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
