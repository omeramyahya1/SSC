import { useNavigate } from "react-router-dom";
import { useAuthenticationStore } from "@/store/useAuthenticationStore";
import { useUserStore } from "@/store/useUserStore";

const Dashboard = () => {
    const navigate = useNavigate();
    const { currentUser, setCurrentUser } = useUserStore();
    const { currentAuthentication, setCurrentAuthentication, updateAuthentication } = useAuthenticationStore();

    const handleLogout = async () => {
        if (currentAuthentication && currentAuthentication.auth_id) {
            try {
                // Update the backend to set is_logged_in to false
                await updateAuthentication(currentAuthentication.auth_id, { is_logged_in: false });
                
                // Clear local state
                setCurrentUser(null);
                setCurrentAuthentication(null);

                // Navigate to login page
                navigate("/");
            } catch (error) {
                console.error("Logout failed:", error);
                // Optionally, show an error message to the user
            }
        } else {
            // If there's no current authentication, just navigate to login
            navigate("/");
        }
    };

  return (
    <div className="flex flex-col">
        <div>Dashboard</div>
        <button
            onClick={handleLogout}
        >
            Logout
        </button>
    </div>
  )
}

export default Dashboard