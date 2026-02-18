import { Sidebar } from "./Sidebar";
import { MainContent } from "./MainContent";
import { InternetAlert } from "./InternetAlert";

const Dashboard = () => {
  return (
    <div className="flex h-screen w-full font-sans">
      <InternetAlert />
      <Sidebar />
      <MainContent />
    </div>
  )
}

export default Dashboard;
