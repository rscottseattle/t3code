/**
 * Composer attachment helpers shared by web (drop/paste accept rules) and
 * server (persist + provider delivery).
 *
 * Images stay multimodal. Non-image files are accepted when they look like
 * common documents/text so agents can use them as context.
 */

const IMAGE_MIME_PREFIX = "image/";

/** Common text/document MIME types browsers report for dropped files. */
const TEXT_LIKE_MIME_TYPES = new Set([
  "application/csv",
  "application/javascript",
  "application/json",
  "application/ld+json",
  "application/sql",
  "application/toml",
  "application/typescript",
  "application/x-javascript",
  "application/x-ndjson",
  "application/x-sh",
  "application/x-sql",
  "application/x-yaml",
  "application/xml",
  "application/xhtml+xml",
  "application/yaml",
  "text/csv",
  "text/html",
  "text/javascript",
  "text/markdown",
  "text/mdx",
  "text/plain",
  "text/tab-separated-values",
  "text/tsv",
  "text/x-log",
  "text/x-markdown",
  "text/x-python",
  "text/x-script.python",
  "text/x-shellscript",
  "text/xml",
  "text/yaml",
  "text/yml",
]);

/**
 * Extensions treated as attachable non-image documents when MIME is empty or
 * generic (macOS often reports `""` or `application/octet-stream` for .md).
 */
const TEXT_LIKE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cfg",
  ".clj",
  ".cljs",
  ".cmd",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".cxx",
  ".env",
  ".ex",
  ".exs",
  ".go",
  ".h",
  ".hh",
  ".hpp",
  ".htm",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsonc",
  ".jsonl",
  ".jsx",
  ".kt",
  ".kts",
  ".less",
  ".log",
  ".lua",
  ".m",
  ".md",
  ".mdc",
  ".mdx",
  ".mjs",
  ".mm",
  ".php",
  ".pl",
  ".pm",
  ".properties",
  ".py",
  ".r",
  ".rb",
  ".rs",
  ".rst",
  ".sass",
  ".scala",
  ".scss",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".toml",
  ".ts",
  ".tsv",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
]);

/** Binary document types we still accept and store; providers may pass them natively. */
const BINARY_DOCUMENT_MIME_TYPES = new Set([
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/rtf",
]);

const BINARY_DOCUMENT_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".odt",
  ".ods",
  ".pdf",
  ".ppt",
  ".pptx",
  ".rtf",
  ".xls",
  ".xlsx",
]);

const SAFE_FILE_EXTENSIONS = new Set([
  ...TEXT_LIKE_EXTENSIONS,
  ...BINARY_DOCUMENT_EXTENSIONS,
  ".bin",
]);

const FILE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "application/json": ".json",
  "application/javascript": ".js",
  "application/pdf": ".pdf",
  "application/rtf": ".rtf",
  "application/sql": ".sql",
  "application/typescript": ".ts",
  "application/xml": ".xml",
  "application/x-yaml": ".yaml",
  "application/yaml": ".yaml",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/msword": ".doc",
  "text/csv": ".csv",
  "text/html": ".html",
  "text/javascript": ".js",
  "text/markdown": ".md",
  "text/plain": ".txt",
  "text/tab-separated-values": ".tsv",
  "text/xml": ".xml",
  "text/yaml": ".yaml",
};

export function fileExtensionFromName(fileName: string | undefined): string {
  const trimmed = fileName?.trim() ?? "";
  const match = /\.([a-z0-9]{1,16})$/i.exec(trimmed);
  return match ? `.${match[1]!.toLowerCase()}` : "";
}

export function isImageAttachmentMimeType(mimeType: string | undefined): boolean {
  return (mimeType ?? "").trim().toLowerCase().startsWith(IMAGE_MIME_PREFIX);
}

function isTextLikeMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.length === 0) return false;
  if (normalized.startsWith("text/")) return true;
  if (TEXT_LIKE_MIME_TYPES.has(normalized)) return true;
  // e.g. application/vnd.api+json, text/* already covered
  if (normalized.endsWith("+json") || normalized.endsWith("+xml") || normalized.endsWith("+yaml")) {
    return true;
  }
  return false;
}

export function isTextLikeAttachment(input: {
  readonly mimeType?: string | undefined;
  readonly fileName?: string | undefined;
}): boolean {
  const mime = (input.mimeType ?? "").trim().toLowerCase();
  if (isTextLikeMimeType(mime)) return true;
  if (mime === "application/octet-stream" || mime.length === 0) {
    return TEXT_LIKE_EXTENSIONS.has(fileExtensionFromName(input.fileName));
  }
  return TEXT_LIKE_EXTENSIONS.has(fileExtensionFromName(input.fileName));
}

