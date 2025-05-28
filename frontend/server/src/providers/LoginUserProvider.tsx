import {
	type Dispatch,
	type SetStateAction,
	createContext,
	useEffect,
	useState,
} from "react";
import { useCookies } from "react-cookie";
import axios from "../lib/axios";

import type { User } from "../types/api/auth/user";

export type LoginUserContextType = {
	loginUser: User | null;
	setLoginUser: Dispatch<SetStateAction<User | null>>;
	isLoadingUser: boolean;
	// isAuthenticated: boolean; 認証状況フラグ
};

export const LoginUserContext = createContext<LoginUserContextType>(
	{} as LoginUserContextType,
);

export const LoginUserProvider = (props: { children: React.ReactNode }) => {
	const { children } = props;
	const [loginUser, setLoginUser] = useState<User | null>(null);
	const [isLoadingUser, setIsLoadingUser] = useState(true);
	const [cookies] = useCookies(["token"]);

	useEffect(() => {
		const fetchUser = async () => {
			if (cookies.token && !loginUser) {
				setIsLoadingUser(true);
				await axios
					.get("/home_profile")
					.then((res) => {
						if (res.status === 200) {
							setLoginUser(res.data);
						}
					})
					.catch((error) => {
						console.error("Error fetching user data:", error);
					})
					.finally(() => {
						setIsLoadingUser(false);
					});
			} else {
				setIsLoadingUser(false);
			}
		};

		fetchUser();
	}, [cookies.token, loginUser]);

	return (
		<LoginUserContext value={{ loginUser, setLoginUser, isLoadingUser }}>
			{children}
		</LoginUserContext>
	);
};
