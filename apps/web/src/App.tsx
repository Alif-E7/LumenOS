import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { ModeSelectPage } from "./pages/ModeSelectPage";
import { MissionsPage } from "./pages/MissionsPage";
import { MissionBriefPage } from "./pages/MissionBriefPage";
import { DesignPage } from "./pages/DesignPage";
import { DesignReviewPage } from "./pages/DesignReviewPage";
import { LaunchPage } from "./pages/LaunchPage";
import { OperatePage } from "./pages/OperatePage";
import { ResultsPage } from "./pages/ResultsPage";
import { RewardsPage } from "./pages/RewardsPage";
import { ReplayPage } from "./pages/ReplayPage";
import { DataSourcesPage } from "./pages/DataSourcesPage";
import { HelpPage } from "./pages/HelpPage";
import { SettingsPage } from "./pages/SettingsPage";
import { CoopLobbyPage } from "./pages/CoopLobbyPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Home & Mode Selection */}
        <Route path="/" element={<HomePage />} />
        <Route path="/mode" element={<ModeSelectPage />} />
        <Route path="/mode-select" element={<Navigate to="/mode" replace />} />

        {/* Mission Flow */}
        <Route path="/missions" element={<MissionsPage />} />
        <Route path="/missions/:missionId/brief" element={<MissionBriefPage />} />
        <Route path="/brief" element={<Navigate to="/missions" replace />} />
        <Route path="/design" element={<DesignPage />} />
        <Route path="/review" element={<DesignReviewPage />} />
        <Route path="/launch" element={<LaunchPage />} />
        <Route path="/operate" element={<OperatePage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/replay" element={<ReplayPage />} />

        {/* Co-op Multiplayer */}
        <Route path="/coop" element={<CoopLobbyPage />} />
        <Route path="/coop/create" element={<CoopLobbyPage />} />
        <Route path="/coop/join" element={<CoopLobbyPage />} />
        <Route path="/coop/lobby" element={<CoopLobbyPage />} />

        {/* Career & Knowledge */}
        <Route path="/rewards" element={<RewardsPage />} />
        <Route path="/progression" element={<Navigate to="/rewards" replace />} />
        <Route path="/sources" element={<DataSourcesPage />} />
        <Route path="/data" element={<Navigate to="/sources" replace />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/tutorial" element={<Navigate to="/help" replace />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
