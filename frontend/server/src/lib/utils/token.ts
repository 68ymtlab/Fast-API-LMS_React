"use server";

import { cookies } from "next/headers";

/**
 * App Router で Cookie から NextAuth のアクセストークンを取得
 */
export async function getAccessToken() {
	const cookieStore = await cookies();

	// NextAuth の cookie 名は環境によって異なる
	const token =
		cookieStore.get("next-auth.session-token")?.value ??
		cookieStore.get("__Secure-next-auth.session-token")?.value ??
		null;

	return token;
}
