import { Link } from "react-router-dom";
import { useEffect } from "react";
import { useUserStore } from "@/store/useUserStore";


export default function ForgotPassword() {
    const { userData, isLoading, fetchUser } = useUserStore();
    
    useEffect(() => {
        fetchUser(1);
    }, [fetchUser])

    return (
        <div>
            <h1>
                Forgot Passowrd
            </h1>
            <div>
                {isLoading ? (
                    //show a spinner or a progress animation
                    <p>Fethcing Data...</p>
                ) : (
                    <div>{JSON.stringify(userData, null, 2)}</div>
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