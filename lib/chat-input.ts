import type { UserContent, UserContentPart } from "agentbox-sdk";
import { z } from "zod";

export const filePartSchema = z.object({
  url: z.string().min(1),
  mediaType: z.string().min(1),
  filename: z.string().optional(),
});

export type FilePart = z.infer<typeof filePartSchema>;

export function buildAgentInput(
  text: string,
  files: FilePart[] | undefined,
): UserContent {
  const trimmed = text.trim();
  if (!files || files.length === 0) {
    return trimmed;
  }

  const parts: UserContentPart[] = [];
  if (trimmed.length > 0) {
    parts.push({ type: "text", text: trimmed });
  }
  for (const file of files) {
    if (file.mediaType.startsWith("image/")) {
      parts.push({
        type: "image",
        image: file.url,
        mediaType: file.mediaType,
      });
    } else {
      parts.push({
        type: "file",
        data: file.url,
        mediaType: file.mediaType,
        filename: file.filename,
      });
    }
  }
  return parts;
}
