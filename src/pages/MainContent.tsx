import { Sidebar } from "./dashboard/Sidebar";
import { InternetAlert } from "./dashboard/InternetAlert";
import { Outlet } from "react-router-dom";
import { Toaster } from "react-hot-toast";

const MainContent = () => {
  return (
    <div className="flex h-screen w-full font-sans">
      <Toaster />
      <InternetAlert />
      <Sidebar />
      <Outlet />
    </div>
  )
}

export default MainContent;
