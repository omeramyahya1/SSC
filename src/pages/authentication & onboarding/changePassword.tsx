import { Link } from "@radix-ui/react-navigation-menu"
import { useNavigate } from "react-router-dom";
import { useUserStore } from "@/store/useUserStore";
import { useAuthenticationStore } from "@/store/useAuthenticationStore";


const ChangePassword = () => {
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
        <div>Change Your Password</div>
        <button
            onClick={() => {
                navigate("/")
            }}
        >
            Submit
        </button>
    </div>
  )
}

export default ChangePassword