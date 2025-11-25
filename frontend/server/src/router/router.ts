// kind_nameに基づいて、ログイン後や特定の条件下でリダイレクトさせる先のデフォルトパスの定義
export const roleRedirectMap: { [key: string]: string } = {
	admin: "/admin/home",
	teacher: "/t/home",
	student: "/home",
	demo: "/home",
	default: "/home",
};

// kind_nameに基づいて、各ロールのアクセス可能なページの定義
export const pageAccessRules: { [key: string]: string[] } = {
	admin: ["/admin"],
	teacher: ["/t"],
	student: ["/home", "/weekflows", "/course", "/settings"],
	demo: ["/home", "/weekflows", "/course", "/settings"],
};

// 特定のパスプレフィックスに対して、アクセスを許可するkind_nameのリストを定義
export const protectedRoutesWithRoles: { [pathPrefix: string]: string[] } = {
	"/admin": ["admin"],
	"/t": ["teacher"],
	"/teacher": ["teacher", "admin"],
	"/student": ["demo", "student", "teacher", "admin"],
};

// 認証関連のページ
export const authPages: string[] = ["/login"];

// メンテナンスモードが有効になっている場合でも、アクセスを許可する例外的なパス
export const maintenanceExclusionPaths: string[] = ["/login"];
