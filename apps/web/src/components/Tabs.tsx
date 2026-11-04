/**
 * Tabs component — accessible tab panel with keyboard navigation.
 */

import { useState, type ReactNode, type KeyboardEvent, useRef } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  icon?: string;
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
      list: "border-b border-slate-800",
      tab: "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
      active: "border-blue-500 text-blue-400",
      inactive: "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600",
    },
    pills: {
      list: "bg-slate-900/50 rounded-lg p-1 gap-1",
      tab: "px-4 py-2 text-sm font-medium rounded-md transition-colors",
      active: "bg-blue-600 text-white shadow-sm",
      inactive: "text-slate-400 hover:text-white hover:bg-slate-800",
    },
    underline: {
      list: "",
      tab: "px-3 py-2 text-sm font-medium transition-colors border-b-2",
      active: "border-blue-500 text-white",
      inactive: "border-transparent text-slate-500 hover:text-slate-300",
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
              {tab.icon && <span>{tab.icon}</span>}
              {tab.label}
              {tab.badge != null && (
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-slate-700 text-slate-300">
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

