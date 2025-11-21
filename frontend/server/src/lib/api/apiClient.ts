import axios from "axios";
import { getSession } from "next-auth/react";
import config from "@/lib/utils/config";

const apiClient = axios.create({
	baseURL: `${config.apiBaseUrl}/api`,
	withCredentials: true,
});

// ✅ リクエスト前に Authorization ヘッダを注入
apiClient.interceptors.request.use(async (cfg) => {
	const session = await getSession();
	const token = session?.accessToken;

	if (token) {
		cfg.headers.Authorization = `Bearer ${token}`;
	}
	return cfg;
});

export default apiClient;
