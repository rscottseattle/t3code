import { describe, expect, it } from "@effect/vitest";

import {
  classifyOsDropItem,
  composerMentionPathFromAbsolute,
  partitionOsDropItems,
  serializeOsPathMention,
} from "./composerOsPathDrop";

function fakeFile(name: string, type = "", size = 0): File {
  const file = new File([size > 0 ? "x".repeat(Math.min(size, 8)) : ""], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("composerMentionPathFromAbsolute", () => {
  it("returns workspace-relative paths when the drop is inside the project", () => {
    expect(
      composerMentionPathFromAbsolute("/Users/ryan/proj/docs/research", "/Users/ryan/proj"),
    ).toBe("docs/research");
  });

  it("returns . when the dropped folder is the workspace root", () => {
    expect(composerMentionPathFromAbsolute("/Users/ryan/proj", "/Users/ryan/proj")).toBe(".");
    expect(composerMentionPathFromAbsolute("/Users/ryan/proj/", "/Users/ryan/proj")).toBe(".");
  });

  it("keeps absolute paths outside the workspace", () => {
    expect(
      composerMentionPathFromAbsolute("/Users/ryan/Documents/output", "/Users/ryan/proj"),
    ).toBe("/Users/ryan/Documents/output");
  });

  it("handles missing workspace root", () => {
    expect(composerMentionPathFromAbsolute("/tmp/out", null)).toBe("/tmp/out");
  });

  it("normalizes Windows absolute paths under a Windows workspace root", () => {
    expect(composerMentionPathFromAbsolute("C:\\repo\\src\\lib", "C:\\repo")).toBe("src/lib");
  });
});

describe("serializeOsPathMention", () => {
  it("serializes relative folder mentions as file links", () => {
    expect(serializeOsPathMention("/Users/ryan/proj/docs/research", "/Users/ryan/proj")).toBe(
      "[research](docs/research)",
    );
  });
});

describe("classifyOsDropItem", () => {
  it("classifies directory entries with a path as path mentions", () => {
    const result = classifyOsDropItem({
      file: fakeFile("research"),
      isDirectoryEntry: true,
      absolutePath: "/Users/ryan/proj/docs/research",
    });
    expect(result).toEqual({
      kind: "path-mention",
      path: "/Users/ryan/proj/docs/research",
      name: "research",
    });
  });

  it("rejects directories without a resolvable path", () => {
    const result = classifyOsDropItem({
      file: fakeFile("research"),
      isDirectoryEntry: true,
      absolutePath: null,
    });
    expect(result).toEqual({ kind: "unsupported", name: "research" });
  });

  it("turns attachable local files into path mentions", () => {
    const file = fakeFile("notes.md", "text/markdown", 12);
    const result = classifyOsDropItem({
      file,
      isDirectoryEntry: false,
      absolutePath: "/Users/ryan/proj/notes.md",
    });
    expect(result).toEqual({
      kind: "path-mention",
      path: "/Users/ryan/proj/notes.md",
      name: "notes.md",
    });
  });

  it("keeps attachable browser files as attachments when no local path is available", () => {
    const file = fakeFile("notes.md", "text/markdown", 12);
    const result = classifyOsDropItem({
      file,
      isDirectoryEntry: false,
      absolutePath: null,
    });
    expect(result).toEqual({ kind: "attachable-file", file, name: "notes.md" });
  });

  it("attaches images even when a desktop path is available", () => {
    const file = fakeFile("screenshot.png", "image/png", 2048);
    const result = classifyOsDropItem({
      file,
      isDirectoryEntry: false,
      absolutePath: "/Users/ryan/Desktop/screenshot.png",
    });
    expect(result).toEqual({ kind: "attachable-file", file, name: "screenshot.png" });
  });

  it("attaches images recognized by extension when the browser omits the MIME type", () => {
    const file = fakeFile("photo.heic", "", 2048);
    const result = classifyOsDropItem({
      file,
      isDirectoryEntry: false,
      absolutePath: "/Users/ryan/Desktop/photo.heic",
    });
    expect(result).toEqual({ kind: "attachable-file", file, name: "photo.heic" });
  });

  it("keeps directories with image-like names as path mentions", () => {
    const result = classifyOsDropItem({
      file: fakeFile("assets.png"),
      isDirectoryEntry: true,
      absolutePath: "/Users/ryan/proj/assets.png",
    });
    expect(result.kind).toBe("path-mention");
  });

  it("turns MP3 files with a desktop path into path mentions", () => {
    const result = classifyOsDropItem({
      file: fakeFile("interview.mp3", "audio/mpeg", 64),
      isDirectoryEntry: false,
      absolutePath: "/Users/ryan/proj/interview.mp3",
    });
    expect(result.kind).toBe("path-mention");
    expect(result.path).toBe("/Users/ryan/proj/interview.mp3");
  });
});

describe("partitionOsDropItems", () => {
  it("splits path mentions and unsupported names for desktop drops", () => {
    const items = [
      classifyOsDropItem({
        file: fakeFile("research"),
        isDirectoryEntry: true,
        absolutePath: "/ws/docs/research",
      }),
      classifyOsDropItem({
        file: fakeFile("a.md", "text/markdown", 4),
        isDirectoryEntry: false,
        absolutePath: "/ws/a.md",
      }),
      classifyOsDropItem({
        file: fakeFile("mystery"),
        isDirectoryEntry: true,
        absolutePath: null,
      }),
    ];
    const partitioned = partitionOsDropItems(items, "/ws");
    expect(partitioned.pathMentions).toEqual(["[research](docs/research)", "[a.md](a.md)"]);
    expect(partitioned.attachableFiles).toEqual([]);
    expect(partitioned.unsupportedNames).toEqual(["mystery"]);
  });

  it("dedupes identical path mentions", () => {
    const items = [
      classifyOsDropItem({
        file: fakeFile("research"),
        isDirectoryEntry: true,
        absolutePath: "/ws/docs/research",
      }),
      classifyOsDropItem({
        file: fakeFile("research"),
        isDirectoryEntry: true,
        absolutePath: "/ws/docs/research/",
      }),
    ];
    const partitioned = partitionOsDropItems(items, "/ws");
    expect(partitioned.pathMentions).toHaveLength(1);
  });
});
