"use client";

import {
	AlertCircle,
	Award,
	BookMarked,
	BookOpen,
	Calendar,
	Hash,
	Target,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import TcAccessTime from "@/components/tc_access_time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import axios from "@/lib/axios";

interface SyllabusInfo {
	subject_class: string;
	subject_name: string;
	subject_credit: number;
	subject_code: string;
	subject_period: string;
	subject_keyword: string;
	subject_goals: string;
}

function SyllabusPage() {
	const params = useParams();
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [syllabusInfo, setSyllabusInfo] = useState<SyllabusInfo | null>(null);

	const keywords = useMemo(() => {
		if (!syllabusInfo?.subject_keyword) {
			return [];
		}
		return syllabusInfo.subject_keyword
			.split(",")
			.map((keyword) => keyword.trim())
			.filter(Boolean);
	}, [syllabusInfo]);

	useEffect(() => {
		if (params.course_id) {
			fetchSyllabusInfo();
		}
	}, [params.course_id]);

	const fetchSyllabusInfo = async () => {
		try {
			setLoading(true);
			const response = await axios.get(
				`/get_syllabus_info/${params.course_id}`,
			);
			setSyllabusInfo(response.data);
		} catch (error) {
			console.error("Error fetching syllabus info:", error);
			setErrorMessage("シラバス情報の取得に失敗しました");
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<TcAccessTime page="student_course_syllabus" />
			<div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-cyan-50/30">
				<main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 sm:px-6">
					<Card className="border-slate-200/80 bg-white/95 shadow-sm">
						<CardHeader className="space-y-2">
							<CardTitle className="flex items-center gap-2 text-2xl text-slate-900">
								<BookMarked className="h-6 w-6 text-cyan-700" />
								シラバス照会
							</CardTitle>
							<CardDescription className="text-sm text-slate-600">
								科目の基本情報と学習目標を読みやすく確認できます。
							</CardDescription>
						</CardHeader>
						{syllabusInfo ? (
							<CardContent className="pt-0">
								<div className="flex flex-wrap items-center gap-2">
									<Badge
										variant="outline"
										className="border-slate-300 bg-white text-slate-700"
									>
										{syllabusInfo.subject_code}
									</Badge>
									<Badge
										variant="outline"
										className="border-slate-300 bg-white text-slate-700"
									>
										{syllabusInfo.subject_credit}単位
									</Badge>
									<Badge
										variant="outline"
										className="border-slate-300 bg-white text-slate-700"
									>
										{syllabusInfo.subject_period}
									</Badge>
								</div>
							</CardContent>
						) : null}
					</Card>

					{errorMessage ? (
						<Alert variant="destructive" className="mt-5">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{errorMessage}</AlertDescription>
						</Alert>
					) : null}

					{loading ? (
						<Card className="mt-5 border-slate-200 bg-white/90">
							<CardContent className="py-12 text-center text-sm text-slate-500">
								シラバス情報を読み込み中です...
							</CardContent>
						</Card>
					) : !syllabusInfo ? (
						<Card className="mt-5 border-slate-200 bg-white/90">
							<CardContent className="py-12 text-center">
								<BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-400" />
								<p className="text-base font-medium text-slate-700">
									シラバス情報がありません
								</p>
								<p className="mt-1 text-sm text-slate-500">
									科目情報が登録されるとここに表示されます。
								</p>
							</CardContent>
						</Card>
					) : (
						<div className="mt-5 space-y-5">
							<div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
								<Card className="border-slate-200 bg-white/95 lg:col-span-2">
									<CardHeader className="pb-3">
										<CardTitle className="flex items-center gap-2 text-lg text-slate-900">
											<Award className="h-5 w-5 text-cyan-700" />
											授業科目基本情報
										</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
											<div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
												<p className="text-xs font-medium text-slate-500">
													科目名
												</p>
												<p className="mt-1 text-sm font-semibold text-slate-900">
													{syllabusInfo.subject_name}
												</p>
											</div>
											<div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
												<p className="text-xs font-medium text-slate-500">
													授業科目区分
												</p>
												<p className="mt-1 text-sm font-semibold text-slate-900">
													{syllabusInfo.subject_class}
												</p>
											</div>
											<div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
												<p className="text-xs font-medium text-slate-500">
													科目コード
												</p>
												<p className="mt-1 text-sm font-semibold text-slate-900">
													{syllabusInfo.subject_code}
												</p>
											</div>
											<div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
												<p className="text-xs font-medium text-slate-500">
													単位数
												</p>
												<p className="mt-1 text-sm font-semibold text-slate-900">
													{syllabusInfo.subject_credit}単位
												</p>
											</div>
											<div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:col-span-2">
												<p className="text-xs font-medium text-slate-500">
													開講時期
												</p>
												<div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
													<Calendar className="h-4 w-4 text-cyan-700" />
													{syllabusInfo.subject_period}
												</div>
											</div>
										</div>
									</CardContent>
								</Card>

								<Card className="border-slate-200 bg-white/95">
									<CardHeader className="pb-3">
										<CardTitle className="flex items-center gap-2 text-lg text-slate-900">
											<Hash className="h-5 w-5 text-cyan-700" />
											キーワード
										</CardTitle>
									</CardHeader>
									<CardContent>
										{keywords.length > 0 ? (
											<div className="flex flex-wrap gap-2">
												{keywords.map((keyword) => (
													<Badge
														key={keyword}
														variant="secondary"
														className="bg-cyan-100/70 text-cyan-800"
													>
														{keyword}
													</Badge>
												))}
											</div>
										) : (
											<p className="text-sm text-slate-500">
												キーワード情報がありません。
											</p>
										)}
									</CardContent>
								</Card>
							</div>

							<Card className="border-slate-200 bg-white/95">
								<CardHeader className="pb-3">
									<CardTitle className="flex items-center gap-2 text-lg text-slate-900">
										<Target className="h-5 w-5 text-cyan-700" />
										授業科目の学習・教育目標
									</CardTitle>
									<CardDescription className="text-slate-600">
										学習時に意識する到達目標を確認できます。
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
										<p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
											{syllabusInfo.subject_goals}
										</p>
									</div>
								</CardContent>
							</Card>
						</div>
					)}
				</main>
			</div>
		</>
	);
}

export default SyllabusPage;
