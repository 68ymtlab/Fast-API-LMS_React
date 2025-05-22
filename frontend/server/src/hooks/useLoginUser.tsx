import { useContext } from "react";

import { LoginUserContext, type LoginUserContextType } from "../providers/LoginUserProvider";

export const useLoginUser = (): LoginUserContextType => useContext(LoginUserContext);
