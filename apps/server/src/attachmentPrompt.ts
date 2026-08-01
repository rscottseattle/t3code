import type { ChatAttachment, ChatFileAttachment, ChatImageAttachment } from "@t3tools/contracts";
import {
  decodeAttachmentText,
  formatFileAttachmentsAsPromptText,
  isTextLikeAttachment,
} from "@t3tools/shared/chatAttachments";

export function partitionChatAttachments(attachments: ReadonlyArray<ChatAttachment> | undefined): {
  readonly images: ReadonlyArray<ChatImageAttachment>;
  readonly files: ReadonlyArray<ChatFileAttachment>;
} {
  const images: ChatImageAttachment[] = [];
  const files: ChatFileAttachment[] = [];
  for (const attachment of attachments ?? []) {
    if (attachment.type === "image") {
      images.push(attachment);
    } else {
      files.push(attachment);
    }
  }
  return { images, files };
}

export function mergePromptWithFileAttachments(input: {
  readonly prompt: string;
  readonly files: ReadonlyArray<{ readonly name: string; readonly text: string }>;
}): string {
  const suffix = formatFileAttachmentsAsPromptText(input.files);
  if (suffix.length === 0) return input.prompt;
  if (input.prompt.trim().length === 0) return suffix;
  return `${input.prompt.trimEnd()}\n\n${suffix}`;
}

export function tryDecodeFileAttachmentText(input: {
  readonly attachment: ChatFileAttachment;
  readonly bytes: Uint8Array;
}): string | null {
  if (
    !isTextLikeAttachment({
      mimeType: input.attachment.mimeType,
      fileName: input.attachment.name,
    })
  ) {
    // Still try decode for octet-stream / unknown labeled as file.
    const decoded = decodeAttachmentText(input.bytes);
    return decoded;
  }
  return decodeAttachmentText(input.bytes);
}
