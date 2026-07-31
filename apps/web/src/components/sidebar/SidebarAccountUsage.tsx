import type { AccountUsageProviderSnapshot, AccountUsageWindow } from "@t3tools/contracts";
import { memo, useMemo } from "react";

import { useAccountUsage } from "../../lib/accountUsageState";
import { cn } from "../../lib/utils";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (value < 10) {
    return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  }
  return `${Math.round(value)}%`;
}

function formatResetsAt(resetsAt: string | null): string | null {
  if (!resetsAt) {
    return null;
  }
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function remainingTone(remainingPercent: number): string {
  if (remainingPercent <= 10) {
    return "var(--color-red-500)";
  }
  if (remainingPercent <= 25) {
    return "var(--color-amber-500)";
  }
  return "var(--color-emerald-400)";
}

function UsageRing(props: {
  remainingPercent: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const size = props.size ?? 22;
  const strokeWidth = props.strokeWidth ?? 2.75;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const remaining = Math.max(0, Math.min(100, props.remainingPercent));
  const dashOffset = circumference - (remaining / 100) * circumference;
  const color = remainingTone(remaining);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={cn("-rotate-90 transform-gpu", props.className)}
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="color-mix(in oklab, var(--color-muted-foreground) 22%, transparent)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        className="transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none"
      />
    </svg>
  );
}

function WindowRow(props: { window: AccountUsageWindow }) {
  const { window } = props;
  const resets = formatResetsAt(window.resetsAt);
  return (
    <div className="flex items-center gap-2.5">
      <UsageRing remainingPercent={window.remainingPercent} size={28} strokeWidth={3} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-medium text-foreground/90">{window.label}</span>
          <span className="shrink-0 tabular-nums text-[11px] font-medium text-foreground/80">
            {formatPercent(window.remainingPercent)} left
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground/70">
          <span className="tabular-nums">{formatPercent(window.usedPercent)} used</span>
          {resets ? <span className="truncate">Resets {resets}</span> : null}
        </div>
      </div>
    </div>
  );
}

function ProviderSection(props: { provider: AccountUsageProviderSnapshot }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">
        {props.provider.displayName}
      </div>
      <div className="flex flex-col gap-2.5">
        {props.provider.windows.map((window) => (
          <WindowRow key={window.id} window={window} />
        ))}
      </div>
    </div>
  );
}

/**
 * Compact multi-ring usage control for the sidebar footer.
 * Shows remaining plan usage per window (5h / week / model buckets).
 */
export const SidebarAccountUsage = memo(function SidebarAccountUsage() {
  const { data } = useAccountUsage();

  const flatWindows = useMemo(() => {
    const rows: Array<{
      key: string;
      providerLabel: string;
      window: AccountUsageWindow;
    }> = [];
    for (const provider of data.providers) {
      for (const window of provider.windows) {
        rows.push({
          key: `${provider.providerInstanceId}:${window.id}`,
          providerLabel: provider.displayName,
          window,
        });
      }
    }
    return rows;
  }, [data.providers]);

  if (flatWindows.length === 0) {
    return null;
  }

  // Prefer a short set of rings in the footer: one per window, max 4.
  const visibleRings = flatWindows.slice(0, 4);
  const lowestRemaining = Math.min(...flatWindows.map((row) => row.window.remainingPercent));

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={120}
        closeDelay={80}
        render={
          <button
            type="button"
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sidebar-foreground outline-none transition-colors",
              "hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label={`Usage remaining: lowest window ${formatPercent(lowestRemaining)} left`}
          >
            <span className="relative flex shrink-0 items-center">
              {visibleRings.map((row, index) => (
                <span
                  key={row.key}
                  className={cn(
                    "relative inline-flex items-center justify-center rounded-full bg-sidebar",
                    index > 0 && "-ml-1.5",
                  )}
                  style={{ zIndex: visibleRings.length - index }}
                  title={`${row.providerLabel} ${row.window.label}: ${formatPercent(row.window.remainingPercent)} left`}
                >
                  <UsageRing
                    remainingPercent={row.window.remainingPercent}
                    size={18}
                    strokeWidth={2.5}
                  />
                </span>
              ))}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-sidebar-foreground/90">
                {formatPercent(lowestRemaining)}
              </span>
              <span className="text-muted-foreground/80"> left</span>
            </span>
          </button>
        }
      />
      <PopoverPopup
        tooltipStyle
        side="top"
        align="start"
        className="dropdown-glass w-72 max-w-none border-0! bg-secondary! p-0 shadow-none! before:hidden"
      >
        <div className="flex flex-col gap-3 p-3">
          <div className="text-xs font-medium text-muted-foreground">Plan usage remaining</div>
          {data.providers.map((provider) => (
            <ProviderSection key={provider.providerInstanceId} provider={provider} />
          ))}
          <div className="text-[10px] leading-4 text-muted-foreground/60">
            Updates when Claude or Codex reports rate-limit windows. API-key sessions may not show
            plan limits.
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
});
