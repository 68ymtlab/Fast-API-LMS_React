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
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import axios from "@/lib/axios";

// --- 型定義 -----------------------------------------

interface WeekInfo {
    week_id: number;
    week_name: string;
    week_detail: string;
    week_num: number;
    week_content: string;
    total_pages: number;
}

// ✅ 実際のAPIレスポンスに合わせて修正
interface FlowInfo {
    id: number; // flow_id から id に変更
    flow_name: string;
    flow_detail: string;
    flow_order: number;
}

interface ContentAssets {
    image: Array<{ id: number; name: string; id_in_yml: string }>;
    flow: Array<{ id: number; id_in_yml: string }>;
    page: Array<{ week_num: number; order: number; week_id: number }>;
}

// ----------------------------------------------------------

function WeekPreviewPage() {
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

    // --- コンテンツ変換関数 ---
    const contentReplace = (
        content: string,
        assets: ContentAssets | null,
    ): string => {
        if (!assets) return content;

        let processedContent = content;

        // flow置換
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

        // 画像置換
        assets.image.forEach((image) => {
            const regex2 = new RegExp(`\\(\\s*image/${image.name}\\s*\\)`, "g");
            processedContent = processedContent.replace(
                regex2,
                `<img src="/api/get_image/${image.id}" class="max-w-full h-auto" />`,
            );

            const regex3 = new RegExp(`\\[\\s*image/${image.name}(.*?)\\s*\\]`, "g");
            processedContent = processedContent.replace(regex3, (_, optionsStr) => {
                const widthMatch = optionsStr.match(/width=([0-9]+)/);
                const heightMatch = optionsStr.match(/height=([0-9]+)/);
                const widthAttr = widthMatch ? ` width="${widthMatch[1]}"` : "";
                const heightAttr = heightMatch ? ` height="${heightMatch[1]}"` : "";
                return `<img src="/api/get_image/${image.id}"${widthAttr}${heightAttr} class="max-w-full h-auto" />`;
            });
        });

        // ページリンク置換
        const weekNumOrderToWeekId: { [key: string]: number } = {};
        assets.page.forEach((item) => {
            const key = `${item.week_num}_${item.order}`;
            weekNumOrderToWeekId[key] = item.week_id;
        });

        const regex4 = /\[(.*?)\]\s*\(\s*page\/(\d+)\/(\d+)\/(\d+)\s*\)/g;
        processedContent = processedContent.replace(
            regex4,
            (_, linkText, weekNum, order, page) => {
                const key = `${weekNum}_${order}`;
                const weekIdToUse = weekNumOrderToWeekId[key] || weekNum;
                return `<div class="p-3 border-2 border-dashed border-green-300 bg-green-50 rounded-lg my-2"><p><a href="/t/course/${params.course_id}/preview/week/${weekIdToUse}/${page}" class="text-green-600 hover:text-green-800">${linkText}</a></p></div>`;
            },
        );

        return processedContent;
    };

    // --- データ取得 ---
    useEffect(() => {
        if (params.course_id && params.week_id && params.page) {
            fetchWeekData();
        }
    }, [params.course_id, params.week_id, params.page]);

    const fetchWeekData = async () => {
        try {
            setLoading(true);
            setErrorMessage("");
            setProcessedContent("");

            const assetsResponse = await axios.get(
                `/get_week_origin_content/${params.course_id}/${params.week_id}`,
            );

            const assets: ContentAssets = {
                image: assetsResponse.data.image || [],
                flow: assetsResponse.data.flow || [],
                page: assetsResponse.data.page || [],
            };
            setContentAssets(assets);

            const pageContent = assetsResponse.data.block.find(
                (block: any) => block.page === currentPage,
            );
            let replacedContent = "";
            if (pageContent) {
                const rawContent = pageContent.content || "";
                replacedContent = contentReplace(rawContent, assets);
                setProcessedContent(replacedContent);
            }

            setWeekInfo({
                week_id: Number(params.week_id),
                week_name: `第${currentPage}ページ`,
                week_detail: "",
                week_num: 1,
                week_content: replacedContent,
                total_pages: assetsResponse.data.block?.length || 1,
            });

            try {
                const flowsResponse = await axios.get(
                    `/get_week_flows/${params.week_id}`,
                );
                setFlows(flowsResponse.data);
            } catch {
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

    return (
        <MathJaxSetup>
            <div className="container mx-auto py-8 px-4 max-w-6xl">
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
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            <h4 className="font-semibold mb-2">学習内容</h4>
                                            <div className="border border-gray-200 rounded-lg bg-white overflow-auto min-h-[600px]">
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
                                    </CardContent>
                                    {weekInfo.total_pages > 1 && (
                                        <CardFooter className="flex justify-between items-center border-t pt-4">
                                            <Button
                                                onClick={() => goToPage(currentPage - 1)}
                                                disabled={currentPage <= 1}
                                                variant="outline"
                                                className="w-40"
                                            >
                                                <ChevronLeft className="h-4 w-4 mr-2" />
                                                前のページ
                                            </Button>
                                            <div className="text-sm font-medium">
                                                {currentPage} / {weekInfo.total_pages}
                                            </div>
                                            <Button
                                                onClick={() => goToPage(currentPage + 1)}
                                                disabled={currentPage >= weekInfo.total_pages}
                                                variant="outline"
                                                className="w-40"
                                            >
                                                次のページ
                                                <ChevronRight className="h-4 w-4 ml-2" />
                                            </Button>
                                        </CardFooter>
                                    )}
                                </Card>

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
                                                        key={flow.id} // ✅ keyをflow.idに変更
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
                                                                    {/* ✅✅✅ ここを修正 ✅✅✅ */}
                                                                    <Link
                                                                        href={`/t/course/${params.course_id}/preview/flow/${flow.id}`}
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
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </MathJaxSetup>
    );
}

export default WeekPreviewPage;