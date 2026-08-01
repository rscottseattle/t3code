import { describe, expect, it } from "vite-plus/test";

import {
  decodeAttachmentText,
  formatFileAttachmentsAsPromptText,
  isAttachableComposerFile,
  isImageAttachment,
  isTextLikeAttachment,
  resolveComposerAttachmentMimeType,
} from "./chatAttachments.ts";

describe("chatAttachments", () => {
  it("accepts common document and text drops even with empty mime types", () => {
    expect(isAttachableComposerFile({ mimeType: "", fileName: "notes.md" })).toBe(true);
    expect(isAttachableComposerFile({ mimeType: "", fileName: "data.csv" })).toBe(true);
    expect(isAttachableComposerFile({ mimeType: "text/html", fileName: "page.html" })).toBe(true);
    expect(isAttachableComposerFile({ mimeType: "application/pdf", fileName: "doc.pdf" })).toBe(
      true,
    );
    expect(isAttachableComposerFile({ mimeType: "image/png", fileName: "shot.png" })).toBe(true);
  });

  it("rejects unknown binary extensions", () => {
    expect(isAttachableComposerFile({ mimeType: "", fileName: "payload.exe" })).toBe(false);
    expect(isAttachableComposerFile({ mimeType: "application/zip", fileName: "a.zip" })).toBe(
      false,
    );
  });

  it("classifies images by extension when mime is missing", () => {
    expect(isImageAttachment({ mimeType: "", fileName: "photo.PNG" })).toBe(true);
    expect(isImageAttachment({ mimeType: "", fileName: "notes.md" })).toBe(false);
  });

  it("treats markdown and csv as text-like", () => {
    expect(isTextLikeAttachment({ mimeType: "", fileName: "a.md" })).toBe(true);
    expect(isTextLikeAttachment({ mimeType: "text/csv", fileName: "a.csv" })).toBe(true);
  });

  it("infers stable mime types for empty browser types", () => {
    expect(resolveComposerAttachmentMimeType({ mimeType: "", fileName: "a.md" })).toBe(
      "text/markdown",
    );
    expect(resolveComposerAttachmentMimeType({ mimeType: "", fileName: "a.csv" })).toBe("text/csv");
  });

  it("formats file prompt blocks with safe fences", () => {
    expect(
      formatFileAttachmentsAsPromptText([{ name: "a.md", text: "hello ``` world" }]),
    ).toContain("Attached file: a.md");
    expect(
      formatFileAttachmentsAsPromptText([{ name: "a.md", text: "hello ``` world" }]),
    ).toContain("````");
  });

  it("decodes utf-8 text and rejects binary payloads", () => {
    expect(decodeAttachmentText(new TextEncoder().encode("hello"))).toBe("hello");
    expect(decodeAttachmentText(new Uint8Array([0, 1, 2, 0, 0, 0]))).toBeNull();
  });
});
