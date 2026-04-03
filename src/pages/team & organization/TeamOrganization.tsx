import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useUserStore } from "@/store/useUserStore";

export default function TeamOrganization() {
  const { currentUser, fetchUsers } = useUserStore();

  if (currentUser?.role !== "admin") {
    return <Navigate to="/home/dashboard" replace />;
  }

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Team & Organization Page</h1>
      <p>This is where team and organization management will be.</p>
    </div>
  );
}
