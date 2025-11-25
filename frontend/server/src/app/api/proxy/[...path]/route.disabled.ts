import axios, { type AxiosError } from "axios";
import type { NextRequest } from "next/server";
import config from "@/lib/utils/config";

/**
 * FastAPI に中継する共通関数
 */
async function handleProxy(req: NextRequest, path: string[], method: string) {
	// ✅ path 内の "api" や "proxy" を削除
	const normalizedPath = path.filter(
		(segment) => segment !== "api" && segment !== "proxy",
	);

	// ✅ FastAPI の最終URLを構築（重複しない）
	const targetUrl = `${process.env.INTERNAL_API_BASE_URL}/api/${normalizedPath.join("/")}`;

	try {
		const body =
			method !== "GET" && method !== "DELETE" ? await req.json() : undefined;

		const response = await axios.request({
			url: targetUrl,
			method,
			data: body,
			headers: {
				Cookie: req.headers.get("cookie") ?? "",
				Authorization: req.headers.get("authorization") ?? "",
			},
			withCredentials: true,
		});

		return new Response(JSON.stringify(response.data), {
			status: response.status,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		const error = err as AxiosError<{ detail?: string }>;
		const status = error.response?.status ?? 500;
		const message =
			error.response?.data?.detail ?? error.message ?? "Unknown error";

		console.error(`Proxy Error [${method} ${targetUrl}]:`, message);

		return new Response(
			JSON.stringify({
				success: false,
				error: "FastAPIへの通信に失敗しました。",
				detail: message,
			}),
			{ status, headers: { "Content-Type": "application/json" } },
		);
	}
}

// ✅ Next.js 15 App Router 用に await params
export async function GET(
	req: NextRequest,
	context: { params: Promise<{ path: string[] }> },
) {
	const { path } = await context.params;
	return handleProxy(req, path, "GET");
}
export async function POST(
	req: NextRequest,
	context: { params: Promise<{ path: string[] }> },
) {
	const { path } = await context.params;
	return handleProxy(req, path, "POST");
}
export async function PUT(
	req: NextRequest,
	context: { params: Promise<{ path: string[] }> },
) {
	const { path } = await context.params;
	return handleProxy(req, path, "PUT");
}
export async function PATCH(
	req: NextRequest,
	context: { params: Promise<{ path: string[] }> },
) {
	const { path } = await context.params;
	return handleProxy(req, path, "PATCH");
}
export async function DELETE(
	req: NextRequest,
	context: { params: Promise<{ path: string[] }> },
) {
	const { path } = await context.params;
	return handleProxy(req, path, "DELETE");
}
