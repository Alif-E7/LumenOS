/**
 * Modal / Dialog component.
 *
 * Accessible overlay dialog with focus trap and Escape key support.
 * Uses the native <dialog> element for proper accessibility.
 */

import { type ReactNode, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** If true, clicking outside or pressing Escape will not close the modal */
  persistent?: boolean;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  persistent = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && !persistent) {
        e.preventDefault();
        onClose();
      }
    },
    [onClose, persistent]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === dialogRef.current && !persistent) {
        onClose();
      }
    },
    [onClose, persistent]
  );

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "w-full rounded-xl border border-slate-700 bg-slate-900 p-0 text-slate-50 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm",
        sizeClasses[size]
      )}
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      aria-label={title}
    >
      <div className="p-6" onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">{title}</h2>
            {!persistent && (
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close dialog"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}

