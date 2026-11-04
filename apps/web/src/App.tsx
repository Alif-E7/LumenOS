import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { MissionsPage } from "./pages/MissionsPage";
import { DesignPage } from "./pages/DesignPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/missions" element={<MissionsPage />} />
        <Route path="/design" element={<DesignPage />} />
      </Route>
    </Routes>
  );
}

