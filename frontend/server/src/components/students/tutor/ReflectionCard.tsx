"use client";

// 振り返りカード（深い版）。tutor の /session/reflect が返す構造化 JSON を描画する。
// Markdown に頼らない（このプロジェクトは Tailwind Typography を使っていないので箇条書きが潰れる）。
import {
	BookOpen,
	CheckCircle2,
	Compass,
	ListTodo,
	Sparkles,
	TriangleAlert,
} from "lucide-react";
import { MathJax } from "@/components/shared/MathJax";

export type Reflection = {
	did: string[];
	understood: string[];
	stuck: string[];
	next: { topic: string; why: string; how: string }[];
	message: string;
};

function Section({
	icon,
	title,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-1.5">
			<h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
				{icon}
				{title}
			</h4>
			{children}
		</section>
	);
}

function Bullets({ items }: { items: string[] }) {
	if (!items?.length) return null;
	return (
		<ul className="space-y-1 pl-4 text-sm">
			{items.map((x) => (
				<li key={x} className="list-disc marker:text-muted-foreground">
					<MathJax text={x} />
				</li>
			))}
		</ul>
	);
}

export function ReflectionCard({
	r,
	level,
	goal,
}: {
	r: Reflection;
	level?: string;
	goal?: string;
}) {
	return (
		<div className="rounded-xl border bg-muted/30 px-4 py-3">
			<div className="mb-3 flex items-center gap-2">
				<Sparkles className="h-4 w-4" />
				<span className="text-sm font-semibold">振り返り</span>
				{level ? (
					<span className="ml-auto text-[11px] text-muted-foreground">
						理解度: {level}
						{goal ? ` / 目的: ${goal}` : ""}
					</span>
				) : null}
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				<Section
					icon={<BookOpen className="h-3.5 w-3.5" />}
					title="今日やったこと"
				>
					<Bullets items={r.did} />
				</Section>
				<Section
					icon={<CheckCircle2 className="h-3.5 w-3.5" />}
					title="できていること"
				>
					<Bullets
						items={
							r.understood?.length
								? r.understood
								: ["（まだ判断できる材料がありません）"]
						}
					/>
				</Section>
				<Section
					icon={<TriangleAlert className="h-3.5 w-3.5" />}
					title="つまずいたところ"
				>
					<Bullets
						items={
							r.stuck?.length ? r.stuck : ["今回は目立ったつまずきはありません"]
						}
					/>
				</Section>
				<Section
					icon={<Compass className="h-3.5 w-3.5" />}
					title="次に勉強するとよいこと"
				>
					<ol className="space-y-2 text-sm">
						{r.next.map((n, i) => (
							<li
								key={n.topic}
								className="rounded-lg border bg-background px-3 py-2"
							>
								<div className="flex items-start gap-2">
									<span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
										{i + 1}
									</span>
									<div className="min-w-0">
										<div className="font-medium">
											<MathJax text={n.topic} />
										</div>
										<div className="text-xs text-muted-foreground">
											<MathJax text={n.why} />
										</div>
										{n.how ? (
											<div className="mt-1 flex items-start gap-1 text-xs">
												<ListTodo className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
												<MathJax text={n.how} />
											</div>
										) : null}
									</div>
								</div>
							</li>
						))}
					</ol>
				</Section>
			</div>
			{r.message ? (
				<p className="mt-3 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
					{r.message}
				</p>
			) : null}
		</div>
	);
}
