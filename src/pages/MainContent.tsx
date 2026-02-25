import { Sidebar } from "./dashboard/Sidebar";
import { Dashboard } from "./dashboard/Dashboard";
import { InternetAlert } from "./dashboard/InternetAlert";

const MainContent = () => {
  return (
    <div className="flex h-screen w-full font-sans">
      <InternetAlert />
      <Sidebar />
      <Dashboard />
    </div>
  )
}

export default MainContent;
