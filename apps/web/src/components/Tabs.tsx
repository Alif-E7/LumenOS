/**
 * Tabs component — accessible tab panel with keyboard navigation.
 */

import { useState, type ReactNode, type KeyboardEvent, useRef } from "react";
import { cn } from "../lib/utils";

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  badge?: string | number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children: ReactNode;
  variant?: "default" | "pills" | "underline";
  className?: string;
}

export function Tabs({
  tabs,
  activeTab,
  onTabChange,
  children,
  variant = "default",
  className,
}: TabsProps) {
  const [internalActive, setInternalActive] = useState(tabs[0]?.id ?? "");
  const active = activeTab ?? internalActive;
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleChange = (id: string) => {
    setInternalActive(id);
    onTabChange?.(id);
  };

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    const enabledTabs = tabs.filter((t) => !t.disabled);
    const currentIdx = enabledTabs.findIndex((t) => t.id === tabs[index]?.id);
    let nextIdx = currentIdx;

    if (e.key === "ArrowRight") nextIdx = (currentIdx + 1) % enabledTabs.length;
    else if (e.key === "ArrowLeft") nextIdx = (currentIdx - 1 + enabledTabs.length) % enabledTabs.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = enabledTabs.length - 1;
    else return;

    e.preventDefault();
    const nextTab = enabledTabs[nextIdx];
    if (nextTab) {
      handleChange(nextTab.id);
      const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      const targetButton = Array.from(buttons ?? []).find(
        (btn) => btn.dataset.tabId === nextTab.id
      );
      targetButton?.focus();
    }
  };

  const tabStyles = {
    default: {
      list: "border-b border-edge",
      tab: "px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors border-b-2 -mb-px",
      active: "border-accent text-accent",
      inactive: "border-transparent text-muted hover:text-ink hover:border-edge-strong",
    },
    pills: {
      list: "bg-panel border border-edge p-1 gap-1",
      tab: "px-4 py-2 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors",
      active: "bg-accent/15 text-accent",
      inactive: "text-muted hover:text-ink hover:bg-raised",
    },
    underline: {
      list: "",
      tab: "px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors border-b-2",
      active: "border-accent text-ink",
      inactive: "border-transparent text-faint hover:text-muted",
    },
  };

  const styles = tabStyles[variant];

  return (
    <div className={className}>
      <div
        ref={tabListRef}
        role="tablist"
        aria-label="Tabs"
        className={cn("flex", styles.list)}
      >
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            role="tab"
            data-tab-id={tab.id}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && handleChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              styles.tab,
              active === tab.id ? styles.active : styles.inactive,
              tab.disabled && "opacity-40 cursor-not-allowed"
            )}
          >
            <span className="flex items-center gap-2">
              {tab.icon && <span aria-hidden>{tab.icon}</span>}
              {tab.label}
              {tab.badge != null && (
                <span className="border border-edge-strong bg-raised px-1.5 py-0.5 text-[10px] text-muted">
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={active} className="mt-4">
        {children}
      </div>
    </div>
  );
}
