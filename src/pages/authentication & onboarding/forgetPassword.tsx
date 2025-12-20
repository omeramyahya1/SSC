import { Link } from "react-router-dom";
import { useEffect } from "react";
import { useUserStore } from "@/store/useUserStore";
import { useApplicationSettingsStore } from "@/store/useApplicationSettingsStore";


export default function ForgotPassword() {
    const { currentUser, isLoading: isUserLoading, fetchUser } = useUserStore();
    const { currentSetting, isLoading: areSettingsLoading, fetchSetting } = useApplicationSettingsStore()
    
    useEffect(() => {
        fetchUser(1);
        fetchSetting(1);

    }, [fetchUser, fetchSetting])

    return (
        <div>
            <h1>
                Forgot Passowrd
            </h1>
            <div>
                {isUserLoading || areSettingsLoading ? (
                    //show a spinner or a progress animation
                    <p>Fethcing Data...</p>
                ) : (
                    <>
                    <div>{JSON.stringify(currentUser, null, 2)}</div>
                    <div>{JSON.stringify(currentSetting, null, 2)}</div>
                    </>
                )}
            </div>
            <button 
                onClick={() => fetchUser(1)}
                className="mt-4 btn-primary"
            >
                Refresh Data
            </button>
            <Link to={"/"}>Login</Link>
            <Link to={"/customers"}>customers</Link>
        </div>
    )
}