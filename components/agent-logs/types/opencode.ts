export interface OpenCodeToolState {
  status?: string;
  input?: Record<string, unknown>;
  output?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  time?: {
    start?: number;
    end?: number;
  };
  attachments?: Array<{
    id?: string;
    sessionID?: string;
    messageID?: string;
    type?: string;
    mime?: string;
    url?: string;
  }>;
}

export interface OpenCodeTokens {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: {
    read?: number;
    write?: number;
  };
}

interface OpenCodeBasePart {
  id?: string;
  sessionID?: string;
  messageID?: string;
}

interface OpenCodeTextPart extends OpenCodeBasePart {
  type: "text";
  text?: string;
  metadata?: Record<string, unknown>;
  time?: {
    start?: number;
    end?: number;
  };
}

interface OpenCodeToolPart extends OpenCodeBasePart {
  type: "tool";
  callID?: string;
  tool?: string;
  state?: OpenCodeToolState;
  metadata?: Record<string, unknown>;
}

interface OpenCodeStepStartPart extends OpenCodeBasePart {
  type: "step-start";
  snapshot?: string;
}

interface OpenCodeStepFinishPart extends OpenCodeBasePart {
  type: "step-finish";
  reason?: string;
  snapshot?: string;
  cost?: number;
  tokens?: OpenCodeTokens;
}

interface OpenCodeUnknownPart extends OpenCodeBasePart {
  type?: string;
  [key: string]: unknown;
}

export type OpenCodeLogPart =
  | OpenCodeTextPart
  | OpenCodeToolPart
  | OpenCodeStepStartPart
  | OpenCodeStepFinishPart
  | OpenCodeUnknownPart;

export interface OpenCodeMessageInfo {
  id?: string;
  role?: string;
  sessionID?: string;
  [key: string]: unknown;
}

export interface OpenCodeEventProperties {
  sessionID?: string;
  part?: OpenCodeLogPart;
  info?: OpenCodeMessageInfo;
  messageID?: string;
  partID?: string;
  field?: string;
  delta?: string;
  [key: string]: unknown;
}

export interface OpenCodeEvent {
  type: string;
  timestamp?: number;
  sessionID?: string;
  properties?: OpenCodeEventProperties;
  // Some legacy callers expose the part at the top-level; keep as optional.
  part?: OpenCodeLogPart;
  metadata?: Record<string, unknown>;
}
