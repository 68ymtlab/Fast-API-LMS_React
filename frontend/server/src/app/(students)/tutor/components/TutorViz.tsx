"use client";

// VizSpec（tutor_viz.py が返す型付き図スペック）を SVG で描く。
// 移植元: agents/workspace/rag/project/tutor-web/app/tutor_web.html renderViz()
import { type FC, useId } from "react";

export type VizVector = {
	x: number;
	y: number;
	label?: string;
	color?: string;
};
export type VizSpec = {
	kind: "vector2d" | "inner_product" | "matrix_transform2d" | string;
	params?: {
		vectors?: VizVector[];
		a?: VizVector;
		b?: VizVector;
		matrix?: number[][];
		show_axes?: boolean;
	};
	caption?: string;
};

const OX = 140;
const OY = 120;

const Arrow: FC<{
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	color: string;
	label?: string;
	markerId: string;
}> = ({ x0, y0, x1, y1, color, label, markerId }) => (
	<g>
		<line
			x1={x0}
			y1={y0}
			x2={x1}
			y2={y1}
			stroke={color}
			strokeWidth={2.5}
			markerEnd={`url(#${markerId})`}
		/>
		{label ? (
			<text x={x1 + 8} y={y1 - 6} fill="currentColor" fontSize={12}>
				{label}
			</text>
		) : null}
	</g>
);

export const TutorViz: FC<{ viz: VizSpec | null | undefined }> = ({ viz }) => {
	const markerId = useId();
	if (!viz || !viz.kind) return null;
	const p = viz.params ?? {};
	let body: React.ReactNode = null;

	if (viz.kind === "vector2d") {
		const vecs = p.vectors ?? [{ x: 100, y: -60, label: "v" }];
		body = vecs.map((v, i) => (
			<Arrow
				key={`${v.label ?? "v"}-${i}`}
				x0={OX}
				y0={OY}
				x1={OX + v.x * 0.7}
				y1={OY + v.y * 0.7}
				color={v.color ?? "#4f8cff"}
				label={v.label}
				markerId={markerId}
			/>
		));
	} else if (viz.kind === "inner_product") {
		const a = p.a ?? { x: 120, y: -40, label: "a" };
		const b = p.b ?? { x: 80, y: -90, label: "b" };
		const s = 0.6;
		const ax = a.x * s;
		const ay = a.y * s;
		const bx = b.x * s;
		const by = b.y * s;
		const dot = (ax * bx + ay * by) / Math.max(ax * ax + ay * ay, 1e-6);
		const px = ax * dot;
		const py = ay * dot;
		body = (
			<>
				<Arrow
					x0={OX}
					y0={OY}
					x1={OX + ax}
					y1={OY + ay}
					color="#4f8cff"
					label={a.label}
					markerId={markerId}
				/>
				<Arrow
					x0={OX}
					y0={OY}
					x1={OX + bx}
					y1={OY + by}
					color="#3ecf8e"
					label={b.label}
					markerId={markerId}
				/>
				<line
					x1={OX + bx}
					y1={OY + by}
					x2={OX + px}
					y2={OY + py}
					stroke="#e6a23c"
					strokeWidth={1.5}
					strokeDasharray="4 3"
				/>
			</>
		);
	} else if (viz.kind === "matrix_transform2d") {
		const m = p.matrix ?? [
			[1.2, 0.3],
			[0.2, 0.9],
		];
		const s = 40;
		const corners: [number, number][] = [
			[0, 0],
			[s, 0],
			[s, -s],
			[0, -s],
		];
		const before = corners
			.map(([x, y]) => `${OX - 50 + x},${OY + y}`)
			.join(" ");
		const after = corners
			.map(([x, y]) => {
				const nx = m[0][0] * x + m[0][1] * y;
				const ny = m[1][0] * x + m[1][1] * y;
				return `${OX + 40 + nx},${OY + ny}`;
			})
			.join(" ");
		body = (
			<>
				<polygon
					points={before}
					fill="none"
					stroke="#9aa8bc"
					strokeWidth={1.5}
					strokeDasharray="4 3"
				/>
				<polygon
					points={after}
					fill="none"
					stroke="#4f8cff"
					strokeWidth={1.5}
				/>
			</>
		);
	} else {
		return null;
	}

	return (
		<div className="mt-3 rounded-md border bg-muted/30 p-2 text-muted-foreground">
			<svg
				viewBox="0 0 280 200"
				width="280"
				height="200"
				className="block h-auto w-full max-w-[360px]"
				role="img"
				aria-label={viz.caption ?? "図"}
			>
				<title>{viz.caption ?? "図"}</title>
				<defs>
					<marker
						id={markerId}
						markerWidth={8}
						markerHeight={8}
						refX={6}
						refY={3}
						orient="auto"
					>
						<path d="M0,0 L6,3 L0,6 Z" fill="#9aa8bc" />
					</marker>
				</defs>
				<line
					x1={20}
					y1={OY}
					x2={260}
					y2={OY}
					stroke="#9aa8bc"
					strokeOpacity={0.4}
					strokeWidth={1}
				/>
				<line
					x1={OX}
					y1={20}
					x2={OX}
					y2={180}
					stroke="#9aa8bc"
					strokeOpacity={0.4}
					strokeWidth={1}
				/>
				{body}
			</svg>
			{viz.caption ? <p className="mt-1 text-xs">{viz.caption}</p> : null}
		</div>
	);
};
