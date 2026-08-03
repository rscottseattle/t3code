import { isAttachableComposerFile } from "@t3tools/shared/chatAttachments";
import {
  isWindowsAbsolutePath,
  isUncPath,
  normalizeProjectPathForComparison,
  normalizeProjectPathForDispatch,
} from "@t3tools/shared/path";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";

/**
 * OS (Finder/Explorer) drops of folders should become path *references* for the
 * agent — not content attachments. File-tree drags already use a custom
 * mention MIME type; this module covers native filesystem drops.
 */

export type OsDropItemKind = "path-mention" | "attachable-file" | "unsupported";

export interface OsDropItem {
  readonly kind: OsDropItemKind;
  /** Absolute or workspace-relative path when kind is path-mention. */
  readonly path?: string;
  readonly file?: File;
  readonly name: string;
}

export interface ClassifyOsDropItemInput {
  readonly file: File;
  /** From DataTransferItem.webkitGetAsEntry().isDirectory when available. */
  readonly isDirectoryEntry: boolean;
  /** Absolute filesystem path from Electron webUtils.getPathForFile, when known. */
  readonly absolutePath: string | null;
  /**
   * When absolutePath is known, optional fs.stat result. Preferred over the
   * webkit entry flag because folder File objects sometimes look like empty files.
   */
  readonly isDirectoryPath?: boolean | null;
}

function toPosixSeparators(value: string): string {
  return value.replaceAll("\\", "/");
}

/**
 * Prefer workspace-relative paths so mentions match @-picker / file-tree form.
 * Paths outside the workspace stay absolute so the agent still has a usable location.
 */
export function composerMentionPathFromAbsolute(
  absolutePath: string,
  workspaceRoot: string | null | undefined,
): string {
  const normalizedAbs = normalizeProjectPathForDispatch(absolutePath);
  if (normalizedAbs.length === 0) {
    return ".";
  }

  const root = workspaceRoot?.trim() ? normalizeProjectPathForDispatch(workspaceRoot) : null;
  if (!root) {
    return normalizedAbs;
  }

  const absCompare = normalizeProjectPathForComparison(normalizedAbs);
  const rootCompare = normalizeProjectPathForComparison(root);

  if (absCompare === rootCompare) {
    return ".";
  }

  const separator = isWindowsAbsolutePath(root) || isUncPath(root) ? "\\" : "/";
  const rootPrefixCompare =
    rootCompare.endsWith("\\") || rootCompare.endsWith("/")
      ? rootCompare
      : `${rootCompare}${separator === "\\" ? "\\" : "/"}`;

  // Comparison form lowercases Windows paths; require a true child prefix.
  const childPrefix =
    separator === "\\"
      ? rootPrefixCompare.endsWith("\\")
        ? rootPrefixCompare
        : `${rootPrefixCompare}\\`
      : rootPrefixCompare.endsWith("/")
        ? rootPrefixCompare
        : `${rootPrefixCompare}/`;

  if (!absCompare.startsWith(childPrefix)) {
    return normalizedAbs;
  }

  // Preserve original casing from the absolute path for the relative segment.
  const absPosix = toPosixSeparators(normalizedAbs);
  const rootPosix = toPosixSeparators(root).replace(/\/+$/, "");
  if (
    absPosix.length >= rootPosix.length &&
    absPosix.toLowerCase().startsWith(rootPosix.toLowerCase())
  ) {
    const sliced = absPosix.slice(rootPosix.length).replace(/^\/+/, "");
    return sliced.length > 0 ? sliced : ".";
  }

  // Length-based fallback when casing differs only in compare form.
  const relativeCompare = absCompare.slice(childPrefix.length).replaceAll("\\", "/");
  return relativeCompare.length > 0 ? relativeCompare : ".";
}

export function serializeOsPathMention(
  absolutePath: string,
  workspaceRoot: string | null | undefined,
): string {
  const mentionPath = composerMentionPathFromAbsolute(absolutePath, workspaceRoot);
  return serializeComposerFileLink(mentionPath);
}

/**
 * Classify one dropped OS file/folder for the composer.
 *
 * Directories with a resolvable path → path mention.
 * Attachable files → attachment.
 * Everything else → unsupported (existing toast path).
 */
export function classifyOsDropItem(input: ClassifyOsDropItemInput): OsDropItem {
  const name = input.file.name || "item";
  const isDirectory =
    input.isDirectoryPath === true || (input.isDirectoryPath == null && input.isDirectoryEntry);

  if (isDirectory) {
    if (input.absolutePath && input.absolutePath.trim().length > 0) {
      return {
        kind: "path-mention",
        path: normalizeProjectPathForDispatch(input.absolutePath),
        name,
      };
    }
    return { kind: "unsupported", name };
  }

  if (
    isAttachableComposerFile({
      mimeType: input.file.type,
      fileName: input.file.name,
    })
  ) {
    return { kind: "attachable-file", file: input.file, name };
  }

  // Non-attachable file with a known path still makes a useful agent reference
  // (e.g. binary configs the model should open on disk rather than inline).
  if (input.absolutePath && input.absolutePath.trim().length > 0) {
    return {
      kind: "path-mention",
      path: normalizeProjectPathForDispatch(input.absolutePath),
      name,
    };
  }

  return { kind: "unsupported", name };
}

export interface PartitionOsDropResult {
  readonly pathMentions: readonly string[];
  readonly attachableFiles: readonly File[];
  readonly unsupportedNames: readonly string[];
}

export function partitionOsDropItems(
  items: ReadonlyArray<OsDropItem>,
  workspaceRoot: string | null | undefined,
): PartitionOsDropResult {
  const pathMentions: string[] = [];
  const attachableFiles: File[] = [];
  const unsupportedNames: string[] = [];
  const seenMentions = new Set<string>();

  for (const item of items) {
    if (item.kind === "path-mention" && item.path) {
      const mention = serializeOsPathMention(item.path, workspaceRoot);
      if (!seenMentions.has(mention)) {
        seenMentions.add(mention);
        pathMentions.push(mention);
      }
      continue;
    }
    if (item.kind === "attachable-file" && item.file) {
      attachableFiles.push(item.file);
      continue;
    }
    unsupportedNames.push(item.name);
  }

  return { pathMentions, attachableFiles, unsupportedNames };
}

export function readDirectoryEntryFlag(item: DataTransferItem | null | undefined): boolean {
  if (!item || typeof item.webkitGetAsEntry !== "function") {
    return false;
  }
  try {
    const entry = item.webkitGetAsEntry();
    return Boolean(entry && "isDirectory" in entry && entry.isDirectory);
  } catch {
    return false;
  }
}
