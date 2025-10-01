"use client";

import {
	AlertCircle,
	ArrowLeft,
	BookOpen,
	ChevronLeft,
	ChevronRight,
	Eye,
	FileText,
	Play,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MathJax, MathJaxSetup } from "@/components/shared/MathJax";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useLoginUser } from "@/hooks/useLoginUser";
import axios from "@/lib/axios";

interface WeekInfo {
	week_id: number;
	week_name: string;
	week_detail: string;
	week_num: number;
	week_content: string;
	total_pages: number;
}

interface FlowInfo {
	flow_id: number;
	flow_name: string;
	flow_detail: string;
	flow_order: number;
}

// コンテンツ処理のためのインターフェース
interface ContentAssets {
	image: Array<{ id: number; name: string; id_in_yml: string }>;
	flow: Array<{ id: number; id_in_yml: string }>;
	page: Array<{ week_num: number; order: number; week_id: number }>;
}

function WeekPreviewPage() {
	const { loginUser, isLoadingUser } = useLoginUser();
	const router = useRouter();
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [weekInfo, setWeekInfo] = useState<WeekInfo | null>(null);
	const [flows, setFlows] = useState<FlowInfo[]>([]);
	const [contentAssets, setContentAssets] = useState<ContentAssets | null>(
		null,
	);
	const [processedContent, setProcessedContent] = useState("");

	const currentPage = Number.parseInt(params.page as string) || 1;

	// MathJaxコンポーネントが数式処理を自動で行うため、関数は不要

	// 正常動作している編集ページを完全に模倣したcontentReplace関数
	const contentReplace = (
		content: string,
		assets: ContentAssets | null,
	): string => {
		if (!assets) return content;

		let processedContent = content;

		// Flow links replacement
		assets.flow.forEach((flow) => {
			const regex1 = new RegExp(
				`\\[(.*?)\\]\\s*\\(\\s*flow/${flow.id_in_yml}\\s*\\)`,
				"g",
			);
			processedContent = processedContent.replace(
				regex1,
				`<div class="p-3 border-2 border-dashed border-blue-300 bg-blue-50 rounded-lg my-2"><p><a href="/t/course/${params.course_id}/preview/flow/${flow.id}" class="text-blue-600 hover:text-blue-800">$1</a></p></div>`,
			);
		});

		// Image replacement
		assets.image.forEach((image) => {
			// (image/...) 形式を <img> タグに置換
			const regex2 = new RegExp(`\\(\\s*image/${image.name}\\s*\\)`, "g");
			processedContent = processedContent.replace(
				regex2,
				`<img src="/api/get_image/${image.id}" class="max-w-full h-auto" />`,
			);

			// [image/...] 形式を <img> タグに置換（width/height指定あり）
			const regex3 = new RegExp(`\\[\\s*image/${image.name}(.*?)\\s*\\]`, "g");
			processedContent = processedContent.replace(regex3, (_, optionsStr) => {
				const widthMatch = optionsStr.match(/width=([0-9]+)/);
				const heightMatch = optionsStr.match(/height=([0-9]+)/);

				const widthAttr = widthMatch ? ` width="${widthMatch[1]}"` : "";
				const heightAttr = heightMatch ? ` height="${heightMatch[1]}"` : "";

				return `<img src="/api/get_image/${image.id}"${widthAttr}${heightAttr} class="max-w-full h-auto" />`;
			});
		});

		// Page links replacement
		const weekNumOrderToWeekId: { [key: string]: number } = {};
		assets.page.forEach((item) => {
			const key = `${item.week_num}_${item.order}`;
			weekNumOrderToWeekId[key] = item.week_id;
		});

		const regex4 = /\[(.*?)\]\s*\(\s*page\/(\d+)\/(\d+)\/(\d+)\s*\)/g;
		processedContent = processedContent.replace(
			regex4,
			(match, linkText, weekNum, order, page) => {
				const key = `${weekNum}_${order}`;
				const weekIdToUse = weekNumOrderToWeekId[key] || weekNum;
				return `<div class="p-3 border-2 border-dashed border-green-300 bg-green-50 rounded-lg my-2"><p><a href="/t/course/${params.course_id}/preview/week/${weekIdToUse}/${page}" class="text-green-600 hover:text-green-800">${linkText}</a></p></div>`;
			},
		);

		return processedContent;
	};

	useEffect(() => {
		if (!isLoadingUser && !loginUser) {
			router.push("/login");
		}
	}, [loginUser, isLoadingUser, router]);

	useEffect(() => {
		if (params.course_id && params.week_id && params.page) {
			fetchWeekData();
		}
	}, [params.course_id, params.week_id, params.page]);

	// MathJaxテストセクションを除去するDOM操作
	useEffect(() => {
		const removeMathJaxTestSection = () => {
			console.log("Running DOM cleanup for MathJax test content");

			// h4要素でMathJaxテストを含むものを探す
			const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
			headings.forEach((heading) => {
				if (heading.textContent === "MathJaxテスト") {
					console.log("Found MathJax test heading:", heading);
					// 見つかったヘッダー要素を削除
					const element = heading;
					const parent = heading.parentElement;

					// 親要素が存在し、その中身をすべて削除
					if (parent) {
						// 次の見出しまでの要素を削除
						let nextElement = heading.nextElementSibling;
						while (nextElement && !nextElement.tagName.match(/^H[1-6]$/)) {
							const toRemove = nextElement;
							nextElement = nextElement.nextElementSibling;
							toRemove.remove();
						}
						heading.remove();
					}
				}
			});
		};

		// 初回実行とMutationObserverの設定
		setTimeout(removeMathJaxTestSection, 100);
		setTimeout(removeMathJaxTestSection, 500);
		setTimeout(removeMathJaxTestSection, 1000);

		// MutationObserverでDOM変更を監視
		const observer = new MutationObserver(() => {
			removeMathJaxTestSection();
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
		});

		return () => observer.disconnect();
	}, [processedContent]);

	const fetchWeekData = async () => {
		try {
			setLoading(true);
			setErrorMessage("");

			console.log("Fetching week data:", {
				course_id: params.course_id,
				week_id: params.week_id,
				page: params.page,
				currentPage,
			});

			// 編集ページと同じAPIエンドポイントを使用
			const assetsResponse = await axios.get(
				`/get_week_origin_content/${params.course_id}/${params.week_id}`,
			);
			console.log("Assets response:", assetsResponse.data);

			const assets = {
				image: assetsResponse.data.image || [],
				flow: assetsResponse.data.flow || [],
				page: assetsResponse.data.page || [],
			};
			setContentAssets(assets);

			// 編集ページと同じように、現在ページのコンテンツを取得
			const pageContent = assetsResponse.data.block.find(
				(block: any) => block.page === currentPage,
			);
			let replacedContent = "";
			if (pageContent) {
				const rawContent = pageContent.content || "";
				replacedContent = contentReplace(rawContent, assets);

				// デバッグログ
				console.log("Raw content length:", rawContent.length);
				console.log(
					"Processed content before filtering:",
					replacedContent.substring(0, 500),
				);

				// MathJaxテストセクションを除去
				const originalLength = replacedContent.length;
				console.log(
					"Original content (first 1000 chars):",
					replacedContent.substring(0, 1000),
				);

				// MathJaxテストセクションを見つけて削除
				// #### MathJaxテスト から次の見出しまでを削除
				replacedContent = replacedContent.replace(
					/####\s*MathJaxテスト[\s\S]*?(?=####\s*学習内容|$)/g,
					"",
				);
				replacedContent = replacedContent.replace(
					/###\s*MathJaxテスト[\s\S]*?(?=###|####|$)/g,
					"",
				);
				replacedContent = replacedContent.replace(
					/##\s*MathJaxテスト[\s\S]*?(?=##|###|####|$)/g,
					"",
				);
				replacedContent = replacedContent.replace(
					/#\s*MathJaxテスト[\s\S]*?(?=#|##|###|####|$)/g,
					"",
				);

				// HTMLタグの場合
				replacedContent = replacedContent.replace(
					/<h4[^>]*>\s*MathJaxテスト\s*<\/h4>[\s\S]*?(?=<h[1-6][^>]*>\s*学習内容|$)/gi,
					"",
				);
				replacedContent = replacedContent.replace(
					/<h3[^>]*>\s*MathJaxテスト\s*<\/h3>[\s\S]*?(?=<h[1-6]|$)/gi,
					"",
				);
				replacedContent = replacedContent.replace(
					/<h2[^>]*>\s*MathJaxテスト\s*<\/h2>[\s\S]*?(?=<h[1-6]|$)/gi,
					"",
				);
				replacedContent = replacedContent.replace(
					/<h1[^>]*>\s*MathJaxテスト\s*<\/h1>[\s\S]*?(?=<h[1-6]|$)/gi,
					"",
				);

				// 空行を整理
				replacedContent = replacedContent.replace(/\n{3,}/g, "\n\n");
				replacedContent = replacedContent.trim();

				console.log(
					"Content filtered from",
					originalLength,
					"to",
					replacedContent.length,
					"chars",
				);

				setProcessedContent(replacedContent);
			}

			// 週情報を設定（assetsResponseから取得）
			setWeekInfo({
				week_id: Number.parseInt(params.week_id as string),
				week_name: `第${currentPage}ページ`,
				week_detail: "",
				week_num: 1,
				week_content: replacedContent,
				total_pages: assetsResponse.data.block?.length || 1,
			});

			// フロー情報を取得
			try {
				const flowsResponse = await axios.get(
					`/get_week_flows/${params.week_id}`,
				);
				console.log("Flows response:", flowsResponse.data);
				setFlows(flowsResponse.data);
			} catch (flowError) {
				console.warn("Flows data not available:", flowError);
				setFlows([]);
			}
		} catch (error) {
			console.error("Error fetching week data:", error);
			setErrorMessage("週次コンテンツの取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	const goToPage = (page: number) => {
		router.push(
			`/t/course/${params.course_id}/preview/week/${params.week_id}/${page}`,
		);
	};

	if (isLoadingUser || loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
			</div>
		);
	}

	return (
		<MathJaxSetup>
			<div className="container mx-auto py-8 px-4 max-w-6xl">
				{/* ナビゲーション */}
				<div className="mb-6">
					<Link
						href={`/t/course/${params.course_id}`}
						className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
					>
						<ArrowLeft className="h-4 w-4" />
						コースに戻る
					</Link>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-2xl flex items-center gap-2">
							<Eye className="h-6 w-6" />
							週次コンテンツプレビュー
						</CardTitle>
						<CardDescription>
							学生から見た週次コンテンツの表示を確認できます
						</CardDescription>
					</CardHeader>
					<CardContent>
						{errorMessage && (
							<Alert variant="destructive" className="mb-6">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{errorMessage}</AlertDescription>
							</Alert>
						)}

						{weekInfo && (
							<div className="space-y-8">
								{/* 週の基本情報 */}
								<Card>
									<CardHeader>
										<div className="flex items-center justify-between">
											<div>
												<CardTitle className="text-lg flex items-center gap-2">
													<BookOpen className="h-5 w-5" />
													{weekInfo.week_name}
												</CardTitle>
												<div className="flex items-center gap-2 mt-2">
													<Badge variant="outline">
														第{weekInfo.week_num}週
													</Badge>
													<Badge variant="secondary">
														{currentPage} / {weekInfo.total_pages} ページ
													</Badge>
												</div>
											</div>
											<div className="flex items-center gap-2">
												<Link
													href={`/t/course/${params.course_id}/week/${params.week_id}/edit`}
												>
													<Button variant="outline" size="sm">
														編集
													</Button>
												</Link>
											</div>
										</div>
									</CardHeader>
									<CardContent>
										<div className="space-y-4">
											{weekInfo.week_detail && (
												<div>
													<h4 className="font-semibold mb-2">週の概要</h4>
													<p className="text-gray-700 whitespace-pre-wrap">
														{weekInfo.week_detail}
													</p>
												</div>
											)}
											<div>
												<h4 className="font-semibold mb-2">学習内容</h4>
												<div className="border border-gray-200 rounded-lg min-h-[600px] bg-white overflow-auto">
													<div className="container mx-auto p-0">
														<div className="min-h-[300px]">
															<div className="p-4">
																{processedContent ? (
																	<MathJax text={processedContent} />
																) : (
																	<div className="text-gray-500 italic">
																		コンテンツを読み込み中...
																	</div>
																)}
															</div>
														</div>
													</div>
												</div>
											</div>
										</div>
									</CardContent>
								</Card>

								{/* ページネーション */}
								{weekInfo.total_pages > 1 && (
									<Card>
										<CardContent className="p-4">
											<div className="flex items-center justify-between">
												<Button
													variant="outline"
													onClick={() => goToPage(currentPage - 1)}
													disabled={currentPage <= 1}
													className="flex items-center gap-2"
												>
													<ChevronLeft className="h-4 w-4" />
													前のページ
												</Button>

												<div className="flex items-center gap-2">
													<span className="text-sm text-gray-600">
														{currentPage} / {weekInfo.total_pages} ページ
													</span>
												</div>

												<div className="flex items-center gap-2">
													{currentPage < weekInfo.total_pages ? (
														<Button
															variant="outline"
															onClick={() => goToPage(currentPage + 1)}
															className="flex items-center gap-2"
														>
															次のページ
															<ChevronRight className="h-4 w-4" />
														</Button>
													) : (
														<Link href={`/t/course/${params.course_id}`}>
															<Button
																variant="default"
																className="flex items-center gap-2"
															>
																コースに戻る
																<ArrowLeft className="h-4 w-4" />
															</Button>
														</Link>
													)}
												</div>
											</div>
										</CardContent>
									</Card>
								)}

								{/* 演習問題一覧 */}
								<Card>
									<CardHeader>
										<CardTitle className="text-lg flex items-center gap-2">
											<Play className="h-5 w-5" />
											演習問題一覧
										</CardTitle>
										<CardDescription>
											この週に含まれる演習問題 ({flows.length}個)
										</CardDescription>
									</CardHeader>
									<CardContent>
										{flows.length === 0 ? (
											<div className="text-center py-8">
												<FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
												<p className="text-gray-500">
													演習問題が登録されていません
												</p>
											</div>
										) : (
											<div className="grid gap-4">
												{flows.map((flow) => (
													<Card
														key={flow.flow_id}
														className="border-l-4 border-l-green-500"
													>
														<CardContent className="p-4">
															<div className="flex items-start justify-between">
																<div className="flex-1">
																	<div className="flex items-center gap-3 mb-2">
																		<Badge variant="outline">
																			問題 {flow.flow_order}
																		</Badge>
																		<h4 className="font-semibold">
																			{flow.flow_name}
																		</h4>
																	</div>
																	<p className="text-gray-600 whitespace-pre-wrap">
																		{flow.flow_detail}
																	</p>
																</div>
																<div className="flex flex-col gap-2 ml-4">
																	<Link
																		href={`/lesson/${params.course_id}/${params.week_id}/${flow.flow_id}/session/1`}
																	>
																		<Button
																			size="sm"
																			variant="outline"
																			className="flex items-center gap-2"
																		>
																			<Eye className="h-4 w-4" />
																			プレビュー
																		</Button>
																	</Link>
																</div>
															</div>
														</CardContent>
													</Card>
												))}
											</div>
										)}
									</CardContent>
								</Card>

								{/* アクション */}
								<div className="flex justify-center gap-4">
									<Link
										href={`/lesson/${params.course_id}/${params.week_id}/1`}
									>
										<Button
											variant="outline"
											className="flex items-center gap-2"
										>
											<Eye className="h-4 w-4" />
											学生画面で表示
										</Button>
									</Link>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</MathJaxSetup>
	);
}

export default WeekPreviewPage;
