import type { EnvironmentId } from "@t3tools/contracts";
import {
  getProjectFaviconCacheKey,
  isProjectFaviconFallbackUrl,
} from "@t3tools/shared/projectFavicon";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { useAssetUrl } from "../assets/assetUrls";
import { cn } from "~/lib/utils";
import { ProjectMonogram } from "./ProjectMonogram";

const loadedProjectFaviconSrcs = new Map<string, string>();

export function ProjectFavicon(input: {
  environmentId: EnvironmentId;
  cwd: string;
  className?: string | undefined;
  /**
   * Optional icon component when no project favicon exists.
   * Prefer `fallback` / `fallbackLabel` for inbox rows — folders imply nesting.
   */
  fallbackIcon?: ComponentType<{ className?: string }> | undefined;
  /** Custom React fallback (e.g. monogram). Takes precedence over fallbackIcon. */
  fallback?: ReactNode;
  /** When set and no custom fallback, render a monogram from this label. */
  fallbackLabel?: string | undefined;
  /** When true, render nothing if no real favicon is available. */
  hideFallback?: boolean | undefined;
}) {
  const src = useAssetUrl(input.environmentId, {
    _tag: "project-favicon",
    cwd: input.cwd,
  });

  const fallbackNode = resolveProjectFaviconFallback(input);

  if (!src || isProjectFaviconFallbackUrl(src)) {
    return fallbackNode;
  }

  const cacheKey = getProjectFaviconCacheKey(input.environmentId, input.cwd, src);

  return (
    <ProjectFaviconImage
      key={cacheKey}
      cacheKey={cacheKey}
      src={src}
      className={input.className}
      fallback={fallbackNode}
    />
  );
}

function resolveProjectFaviconFallback(input: {
  className?: string | undefined;
  fallbackIcon?: ComponentType<{ className?: string }> | undefined;
  fallback?: ReactNode;
  fallbackLabel?: string | undefined;
  hideFallback?: boolean | undefined;
}): ReactNode {
  if (input.hideFallback) return null;
  if (input.fallback !== undefined) return input.fallback;
  if (input.fallbackIcon) {
    const Icon = input.fallbackIcon;
    return <Icon className={cn("size-3.5 shrink-0 text-muted-foreground/50", input.className)} />;
  }
  if (input.fallbackLabel) {
    return <ProjectMonogram label={input.fallbackLabel} className={input.className} />;
  }
  // Default: monogram-style dot — never a folder (folders imply hierarchy).
  return <ProjectMonogram label="·" className={input.className} />;
}

function ProjectFaviconImage({
  cacheKey,
  src,
  className,
  fallback,
}: {
  readonly cacheKey: string;
  readonly src: string;
  readonly className?: string | undefined;
  readonly fallback: ReactNode;
}) {
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(
    () => loadedProjectFaviconSrcs.get(cacheKey) ?? null,
  );
  const isLoading = displayedSrc !== src;
  const handleLoadError = (failedSrc: string) => {
    if (loadedProjectFaviconSrcs.get(cacheKey) === failedSrc) {
      loadedProjectFaviconSrcs.delete(cacheKey);
    }
    setDisplayedSrc((currentSrc) => (currentSrc === failedSrc ? null : currentSrc));
  };

  return (
    <>
      {displayedSrc === null ? fallback : null}
      {displayedSrc ? (
        <img
          src={displayedSrc}
          alt=""
          className={cn("size-3.5 shrink-0 rounded-sm object-contain", className)}
          onError={() => handleLoadError(displayedSrc)}
        />
      ) : null}
      {isLoading ? (
        <img
          src={src}
          alt=""
          className="hidden"
          onLoad={() => {
            loadedProjectFaviconSrcs.set(cacheKey, src);
            setDisplayedSrc(src);
          }}
          onError={() => handleLoadError(src)}
        />
      ) : null}
    </>
  );
}
