export type User = {
	id: string;
	username: string;
	display_name: string;
	email: string;
	role_id: number;
	is_active: boolean;
	theme_settings: ThemeSettings;
	created_at: string;
	updated_at: string;
	role: Role;
};

export type ThemeSettings = {
	mode: "light" | "dark" | "system";
	theme: string;
	fontSize: "small" | "medium" | "large";
};

export type Role = {
	id: number;
	name: string;
	description: string;
};

export type LoginResponse = {
	user: User;
	access_token: string;
	refresh_token: string;
};
