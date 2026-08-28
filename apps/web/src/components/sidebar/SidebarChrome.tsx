import {
  ArrowLeftIcon,
  ChartNoAxesColumnIcon,
  GitPullRequestIcon,
  RefreshCwIcon,
  SettingsIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { memo, useCallback, useState } from "react";
import { Link, useCanGoBack, useLocation, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { useEnvironments } from "../../state/environments";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  resolveSidebarStageFocusRingOffsetClass,
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
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";

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
            "focus-visible:ring-white/90 [&_svg]:stroke-white/90! [&_svg]:opacity-100! [&_svg]:hover:stroke-white! [:hover,[data-pressed]]:bg-white/15",
          backdropVariant && resolveSidebarStageFocusRingOffsetClass(backdropVariant),
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
        "relative z-10 ml-[var(--workspace-titlebar-content-left)] hidden h-7 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2 md:flex",
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

function SidebarUtilityItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton aria-label={label} onClick={onClick} size="icon">
              {icon}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

export const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { isMobile, setOpenMobile } = useSidebar();
  const [upstreamUpdating, setUpstreamUpdating] = useState(false);
  // Soft-fork only: the bridge method is absent in web and stock builds.
  const canUpdateFromUpstream = Boolean(window.desktopBridge?.runSoftForkUpdate);
  const currentFooterPage = useLocation({
    select: (location) =>
      /^\/settings(?:\/|$)/.test(location.pathname)
        ? "settings"
        : /^\/projects\/[^/]+\/?$/.test(location.pathname)
          ? "project-settings"
          : location.pathname === "/usage"
            ? "usage"
            : location.pathname === "/pull-requests"
              ? "pull-requests"
              : null,
  });
  const { environments } = useEnvironments();
  // The page reads every connected server, so one of them offering pull requests is enough for
  // the link to lead somewhere.
  const pullRequestsSupported = environments.some(
    (environment) => environment.serverConfig?.environment.capabilities.pullRequests === true,
  );
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);
  const handlePullRequestsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/pull-requests", search: { involvement: "all", state: "open" } });
  }, [closeMobileSidebar, navigate]);
  const handleSettingsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/settings" });
  }, [closeMobileSidebar, navigate]);

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

  const handleUsageClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/usage" });
  }, [isMobile, navigate, setOpenMobile]);

  const handleBackClick = useCallback(() => {
    closeMobileSidebar();
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }, [canGoBack, closeMobileSidebar, navigate]);

  return (
    <SidebarMenu className="flex-row items-center">
      {currentFooterPage ? (
        <SidebarMenuItem className="min-w-0 flex-1">
          <SidebarMenuButton onClick={handleBackClick}>
            <ArrowLeftIcon />
            <span>Back</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        <>
          <SidebarUtilityItem
            icon={<SettingsIcon />}
            label="Settings"
            onClick={handleSettingsClick}
          />
          {pullRequestsSupported ? (
            <SidebarUtilityItem
              icon={<GitPullRequestIcon />}
              label="Pull Requests"
              onClick={handlePullRequestsClick}
            />
          ) : null}
          <SidebarUtilityItem
            icon={<ChartNoAxesColumnIcon />}
            label="Usage"
            onClick={handleUsageClick}
          />
        </>
      )}
      {canUpdateFromUpstream ? (
        <SidebarUtilityItem
          icon={<RefreshCwIcon className={upstreamUpdating ? "animate-spin" : undefined} />}
          label={upstreamUpdating ? "Updating from upstream…" : "Update from upstream"}
          onClick={handleUpstreamUpdate}
        />
      ) : null}
      <SidebarUpdatePill />
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter className="p-[var(--sidebar-content-inset)]">
      <SidebarProviderUpdatePill />
      <SidebarAccountUsage />
      <SidebarUpdateArchitectureWarning />
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