export function isBinaryDocumentAttachment(input: {
  readonly mimeType?: string | undefined;
  readonly fileName?: string | undefined;
}): boolean {
  const mime = (input.mimeType ?? "").trim().toLowerCase();
  if (BINARY_DOCUMENT_MIME_TYPES.has(mime)) return true;
  return BINARY_DOCUMENT_EXTENSIONS.has(fileExtensionFromName(input.fileName));
}

const IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".tif",
  ".tiff",
  ".webp",
]);

export function isImageAttachment(input: {
  readonly mimeType?: string | undefined;
  readonly fileName?: string | undefined;
}): boolean {
  if (isImageAttachmentMimeType(input.mimeType)) return true;
  const mime = (input.mimeType ?? "").trim().toLowerCase();
  if (mime.length === 0 || mime === "application/octet-stream") {
    return IMAGE_EXTENSIONS.has(fileExtensionFromName(input.fileName));
  }
  return false;
}

/**
 * Whether a dropped/pasted File should become a composer attachment.
 * Images and common document/text types are accepted.
 */
export function isAttachableComposerFile(input: {
  readonly mimeType?: string | undefined;
  readonly fileName?: string | undefined;
}): boolean {
  if (isImageAttachment(input)) return true;
  if (isTextLikeAttachment(input)) return true;
  if (isBinaryDocumentAttachment(input)) return true;
  return false;
}

/**
 * Infer a stable MIME for storage when the browser leaves type empty.
 */
export function resolveComposerAttachmentMimeType(input: {
  readonly mimeType?: string | undefined;
  readonly fileName?: string | undefined;
}): string {
  const mime = (input.mimeType ?? "").trim().toLowerCase();
  if (mime.length > 0 && mime !== "application/octet-stream") {
    return mime;
  }

  const extension = fileExtensionFromName(input.fileName);
  switch (extension) {
    case ".md":
    case ".mdc":
    case ".mdx":
      return "text/markdown";
    case ".csv":
      return "text/csv";
    case ".tsv":
      return "text/tab-separated-values";
    case ".html":
    case ".htm":
      return "text/html";
    case ".json":
    case ".jsonc":
      return "application/json";
    case ".jsonl":
      return "application/x-ndjson";
    case ".yaml":
    case ".yml":
      return "application/yaml";
    case ".xml":
      return "application/xml";
    case ".js":
    case ".mjs":
      return "text/javascript";
    case ".ts":
    case ".tsx":
      return "application/typescript";
    case ".css":
      return "text/css";
    case ".txt":
    case ".log":
      return "text/plain";
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".doc":
      return "application/msword";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".rtf":
      return "application/rtf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".avif":
      return "image/avif";
    case ".bmp":
      return "image/bmp";
    case ".heic":
      return "image/heic";
    case ".heif":
      return "image/heif";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    case ".ico":
      return "image/x-icon";
    default:
      return mime.length > 0 ? mime : "application/octet-stream";
  }
}

export function inferFileAttachmentExtension(input: {
  readonly mimeType: string;
  readonly fileName?: string | undefined;
}): string {
  const key = input.mimeType.toLowerCase();
  const fromMime = Object.hasOwn(FILE_EXTENSION_BY_MIME_TYPE, key)
    ? FILE_EXTENSION_BY_MIME_TYPE[key]
    : undefined;
  if (fromMime) return fromMime;

  const fromName = fileExtensionFromName(input.fileName);
  if (fromName && SAFE_FILE_EXTENSIONS.has(fromName)) {
    return fromName;
  }

  return ".bin";
}

/**
 * Format one or more text files for inclusion in a provider prompt.
 */
export function formatFileAttachmentsAsPromptText(
  files: ReadonlyArray<{ readonly name: string; readonly text: string }>,
): string {
  if (files.length === 0) return "";
  return files
    .map((file) => {
      const fence = pickFence(file.text);
      return `Attached file: ${file.name}\n${fence}\n${file.text}\n${fence}`;
    })
    .join("\n\n");
}

function pickFence(text: string): string {
  let fence = "```";
  while (text.includes(fence)) {
    fence += "`";
  }
  return fence;
}

/**
 * Decode attachment bytes as UTF-8 text when the content is text-like enough
 * for prompt inlining. Returns null for binary payloads.
 */
export function decodeAttachmentText(bytes: Uint8Array): string | null {
  if (bytes.byteLength === 0) return "";
  // Reject if lots of NUL bytes (clear binary signal).
  let nulCount = 0;
  const sampleLength = Math.min(bytes.byteLength, 4096);
  for (let i = 0; i < sampleLength; i += 1) {
    if (bytes[i] === 0) {
      nulCount += 1;
      if (nulCount > 2) return null;
    }
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    // If replacement chars dominate, treat as binary.
    const replacementCount = (text.match(/\uFFFD/g) ?? []).length;
    if (replacementCount > 0 && replacementCount / Math.max(text.length, 1) > 0.02) {
      return null;
    }
    return text;
  } catch {
    return null;
  }
}
