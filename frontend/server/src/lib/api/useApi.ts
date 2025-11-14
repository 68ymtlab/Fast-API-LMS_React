import apiClient from "@/lib/api/apiClient";

/**
 * Next.js App Routerで使える共通APIフック
 * 自動で /api/proxy 経由にルーティングする
 */
export const useApi = () => {
	const get = async (path: string, params?: object) => {
		return apiClient.get(`${path}`, { params });
	};

	const post = async (path: string, data?: object) => {
		return apiClient.post(`${path}`, data);
	};

	const put = async (path: string, data?: object) => {
		return apiClient.put(`${path}`, data);
	};

	const patch = async (path: string, data?: object) => {
		return apiClient.patch(`${path}`, data);
	};

	const del = async (path: string) => {
		return apiClient.delete(`${path}`);
	};

	return { get, post, put, patch, del };
};
