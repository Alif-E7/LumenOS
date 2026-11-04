import { Outlet, NavLink } from "react-router-dom";

export function Layout() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? "bg-blue-600 text-white"
        : "text-slate-300 hover:bg-slate-800 hover:text-white"
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <NavLink to="/" className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-lg">
                🛰️
              </div>
              <span className="text-xl font-bold text-white">LumenOS</span>
              <span className="hidden sm:inline text-xs text-slate-500 font-mono mt-1">
                Orbital Mission Architect
              </span>
            </NavLink>

            {/* Nav links */}
            <nav className="flex items-center gap-2">
              <NavLink to="/" className={linkClass} end>
                Home
              </NavLink>
              <NavLink to="/missions" className={linkClass}>
                Missions
              </NavLink>
              <NavLink to="/design" className={linkClass}>
                Design
              </NavLink>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-slate-500 text-sm">
        <p>LumenOS v0.1.0 — Educational Space Mission Design Platform</p>
        <p className="text-xs mt-1 text-slate-600">
          All spacecraft telemetry is <span className="text-cyan-500">SIMULATED</span>.
          Reference data sourced from published NASA/IAU values.
        </p>
      </footer>
    </div>
  );
}

