import type {
  ContextMenuItem as TreeContextMenuItem,
  ContextMenuOpenContext as TreeContextMenuOpenContext,
} from "@pierre/trees";
import type { EditorId, EnvironmentId, ProjectEntry } from "@t3tools/contracts";
import { EDITORS } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { FileTree, useFileTree, useFileTreeSearch } from "@pierre/trees/react";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { useAtomValue } from "@effect/atom-react";
import { RotateCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { Button } from "~/components/ui/button";
import { InputGroup, InputGroupInput } from "~/components/ui/input-group";
import { toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useComposerHandleContext } from "~/composerHandleContext";
import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { useTheme } from "~/hooks/useTheme";
import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { T3_PIERRE_ICONS } from "~/pierre-icons";
import { revealInFileExplorerLabel } from "~/components/preview/fileExplorerLabel";
import { projectEnvironment } from "~/state/projects";
import { shellEnvironment } from "~/state/shell";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";

import { resolveAndPersistPreferredEditor } from "~/editorPreferences";

import { createFileTreeDragMentionController } from "./fileTreeDragMention";
import { useProjectEntriesQuery } from "./projectFilesQueryState";

const OPEN_WITH_PREFIX = "open-with:" as const;

function editorLabel(editorId: EditorId): string {
  return EDITORS.find((editor) => editor.id === editorId)?.label ?? editorId;
}

function joinWorkspacePath(cwd: string, relativePath: string): string {
  const base = cwd.replace(/[/\\]+$/, "");
  const rel = relativePath.replace(/^[/\\]+/, "");
  if (!rel) return base;
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return `${base}${sep}${rel}`;
}

function pathBasename(pathValue: string): string {
  const normalized = pathValue.replaceAll("\\", "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

interface FileBrowserPanelProps {
  environmentId: EnvironmentId;
  cwd: string;
  projectName: string;
  /** File currently open in the preview pane; revealed and selected in the tree. */
  selectedPath: string | null;
  /** Bumped when the same path should be revealed again (e.g. re-opened from search). */
  selectedPathRevealId: number;
  onOpenFile: (relativePath: string) => void;
}

const TREE_UNSAFE_CSS = `
  :host {
    --trees-bg-override: transparent;
    --trees-selected-bg-override: color-mix(in srgb, currentColor 12%, transparent);
    --trees-hover-bg-override: color-mix(in srgb, currentColor 7%, transparent);
    --trees-border-color-override: color-mix(in srgb, currentColor 14%, transparent);
    --trees-font-family-override: var(--font-sans);
    --trees-font-size-override: 12px;
  }
  button[data-type='item'] { border-radius: 5px; }
`;

function treePath(entry: ProjectEntry): string {
  return entry.kind === "directory" ? `${entry.path}/` : entry.path;
}

function RefreshFilesButton(props: { isPending: boolean; onRefresh: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Refresh workspace files"
            onClick={props.onRefresh}
          />
        }
      >
        <RotateCw className={cn(props.isPending && "animate-spin")} />
      </TooltipTrigger>
      <TooltipPopup>{props.isPending ? "Refreshing…" : "Refresh files"}</TooltipPopup>
    </Tooltip>
  );
}

function FileSearchField(props: {
  ariaLabel: string;
  name: string;
  onClose: () => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <InputGroup variant="ghost" className="h-7 min-w-0 flex-1 rounded-md">
      <InputGroupInput
        type="search"
        name={props.name}
        size="sm"
        value={props.value}
        aria-label={props.ariaLabel}
        placeholder="Search files"
        spellCheck={false}
        onChange={(event) => props.onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          props.onClose();
          event.currentTarget.blur();
        }}
      />
    </InputGroup>
  );
}

export default function FileBrowserPanel({
  environmentId,
  cwd,
  projectName,
  selectedPath,
  selectedPathRevealId,
  onOpenFile,
}: FileBrowserPanelProps) {
  const { resolvedTheme } = useTheme();
  const composerRef = useComposerHandleContext();
  const entriesQuery = useProjectEntriesQuery(environmentId, cwd);
  const entries = entriesQuery.data?.entries ?? [];
  const entryKinds = useMemo(
    () => new Map(entries.map((entry) => [entry.path, entry.kind] as const)),
    [entries],
  );
  const entryKindsRef = useRef<ReadonlyMap<string, ProjectEntry["kind"]>>(entryKinds);
  const treePaths = useMemo(() => entries.map(treePath), [entries]);
  const previousTreePathsRef = useRef<readonly string[]>([]);
  const syncingSelectionRef = useRef(false);
  const treeSelectionPathRef = useRef<string | null>(null);
  const handledRevealRef = useRef<{ path: string; revealId: number } | null>(null);

  // The tree renders rows in shadow DOM and its anchor rect is unreliable, so
  // capture the right-click position ourselves; contextmenu is a composed
  // event, so a capture-phase listener sees it with viewport coordinates.
  const contextMenuPointerRef = useRef<{ x: number; y: number; at: number } | null>(null);
  useEffect(() => {
    const capturePointer = (event: MouseEvent) => {
      contextMenuPointerRef.current = { x: event.clientX, y: event.clientY, at: event.timeStamp };
    };
    document.addEventListener("contextmenu", capturePointer, true);
    return () => document.removeEventListener("contextmenu", capturePointer, true);
  }, []);

  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const availableEditors = serverConfig?.availableEditors ?? [];
  const openInEditorCommand = useAtomCommand(shellEnvironment.openInEditor, {
    reportFailure: false,
  });
  const readProjectFile = useAtomQueryRunner(projectEnvironment.readFile, {
    reportFailure: false,
  });
  const canRevealInFolder =
    typeof window !== "undefined" && Boolean(window.desktopBridge?.showItemInFolder);
  const revealLabel = revealInFileExplorerLabel(
    typeof navigator !== "undefined" ? navigator.platform : "mac",
  );

  const copyText = useCallback(async (value: string, label: string) => {
    try {
      await writeTextToClipboard(value);
      toastManager.add({ type: "success", title: `${label} copied`, description: value });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: `Failed to copy ${label.toLowerCase()}`,
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    }
  }, []);

  const openAbsoluteInEditor = useCallback(
    async (absolutePath: string, editorId?: EditorId) => {
      const editor = editorId ?? resolveAndPersistPreferredEditor(availableEditors);
      if (!editor) {
        toastManager.add({
          type: "error",
          title: "Unable to open in editor",
          description: "No editor is available on this machine.",
        });
        return;
      }
      try {
        const result = await openInEditorCommand({
          environmentId,
          input: { cwd: absolutePath, editor },
        });
        if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
          return;
        }
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: "Unable to open in editor",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      } catch (cause) {
        toastManager.add({
          type: "error",
          title: "Unable to open in editor",
          description: cause instanceof Error ? cause.message : "An error occurred.",
        });
      }
    },
    [availableEditors, environmentId, openInEditorCommand],
  );

  const showEntryContextMenu = useCallback(
    async (item: TreeContextMenuItem, context: TreeContextMenuOpenContext) => {
      const api = readLocalApi();
      if (!api) {
        context.close();
        return;
      }
      const relativePath = item.path.replace(/\/$/, "");
      const isDirectory = entryKindsRef.current.get(relativePath) === "directory";
      const isFile = !isDirectory;
      const absolutePath = joinWorkspacePath(cwd, relativePath);
      const basename = pathBasename(relativePath);
      const mention = serializeComposerFileLink(relativePath);
      const pointer = contextMenuPointerRef.current;
      const pointerIsFresh = pointer !== null && performance.now() - pointer.at < 1000;
      const anchorRect = context.anchorElement.getBoundingClientRect();
      const position = pointerIsFresh
        ? { x: pointer.x, y: pointer.y }
        : { x: anchorRect.left, y: anchorRect.bottom };

      const openWithChildren = availableEditors.map((editorId) => ({
        id: `${OPEN_WITH_PREFIX}${editorId}`,
        label: editorLabel(editorId),
      }));

      try {
        const clicked = await api.contextMenu.show(
          [
            ...(isFile ? ([{ id: "open-viewer", label: "Open in viewer" }] as const) : []),
            { id: "open-editor", label: "Open in editor" },
            ...(openWithChildren.length > 0
              ? ([
                  {
                    id: "open-with",
                    label: "Open with",
                    children: openWithChildren,
                  },
                ] as const)
              : []),
            { id: "copy-name", label: "Copy name" },
            { id: "copy-relative", label: "Copy relative path" },
            { id: "copy-full", label: "Copy full path" },
            ...(isFile ? ([{ id: "copy-contents", label: "Copy contents" }] as const) : []),
            ...(canRevealInFolder ? ([{ id: "reveal", label: revealLabel }] as const) : []),
            { id: "copy-mention", label: "Copy mention" },
            { id: "add-to-chat", label: "Add to chat" },
          ] as const,
          position,
        );

        if (!clicked) return;

        if (clicked === "open-viewer") {
          onOpenFile(relativePath);
          return;
        }
        if (clicked === "open-editor") {
          await openAbsoluteInEditor(absolutePath);
          return;
        }
        if (clicked.startsWith(OPEN_WITH_PREFIX)) {
          const editorId = clicked.slice(OPEN_WITH_PREFIX.length) as EditorId;
          await openAbsoluteInEditor(absolutePath, editorId);
          return;
        }
        if (clicked === "copy-name") {
          await copyText(basename, "Name");
          return;
        }
        if (clicked === "copy-relative") {
          await copyText(relativePath, "Relative path");
          return;
        }
        if (clicked === "copy-full") {
          await copyText(absolutePath, "Full path");
          return;
        }
        if (clicked === "copy-contents") {
          try {
            const result = await readProjectFile({
              environmentId,
              input: { cwd, relativePath },
            });
            if (result._tag !== "Success") {
              const error = squashAtomCommandFailure(result);
              toastManager.add({
                type: "error",
                title: "Unable to copy contents",
                description: error instanceof Error ? error.message : "An error occurred.",
              });
              return;
            }
            await copyText(result.value.contents, "Contents");
          } catch (cause) {
            toastManager.add({
              type: "error",
              title: "Unable to copy contents",
              description: cause instanceof Error ? cause.message : "An error occurred.",
            });
          }
          return;
        }
        if (clicked === "reveal") {
          const reveal = api.shell.showItemInFolder ?? window.desktopBridge?.showItemInFolder;
          if (!reveal) {
            toastManager.add({
              type: "error",
              title: `Unable to ${revealLabel.toLowerCase()}`,
              description: "This action is only available in the desktop app.",
            });
            return;
          }
          try {
            await reveal(absolutePath);
          } catch (cause) {
            toastManager.add({
              type: "error",
              title: `Unable to ${revealLabel.toLowerCase()}`,
              description: cause instanceof Error ? cause.message : "An error occurred.",
            });
          }
          return;
        }
        if (clicked === "copy-mention") {
          await copyText(mention, "Mention");
          return;
        }
        if (clicked === "add-to-chat") {
          const composer = composerRef?.current;
          if (!composer) {
            toastManager.add({
              type: "error",
              title: "Unable to add to chat",
              description: "Open a chat for this project and try again.",
            });
            return;
          }
          const inserted = composer.insertTextAtEnd(`${mention} `, { ensureLeadingBoundary: true });
          if (!inserted) {
            toastManager.add({
              type: "error",
              title: "Unable to add to chat",
              description: "The chat isn't ready to accept input right now.",
            });
          }
        }
      } finally {
        context.close();
      }
    },
    [
      availableEditors,
      canRevealInFolder,
      composerRef,
      copyText,
      cwd,
      environmentId,
      onOpenFile,
      openAbsoluteInEditor,
      readProjectFile,
      revealLabel,
    ],
  );
  const showEntryContextMenuRef = useRef(showEntryContextMenu);
  useEffect(() => {
    showEntryContextMenuRef.current = showEntryContextMenu;
  });

  const treeModelRef = useRef<ReturnType<typeof useFileTree>["model"] | null>(null);
  const dragMention = useMemo(
    () =>
      createFileTreeDragMentionController({
        deselect: (path) => treeModelRef.current?.getItem(path)?.deselect(),
      }),
    [],
  );
  const { model } = useFileTree({
    composition: {
      contextMenu: {
        triggerMode: "right-click",
        onOpen: (item, context) => {
          void showEntryContextMenuRef.current(item, context);
        },
      },
    },
    // Rows only need to be draggable so entries can be dropped into the chat
    // composer; rearranging files inside the tree stays off.
    dragAndDrop: { canDrop: () => false },
    density: "compact",
    fileTreeSearchMode: "hide-non-matches",
    flattenEmptyDirectories: true,
    initialExpansion: 1,
    icons: T3_PIERRE_ICONS,
    onSelectionChange: (selectedPaths) => {
      // The drag controller's selection cache must track every change,
      // including reveal-driven ones, or drags act on a stale selection.
      dragMention.handleSelectionChange(selectedPaths);
      // Selection changes driven by the reveal sync below are echoes of an
      // already-open file, not a request to open it again.
      if (syncingSelectionRef.current) return;
      // Starting a drag selects the dragged row; that selection is a side
      // effect of the gesture, not a request to open the file.
      if (dragMention.isDragInProgress()) {
        return;
      }
      const selectedPath = selectedPaths.at(-1)?.replace(/\/$/, "");
      if (selectedPath && entryKindsRef.current.get(selectedPath) === "file") {
        treeSelectionPathRef.current = selectedPath;
        onOpenFile(selectedPath);
      }
    },
    paths: [],
    search: false,
    unsafeCSS: TREE_UNSAFE_CSS,
  });
  const search = useFileTreeSearch(model);
  const handleSearchValueChange = (value: string) => {
    if (value.trim().length === 0) {
      search.close();
      return;
    }
    search.setValue(value);
  };

  useEffect(() => {
    if (previousTreePathsRef.current === treePaths) return;
    entryKindsRef.current = entryKinds;
    previousTreePathsRef.current = treePaths;
    model.resetPaths(treePaths);
  }, [entryKinds, model, treePaths]);

  useEffect(() => {
    if (!selectedPath) {
      handledRevealRef.current = null;
      return;
    }
    const revealRequest = { path: selectedPath, revealId: selectedPathRevealId };
    const handledReveal = handledRevealRef.current;
    // Entry refreshes rebuild treePaths while the same preview stays open.
    // Replaying a handled reveal would close an active tree search and steal focus.
    if (
      handledReveal?.path === revealRequest.path &&
      handledReveal.revealId === revealRequest.revealId
    ) {
      return;
    }
    if (entryKinds.get(selectedPath) !== "file") return;
    const selectedItem = model.getItem(selectedPath);
    if (!selectedItem) return;

    // A selection that originated inside the tree (clicking a row, possibly
    // in an active tree search) is already visible; re-revealing it would
    // close the search and clobber the user's context. Only sync external
    // opens (file picker, content search, chat links).
    const selectedInTree = model
      .getSelectedPaths()
      .some((path) => path.replace(/\/$/, "") === selectedPath);
    if (selectedInTree && treeSelectionPathRef.current === selectedPath) {
      treeSelectionPathRef.current = null;
      handledRevealRef.current = revealRequest;
      return;
    }
    treeSelectionPathRef.current = null;
    handledRevealRef.current = revealRequest;

    syncingSelectionRef.current = true;
    model.closeSearch();
    for (const path of model.getSelectedPaths()) {
      model.getItem(path)?.deselect();
    }

    // Directory rows are registered with a trailing slash (see treePath), so
    // ancestor lookups must use the same form to expand them.
    const segments = selectedPath.split("/");
    let ancestorPath = "";
    for (const segment of segments.slice(0, -1)) {
      ancestorPath = ancestorPath ? `${ancestorPath}/${segment}` : segment;
      const item = model.getItem(`${ancestorPath}/`) ?? model.getItem(ancestorPath);
      if (item && "expand" in item) item.expand();
    }

    selectedItem.select();
    model.scrollToPath(selectedPath, { focus: true, offset: "center" });
    queueMicrotask(() => {
      syncingSelectionRef.current = false;
    });
  }, [entryKinds, model, selectedPath, selectedPathRevealId, treePaths]);

  // Tag tree drags with the composer mention payload. The row is read from
  // the composed event path (the tree's shadow root is open), so this does
  // not depend on running after the tree's own dragstart handler; the drag
  // data store is writable for every dragstart listener in the dispatch.
  // The capture phase runs before the tree's own dragstart handler selects
  // the dragged row, so the drag flag is up before that selection emits.
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    treeModelRef.current = model;
  }, [model]);
  useEffect(() => {
    const panel = panelRef.current;
    if (panel === null) {
      return;
    }
    const handleDragStart = (event: DragEvent) => dragMention.handleDragStart(event);
    const handleDragEnd = () => dragMention.handleDragEnd();
    panel.addEventListener("dragstart", handleDragStart, true);
    panel.addEventListener("dragend", handleDragEnd);
    return () => {
      panel.removeEventListener("dragstart", handleDragStart, true);
      panel.removeEventListener("dragend", handleDragEnd);
    };
  }, [dragMention]);

  return (
    <div
      ref={panelRef}
      className="flex min-h-0 flex-1 flex-col bg-background"
      data-file-browser-panel={`${environmentId}:${cwd}`}
    >
      <div className="surface-subheader gap-1 px-2" data-surface-subheader>
        <RefreshFilesButton isPending={entriesQuery.isPending} onRefresh={entriesQuery.refresh} />
        <FileSearchField
          name="project-files-search"
          ariaLabel={`Search ${projectName} files`}
          value={search.value}
          onValueChange={handleSearchValueChange}
          onClose={search.close}
        />
      </div>
      {entriesQuery.error && entriesQuery.data === null ? (
        <div className="p-4 text-xs leading-relaxed text-destructive">{entriesQuery.error}</div>
      ) : (
        <FileTree
          model={model}
          aria-label={`${projectName} files`}
          className="min-h-0 flex-1 overflow-hidden"
          style={{
            colorScheme: resolvedTheme,
            ["--trees-fg-override" as string]: "var(--foreground)",
          }}
        />
      )}
    </div>
  );
}
