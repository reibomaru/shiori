import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import { TripProvider } from "./store";
import Layout from "./components/Layout";
import ItineraryPage from "./pages/ItineraryPage";
import BudgetPage from "./pages/BudgetPage";
import SpotsPage from "./pages/SpotsPage";
import MemoPage from "./pages/MemoPage";

// 地図(deck.gl)は重いので必要時のみ遅延ロード
const MapPage = lazy(() => import("./pages/MapPage"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <TripProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/itinerary" replace />} />
            <Route
              path="/map"
              element={
                <Suspense fallback={<div className="p-10 text-center text-slate-400">地図を読み込み中…</div>}>
                  <MapPage />
                </Suspense>
              }
            />
            <Route path="/itinerary" element={<ItineraryPage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/spots" element={<SpotsPage />} />
            <Route path="/memo" element={<MemoPage />} />
            <Route path="*" element={<Navigate to="/itinerary" replace />} />
          </Route>
        </Routes>
      </TripProvider>
    </BrowserRouter>
  </StrictMode>
);
