import React, { useEffect } from "react";
import { userData } from "../../state/auth";
import { useSetRecoilState } from "recoil";
import { logout } from "../../core/api";
import Loading from "../../components/style/Loading";

export const Logout: React.FC = () => {
    const setUserState = useSetRecoilState(userData);

    useEffect(() => {
        logout().then((res) => {
            setUserState(null);
            window.location.assign("/login");
        });
    }, [setUserState]);

    return <Loading />;
};

export default Logout;
