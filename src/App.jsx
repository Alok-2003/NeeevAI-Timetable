import { useState } from "react";
import Tab from "./components/Tab";
import SetupPage from "./pages/SetupPage";
import GeneratePage from "./pages/GeneratePage";
import TimetablesPage from "./pages/TimetablesPage";
import "./App.css";

function App() {
  const TABS = ["Setup", "Generate", "Timetables"];
  const [activeTab, setActiveTab] = useState("Setup");

  const renderPage = () => {
    switch (activeTab) {
      case "Setup":
        return <SetupPage />;
      case "Generate":
        return <GeneratePage />;
      case "Timetables":
        return <TimetablesPage />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Top Nav */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-primary">
            NeeevAI <span className="text-black">Timetable Generator</span>
          </h1>
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-2">
          <nav className="flex gap-1 border-b border-gray-200">
            {TABS.map((label) => (
              <Tab
                key={label}
                label={label}
                active={activeTab === label}
                onClick={() => setActiveTab(label)}
              />
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">{renderPage()}</main>
    </div>
  );
}

export default App;
