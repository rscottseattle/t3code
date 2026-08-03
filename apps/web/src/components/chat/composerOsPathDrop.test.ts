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

  it("prefers fs.stat directory flag over a false webkit entry", () => {
    const result = classifyOsDropItem({
      file: fakeFile("research", "", 0),
      isDirectoryEntry: false,
      absolutePath: "/Users/ryan/proj/docs/research",
      isDirectoryPath: true,
    });
    expect(result.kind).toBe("path-mention");
  });

  it("rejects directories without a resolvable path", () => {
    const result = classifyOsDropItem({
      file: fakeFile("research"),
      isDirectoryEntry: true,
      absolutePath: null,
    });
    expect(result).toEqual({ kind: "unsupported", name: "research" });
  });

  it("keeps attachable files as attachments", () => {
    const file = fakeFile("notes.md", "text/markdown", 12);
    const result = classifyOsDropItem({
      file,
      isDirectoryEntry: false,
      absolutePath: "/Users/ryan/proj/notes.md",
    });
    expect(result).toEqual({ kind: "attachable-file", file, name: "notes.md" });
  });

  it("turns non-attachable files with a path into path mentions", () => {
    const result = classifyOsDropItem({
      file: fakeFile("payload.bin", "application/octet-stream", 64),
      isDirectoryEntry: false,
      absolutePath: "/Users/ryan/proj/payload.bin",
    });
    expect(result.kind).toBe("path-mention");
    expect(result.path).toBe("/Users/ryan/proj/payload.bin");
  });
});

describe("partitionOsDropItems", () => {
  it("splits mentions, attachments, and unsupported names", () => {
    const md = fakeFile("a.md", "text/markdown", 4);
    const items = [
      classifyOsDropItem({
        file: fakeFile("research"),
        isDirectoryEntry: true,
        absolutePath: "/ws/docs/research",
      }),
      classifyOsDropItem({
        file: md,
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
    expect(partitioned.pathMentions).toEqual(["[research](docs/research)"]);
    expect(partitioned.attachableFiles).toEqual([md]);
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
