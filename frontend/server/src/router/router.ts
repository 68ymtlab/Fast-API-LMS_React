// kind_nameに基づいて、ログイン後や特定の条件下でリダイレクトさせる先のデフォルトパスの定義
export const roleRedirectMap: { [key: number]: string } = {
  1: "/admin/home",
  2: "/t/home",
  3: "/home",
  4: "/home",
};

// kind_nameに基づいて、各ロールのアクセス可能なページの定義
export const pageAccessRules: { [key: number]: string[] } = {
  1: ["/admin/home"],
  2: ["/t/home"],
  3: ["/home", "/weekflows", "/course"],
  4: ["/home", "/weekflows", "/course"],
};

// 特定のパスプレフィックスに対して、アクセスを許可するkind_nameのリストを定義
export const roleAccessPaths: { [key: number]: string[] } = {
  1: ["/admin", "/t"],
  2: ["/t"],
};

// ログインしていなくてもアクセスできる公開ページ
export const publicPaths: string[] = ["/", "/login"];

// メンテナンスモードが有効になっている場合でも、アクセスを許可する例外的なパス
export const maintenanceExclusionPaths: string[] = ["/login"];
