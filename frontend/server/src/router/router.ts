// kind_nameに基づいて、ログイン後や特定の条件下でリダイレクトさせる先のデフォルトパスの定義
export const roleRedirectMap: { [key: string]: string } = {
  管理者: "/admin/home",
  教師: "/t/home",
  学生: "/home",
  テスト: "/home",
  default: "/home",
};

// kind_nameに基づいて、各ロールのアクセス可能なページの定義
export const pageAccessRules: { [key: string]: string[] } = {
  管理者: ["/admin/home"],
  教師: ["/t/home"],
  学生: ["/home"],
  テスト: ["/home"],
};

// 特定のパスプレフィックスに対して、アクセスを許可するkind_nameのリストを定義
export const protectedRoutesWithRoles: { [pathPrefix: string]: string[] } = {
  "/admin": ["管理者"],
  "/teacher": ["教師", "管理者"],
  "/student": ["テスト", "学生", "教師", "管理者"],
};

// 認証関連のページ
export const authPages: string[] = ["/login"];

// メンテナンスモードが有効になっている場合でも、アクセスを許可する例外的なパス
export const maintenanceExclusionPaths: string[] = ["/login"];
