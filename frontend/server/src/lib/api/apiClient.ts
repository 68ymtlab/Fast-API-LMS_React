import axios from "axios";
import config from "@/lib/utils/config";
import { getAccessToken } from "@/lib/utils/token";

const apiClient = axios.create({
	baseURL: `${config.apiBaseUrl}/api`,
	withCredentials: true,
});

// ✅ リクエスト前に Authorization ヘッダを注入
apiClient.interceptors.request.use(async (cfg) => {
	const token = await getAccessToken();
	if (token) {
		cfg.headers.Authorization = `Bearer ${token}`;
	}
	return cfg;
});

export default apiClient;
