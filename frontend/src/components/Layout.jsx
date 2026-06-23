import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, BarChart3, History, Atom } from "lucide-react";

const navItems = [
    { to: "/", label: "Diagnosis", icon: Activity, testid: "nav-dashboard" },
    { to: "/insights", label: "Model Insights", icon: BarChart3, testid: "nav-insights" },
    { to: "/history", label: "History", icon: History, testid: "nav-history" },
];

export default function Layout() {
    const { pathname } = useLocation();
    return (
        <div className="min-h-screen flex flex-col" data-testid="app-shell">
            <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-main)]/80 backdrop-blur-md sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative w-9 h-9 rounded-md bg-gradient-to-br from-violet-600/30 to-teal-500/20 border border-violet-500/40 flex items-center justify-center">
                            <Atom size={18} className="text-violet-300" />
                            <span className="absolute inset-0 rounded-md ring-1 ring-inset ring-white/5" />
                        </div>
                        <div className="leading-tight">
                            <div className="font-heading font-bold text-base tracking-tight text-white">
                                QSVM <span className="text-teal-300">NeuroDx</span>
                            </div>
                            <div className="data-label">Quantum-Classical Hybrid · Brain Tumor MRI</div>
                        </div>
                    </div>

                    <nav className="hidden md:flex items-center gap-1 q-card-elevated p-1 rounded-md" data-testid="primary-nav">
                        {navItems.map(({ to, label, icon: Icon, testid }) => {
                            const active = pathname === to;
                            return (
                                <NavLink
                                    key={to}
                                    to={to}
                                    data-testid={testid}
                                    className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-colors ${
                                        active
                                            ? "bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/30"
                                            : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
                                    }`}
                                >
                                    <Icon size={14} />
                                    {label}
                                </NavLink>
                            );
                        })}
                    </nav>

                    <div className="hidden sm:flex items-center gap-2 data-label">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>QKernel · 8 qubits · v1.4</span>
                    </div>
                </div>

                {/* mobile nav */}
                <div className="md:hidden border-t border-[var(--border-subtle)] flex items-center justify-around py-2">
                    {navItems.map(({ to, label, icon: Icon, testid }) => {
                        const active = pathname === to;
                        return (
                            <NavLink
                                key={to}
                                to={to}
                                data-testid={`${testid}-mobile`}
                                className={`px-3 py-1 text-xs flex flex-col items-center gap-0.5 ${
                                    active ? "text-violet-300" : "text-slate-400"
                                }`}
                            >
                                <Icon size={16} />
                                {label}
                            </NavLink>
                        );
                    })}
                </div>
            </header>

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
                <Outlet />
            </main>

            <footer className="border-t border-[var(--border-subtle)] py-4">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-2 data-label">
                    <span>Research preview · Not for clinical use</span>
                    <span>Quantum Fidelity Kernel · ZZFeatureMap · reps=2</span>
                </div>
            </footer>
        </div>
    );
}
