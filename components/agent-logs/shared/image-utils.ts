export type Base64ImageBlock =
  | {
      type?: string;
      source?: {
        type?: string;
        data?: string;
        media_type?: string;
      };
    }
  | {
      type?: string;
      data?: string;
      mimeType?: string;
      media_type?: string;
      source?: undefined;
    };

export function isBase64ImageBlock(value: unknown): value is Base64ImageBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as {
    type?: unknown;
    source?: {
      type?: unknown;
      data?: unknown;
      media_type?: unknown;
    };
    data?: unknown;
    mimeType?: unknown;
    media_type?: unknown;
  };

  if (block.type !== "image") {
    return false;
  }

  if (block.source && typeof block.source === "object") {
    return (
      (block.source.type === "base64" || block.source.type === undefined) &&
      typeof block.source.data === "string" &&
      typeof block.source.media_type === "string"
    );
  }

  if (typeof block.data === "string") {
    return (
      typeof block.mimeType === "string" ||
      typeof block.media_type === "string" ||
      true
    );
  }

  return false;
}

export function getBase64ImageSrc(block: Base64ImageBlock): string | null {
  if (block.source && typeof block.source === "object") {
    const { data, media_type } = block.source;
    if (typeof data === "string" && typeof media_type === "string") {
      return `data:${media_type};base64,${data}`;
    }
  }

  if ("data" in block && typeof block.data === "string") {
    const mime = block.mimeType || block.media_type || "image/png";
    return `data:${mime};base64,${block.data}`;
  }

  return null;
}
