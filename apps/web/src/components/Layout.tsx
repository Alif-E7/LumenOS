import { Outlet, NavLink } from "react-router-dom";
import { useState } from "react";

export function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors ${
      isActive
        ? "bg-blue-600 text-white shadow-sm"
        : "text-slate-300 hover:bg-slate-800 hover:text-white"
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-50">
      {/* Navigation */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <NavLink to="/" className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-lg shadow-md shadow-blue-500/20">
                🛰️
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight text-white block leading-none">
                  LumenOS
                </span>
                <span className="text-[10px] text-blue-400 font-mono tracking-wider">
                  MISSION ARCHITECT
                </span>
              </div>
            </NavLink>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              <NavLink to="/" className={linkClass} end>
                Home
              </NavLink>
              <NavLink to="/mode" className={linkClass}>
                Mode Select
              </NavLink>
              <NavLink to="/missions" className={linkClass}>
                Campaign
              </NavLink>
              <NavLink to="/design" className={linkClass}>
                Designer
              </NavLink>
              <NavLink to="/operate" className={linkClass}>
                Control
              </NavLink>
              <NavLink to="/benchmark" className={linkClass}>
                Benchmark
              </NavLink>
              <NavLink to="/rewards" className={linkClass}>
                Rewards
              </NavLink>
              <NavLink to="/sources" className={linkClass}>
                Sources
              </NavLink>
              <NavLink to="/help" className={linkClass}>
                Academy
              </NavLink>
              <NavLink to="/settings" className={linkClass}>
                Settings
              </NavLink>
            </nav>

            {/* Mobile menu toggle */}
            <div className="flex items-center gap-2 lg:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? "✕" : "☰"}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-800 bg-slate-950 p-4 space-y-1">
            <NavLink to="/" className={linkClass} end onClick={() => setMobileMenuOpen(false)}>
              Home
            </NavLink>
            <NavLink to="/mode" className={linkClass} onClick={() => setMobileMenuOpen(false)}>
              Mode Select
            </NavLink>
            <NavLink to="/missions" className={linkClass} onClick={() => setMobileMenuOpen(false)}>
              Mission Campaign
            </NavLink>
            <NavLink to="/design" className={linkClass} onClick={() => setMobileMenuOpen(false)}>
              Spacecraft Designer
            </NavLink>
            <NavLink to="/operate" className={linkClass} onClick={() => setMobileMenuOpen(false)}>
              Mission Control
            </NavLink>
            <NavLink to="/benchmark" className={linkClass} onClick={() => setMobileMenuOpen(false)}>
              Benchmark Harness
            </NavLink>
            <NavLink to="/rewards" className={linkClass} onClick={() => setMobileMenuOpen(false)}>
              Rewards & Progression
            </NavLink>
            <NavLink to="/sources" className={linkClass} onClick={() => setMobileMenuOpen(false)}>
              Data & Sources
            </NavLink>
            <NavLink to="/help" className={linkClass} onClick={() => setMobileMenuOpen(false)}>
              Flight Academy
            </NavLink>
            <NavLink to="/settings" className={linkClass} onClick={() => setMobileMenuOpen(false)}>
              Settings
            </NavLink>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-slate-500 text-sm bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs">
            LumenOS v0.1.0 — Educational Space Mission Strategy & Simulation
          </p>
          <p className="text-xs">
            Telemetry is <span className="text-cyan-400 font-mono font-medium">[SIMULATED]</span> via J₂ orbital propagation & thermal equilibrium.
          </p>
          <div className="flex gap-4 text-xs text-slate-400">
            <NavLink to="/sources" className="hover:text-white">Scientific Data</NavLink>
            <NavLink to="/help" className="hover:text-white">Academy</NavLink>
            <NavLink to="/settings" className="hover:text-white">Settings</NavLink>
          </div>
        </div>
      </footer>
    </div>
  );
}
