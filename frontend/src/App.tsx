import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { YoutubeDashboard } from "./pages/YoutubeDashboard";
import { InstagramDashboard } from "./pages/InstagramDashboard";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/youtube/:channelId" element={<YoutubeDashboard />} />
        <Route path="/instagram/:accountId" element={<InstagramDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
