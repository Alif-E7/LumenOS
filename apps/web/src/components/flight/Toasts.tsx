export interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error" | "info";
}

const TOAST_STYLES = {
  ok: "border-emerald-400/50 text-emerald-100 bg-emerald-950/90",
  error: "border-red-400/50 text-red-100 bg-red-950/90",
  info: "border-sky-400/50 text-sky-100 bg-sky-950/90",
} as const;

/**
 * Transient action feedback ("📸 Photo taken!", "Not enough coins!").
 * Auto-dismisses after ~2.5 s; fixed near the top-center of the flight HUD.
 */
export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`px-4 py-2 rounded-full border backdrop-blur-md text-sm font-semibold shadow-lg ${
            TOAST_STYLES[t.kind]
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
