import { RefreshCwIcon, SettingsIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import {
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SidebarAccountUsage } from "./SidebarAccountUsage";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdatePill } from "./SidebarUpdatePill";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <SidebarHeader
      className={cn(
        "@container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 md:px-0",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      <SidebarTrigger
        className={cn(
          "relative z-10 md:hidden",
          backdropVariant &&
            "[:hover,[data-pressed]]:bg-white/15 focus-visible:ring-white/90 focus-visible:ring-offset-blue-700 [&_svg]:stroke-white/90! [&_svg]:opacity-100! [&_svg]:hover:stroke-white!",
        )}
      />
      <SidebarBrand onBackdrop={backdropVariant !== null} />
      {pillLabel ? (
        <Badge
          className="relative z-10 ml-1 rounded-full px-1.5 text-muted-foreground"
          data-environment-identification="pill"
          size="sm"
          variant="secondary"
        >
          {pillLabel}
        </Badge>
      ) : null}
    </SidebarHeader>
  );
});

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "sidebar-brand relative z-10 ml-[var(--workspace-titlebar-content-left)] h-7 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <span
        className={cn(
          "truncate text-sm font-semibold tracking-tight",
          onBackdrop ? "text-white" : "text-foreground",
        )}
      >
        T3r
      </span>
    </Link>
  );
}

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const [upstreamUpdating, setUpstreamUpdating] = useState(false);
  // Soft-fork only: the bridge method is absent in web and stock builds.
  const canUpdateFromUpstream = Boolean(window.desktopBridge?.runSoftForkUpdate);

  const handleSettingsClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/settings" });
  }, [isMobile, navigate, setOpenMobile]);

  const handleUpstreamUpdate = useCallback(() => {
    const bridge = window.desktopBridge;
    if (!bridge?.runSoftForkUpdate || upstreamUpdating) {
      return;
    }
    const runSoftForkUpdate = bridge.runSoftForkUpdate;
    void (async () => {
      const confirmed = await bridge.confirm(
        "Pull the latest upstream T3 changes into T3r and rebuild the app? Your customizations are kept; uncommitted changes will block the update.",
      );
      if (!confirmed) {
        return;
      }
      setUpstreamUpdating(true);
      try {
        const result = await runSoftForkUpdate({ rebuild: true });
        switch (result.status) {
          case "merged":
            toastManager.add(
              stackedThreadToast({
                type: "success",
                title: result.message,
                ...(result.buildStarted
                  ? {
                      description:
                        "Building the DMG in the background — a notification will fire when it's ready.",
                    }
                  : {}),
              }),
            );
            break;
          case "up-to-date":
            toastManager.add(stackedThreadToast({ type: "info", title: result.message }));
            break;
          case "dirty":
            toastManager.add(
              stackedThreadToast({
                type: "warning",
                title: "Update blocked",
                description: result.message,
              }),
            );
            break;
          case "conflict":
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Merge conflict — nothing was changed",
                description:
                  result.conflictFiles !== undefined && result.conflictFiles.length > 0
                    ? `Resolve in a terminal. Conflicts: ${result.conflictFiles
                        .slice(0, 3)
                        .join(", ")}${result.conflictFiles.length > 3 ? "…" : ""}`
                    : result.message,
              }),
            );
            break;
          default:
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Update failed",
                description: result.message,
              }),
            );
        }
      } catch (error) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Update failed",
            description: error instanceof Error ? error.message : "An unexpected error occurred.",
          }),
        );
      } finally {
        setUpstreamUpdating(false);
      }
    })();
  }, [upstreamUpdating]);

  return (
    <SidebarFooter className="p-2">
      <SidebarProviderUpdatePill />
      <SidebarUpdatePill />
      <SidebarAccountUsage />
      <SidebarMenu>
        {canUpdateFromUpstream ? (
          <SidebarMenuItem>
            <SidebarMenuButton disabled={upstreamUpdating} onClick={handleUpstreamUpdate}>
              <RefreshCwIcon className={upstreamUpdating ? "animate-spin" : undefined} />
              <span>{upstreamUpdating ? "Updating from upstream…" : "Update from upstream"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        <SidebarMenuItem>
          <SidebarMenuButton onClick={handleSettingsClick}>
            <SettingsIcon />
            <span>Settings</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
});
