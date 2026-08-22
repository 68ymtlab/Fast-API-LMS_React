import Link from "next/link";
import type { CSSProperties } from "react";
import {
	ArrowLeft,
	BookOpen,
	CircleHelp,
	MessageSquare,
	Sparkles,
	Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

const helpThemeVars = {
	"--help-bg-top": "#f4fbff",
	"--help-bg-bottom": "#fff6f8",
	"--help-card": "#ffffffde",
	"--help-main": "#b6e8ff",
	"--help-sub": "#f8bfd2",
	"--help-accent": "#ffe7a8",
} as CSSProperties;

const releasePlans = [
	{
		icon: CircleHelp,
		title: "よくある質問",
		description: "授業の進め方や課題提出の流れを、短いQ&Aで確認できるようにします。",
	},
	{
		icon: BookOpen,
		title: "使い方ガイド",
		description: "初回ログインから学習再開までを、画像つきでわかりやすく案内します。",
	},
	{
		icon: MessageSquare,
		title: "お問い合わせ窓口",
		description: "困ったときにすぐ質問できるサポート導線を準備しています。",
	},
] as const;

export default function StudentHelpPage() {
	return (
		<main
			className="min-h-screen bg-slate-100 px-4 pb-12 pt-4 sm:px-6 lg:px-8"
			style={helpThemeVars}
		>
			<section className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-white/70 bg-[linear-gradient(155deg,var(--help-bg-top),var(--help-bg-bottom))] p-5 shadow-[0_20px_80px_-42px_rgba(15,23,42,0.55)] sm:p-8">
				<div
					aria-hidden
					className="pointer-events-none absolute -left-16 -top-20 h-52 w-52 rounded-full bg-cyan-200/55 blur-3xl"
				/>
				<div
					aria-hidden
					className="pointer-events-none absolute -right-10 bottom-0 h-48 w-48 rounded-full bg-rose-200/55 blur-3xl"
				/>

				<div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
					<div className="space-y-4">
						<Badge className="rounded-full bg-white/90 px-3 py-1 text-sky-700 shadow-sm">
							ヘルプセンター
						</Badge>
						<div className="space-y-3">
							<h1
								className="text-2xl font-bold leading-tight text-slate-800 sm:text-3xl"
								style={{
									fontFamily:
										"'Hiragino Maru Gothic ProN', 'YuKyokasho Yoko', 'Meiryo', sans-serif",
								}}
							>
								ただいまヘルプページを準備中です
							</h1>
							<p className="text-sm leading-relaxed text-slate-600 sm:text-base">
								学生のみなさんが迷わず使えるように、案内をていねいに整えています。もう少しだけお待ちください。
							</p>
						</div>

						<div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
							<Wrench className="h-3.5 w-3.5 text-amber-500" />
							更新情報はこのページでお知らせします
						</div>

						<Card className="border-white/70 bg-[var(--help-card)] shadow-md backdrop-blur-sm">
							<CardHeader className="space-y-1 pb-3">
								<CardTitle className="text-base text-slate-800">
									公開予定のサポート
								</CardTitle>
								<CardDescription className="text-xs text-slate-500 sm:text-sm">
									使いやすさを優先して、段階的に公開します。
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3 pt-0">
								{releasePlans.map((plan) => {
									const Icon = plan.icon;

									return (
										<div
											key={plan.title}
											className="rounded-xl border border-slate-200/80 bg-white/85 p-3"
										>
											<p className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
												<Icon className="h-4 w-4 text-sky-700" />
												{plan.title}
											</p>
											<p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
												{plan.description}
											</p>
										</div>
									);
								})}
							</CardContent>
						</Card>

						<Button asChild className="h-10 bg-blue-700 text-white hover:bg-blue-800">
							<Link href="/home">
								<ArrowLeft className="h-4 w-4" />
								ホームへ戻る
							</Link>
						</Button>
					</div>

					<Card className="border-white/70 bg-[var(--help-card)] shadow-md backdrop-blur-sm">
						<CardContent className="p-5 sm:p-6">
							<div className="relative mx-auto h-56 w-52 sm:h-60 sm:w-56">
								<div
									aria-hidden
									className="absolute inset-x-9 bottom-0 h-6 rounded-full bg-slate-300/50 blur-md"
								/>
								<div
									className="absolute inset-x-4 bottom-4 top-7 overflow-hidden rounded-[42%] border-2 border-white/80 bg-[linear-gradient(170deg,var(--help-main),var(--help-sub))] shadow-[0_16px_30px_-16px_rgba(15,23,42,0.5)]"
									style={{ animation: "studentHelpFloat 3.4s ease-in-out infinite" }}
								>
									<div
										aria-hidden
										className="absolute left-1/2 top-3 h-9 w-9 -translate-x-1/2 rounded-full border-2 border-white/80 bg-[var(--help-accent)]"
										style={{ animation: "studentHelpNod 2.8s ease-in-out infinite" }}
									/>
									<div
										aria-hidden
										className="absolute left-[30%] top-[45%] h-2.5 w-2.5 rounded-full bg-slate-700"
										style={{ animation: "studentHelpBlink 4.4s infinite" }}
									/>
									<div
										aria-hidden
										className="absolute right-[30%] top-[45%] h-2.5 w-2.5 rounded-full bg-slate-700"
										style={{ animation: "studentHelpBlink 4.4s 0.2s infinite" }}
									/>
									<div
										aria-hidden
										className="absolute left-1/2 top-[56%] h-4 w-10 -translate-x-1/2 rounded-full border-b-4 border-slate-700"
									/>
									<div
										aria-hidden
										className="absolute left-[22%] top-[57%] h-3 w-3 rounded-full bg-rose-200/80"
									/>
									<div
										aria-hidden
										className="absolute right-[22%] top-[57%] h-3 w-3 rounded-full bg-rose-200/80"
									/>
									<div
										aria-hidden
										className="absolute -left-4 top-[52%] h-12 w-7 rounded-full border-2 border-white/80 bg-sky-200/85"
										style={{ transform: "rotate(-18deg)" }}
									/>
									<div
										aria-hidden
										className="absolute -right-4 top-[52%] h-12 w-7 rounded-full border-2 border-white/80 bg-rose-200/85"
										style={{ transform: "rotate(18deg)" }}
									/>
								</div>

								<Sparkles
									aria-hidden
									className="absolute right-2 top-2 h-6 w-6 text-amber-400"
									style={{ animation: "studentHelpTwinkle 2.8s ease-in-out infinite" }}
								/>
								<Sparkles
									aria-hidden
									className="absolute left-1 top-20 h-4 w-4 text-cyan-500"
									style={{ animation: "studentHelpTwinkle 2.8s 0.6s ease-in-out infinite" }}
								/>
							</div>
							<p className="text-center text-sm font-semibold text-slate-700">
								サポートロボ「ヘルミー」が公開準備中です
							</p>
							<p className="mt-1 text-center text-xs leading-relaxed text-slate-600 sm:text-sm">
								困ったときにすぐ頼れるページになるように、ていねいに組み立てています。
							</p>
						</CardContent>
					</Card>
				</div>
			</section>
		</main>
	);
}
