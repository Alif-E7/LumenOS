import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home, Rocket } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-Level & Per-Route Resilient Error Boundary.
 * Catches any unhandled render or lifecycle exception, prevents blank-screen unmounting,
 * and surfaces an instant orbital telemetry recovery deck.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("LumenOS Flight Deck caught unhandled render exception:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleResetToPlay = () => {
    try {
      localStorage.removeItem("lumenos_mission_session");
    } catch {
      /* ignore */
    }
    window.location.href = "/play";
  };

  private handleGoMissions = () => {
    window.location.href = "/missions";
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || "Unexpected telemetry synchronization failure.";

      return (
        <div className="min-h-screen bg-void flex items-center justify-center p-4 select-none font-sans">
          <div className="w-full max-w-lg rounded-2xl border border-rose-500/40 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-6 sm:p-8 shadow-2xl text-center">
            {/* Pulsing Status Glyph */}
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-500/40 bg-rose-500/10 text-rose-400 shadow-[0_0_24px_rgba(244,63,94,0.3)]">
              <AlertTriangle className="h-8 w-8 animate-pulse" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-rose-500/30 bg-rose-500/10 text-[10px] font-mono uppercase tracking-[0.2em] text-rose-300 mb-3">
              Telemetry Link Interrupted
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-ink tracking-tight mb-2">
              {this.props.fallbackTitle || "Orbital Flight Deck Telemetry Fault"}
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-4">
              An unhandled rendering event occurred. The flight systems fail-safe prevented bus loss.
              You can instantly reset orbital telemetry or restart your sortie.
            </p>

            {/* Error Diagnostics Chip */}
            <div className="mb-6 rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-left">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                Diagnostic Output
              </div>
              <div className="font-mono text-xs text-rose-300/90 break-all overflow-hidden line-clamp-3">
                {errorMessage}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleRetry}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-cyan-500/50 bg-cyan-950/60 hover:bg-cyan-900/70 text-cyan-200 text-xs font-mono font-bold transition-all shadow-lg shadow-cyan-500/10 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Re-sync Telemetry
              </button>

              <button
                type="button"
                onClick={this.handleResetToPlay}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/50 bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 text-xs font-mono font-bold transition-all shadow-lg shadow-emerald-500/10 cursor-pointer"
              >
                <Rocket className="h-3.5 w-3.5" /> Restart 3D Flight
              </button>

              <button
                type="button"
                onClick={this.handleGoMissions}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-xs font-mono font-bold transition-all cursor-pointer"
              >
                <Home className="h-3.5 w-3.5" /> Campaign
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
