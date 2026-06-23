import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Layout from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage";
import InsightsPage from "@/pages/InsightsPage";
import HistoryPage from "@/pages/HistoryPage";

function App() {
    return (
        <div className="App">
            <BrowserRouter>
                <Routes>
                    <Route element={<Layout />}>
                        <Route path="/" element={<DashboardPage />} />
                        <Route path="/insights" element={<InsightsPage />} />
                        <Route path="/history" element={<HistoryPage />} />
                    </Route>
                </Routes>
            </BrowserRouter>
            <Toaster
                theme="dark"
                position="bottom-right"
                toastOptions={{
                    style: {
                        background: "#0D1326",
                        border: "1px solid #1E293B",
                        color: "#F8FAFC",
                    },
                }}
            />
        </div>
    );
}

export default App;
