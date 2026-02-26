import { Sidebar } from "./dashboard/Sidebar";
import { InternetAlert } from "./dashboard/InternetAlert";
import { Outlet } from "react-router-dom";

const MainContent = () => {
  return (
    <div className="flex h-screen w-full font-sans">
      <InternetAlert />
      <Sidebar />
      <Outlet />
    </div>
  )
}

export default MainContent;
