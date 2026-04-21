"use client";

import * as React from "react";
import type { HarnessName } from "@/lib/harness-catalog";
import type { SandboxProviderName } from "agentbox-sdk";

export type ChatRole = "user" | "assistant";

export interface ChatFile {
  url: string;
  mediaType: string;
  filename?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  files?: ChatFile[];
  harness?: HarnessName;
  sandboxProvider?: SandboxProviderName;
  model?: string;
  events: unknown[];
  status: "pending" | "streaming" | "done" | "error";
  error?: string;
}

interface SendArgs {
  input: string;
  harness: HarnessName;
  model: string;
  sandboxProvider: SandboxProviderName;
  files?: ChatFile[];
}

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function updateMessage(
  messages: ChatMessage[],
  id: string,
  patch: Partial<ChatMessage> | ((prev: ChatMessage) => Partial<ChatMessage>),
): ChatMessage[] {
  return messages.map((m) => {
    if (m.id !== id) return m;
    const next = typeof patch === "function" ? patch(m) : patch;
    return { ...m, ...next };
  });
}

export function useAgentChat() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  // In-memory only: lost on refresh, which is the desired behavior.
  const sessionIdRef = React.useRef<string | null>(null);

  const send = React.useCallback(
    async ({ input, harness, model, sandboxProvider, files }: SendArgs) => {
      if (isRunning) return;

      const userMessage: ChatMessage = {
        id: randomId(),
        role: "user",
        text: input,
        files: files && files.length > 0 ? files : undefined,
        events: [],
        status: "done",
      };
      const assistantMessage: ChatMessage = {
        id: randomId(),
        role: "assistant",
        text: "",
        harness,
        model,
        sandboxProvider,
        events: [],
        status: "pending",
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsRunning(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sandboxProvider,
            harness,
            model,
            input,
            files,
            resumeSessionId: sessionIdRef.current ?? undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          let message = `Request failed with status ${response.status}`;
          try {
            const json = (await response.json()) as { error?: string };
            if (json?.error) message = json.error;
          } catch {
            // ignore
          }
          setMessages((prev) =>
            updateMessage(prev, assistantMessage.id, {
              status: "error",
              error: message,
            }),
          );
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let payload: {
              type: string;
              event?: unknown;
              message?: string;
              text?: string;
              sessionId?: string;
            };
            try {
              payload = JSON.parse(line);
            } catch {
              continue;
            }

            if (payload.type === "started") {
              setMessages((prev) =>
                updateMessage(prev, assistantMessage.id, {
                  status: "streaming",
                }),
              );
            } else if (payload.type === "raw" && payload.event) {
              setMessages((prev) =>
                updateMessage(prev, assistantMessage.id, (m) => ({
                  events: [...m.events, payload.event],
                  status: "streaming",
                })),
              );
            } else if (payload.type === "done") {
              if (payload.sessionId) {
                sessionIdRef.current = payload.sessionId;
              }
              setMessages((prev) =>
                updateMessage(prev, assistantMessage.id, (m) => ({
                  status: "done",
                  text: payload.text ?? m.text,
                })),
              );
            } else if (payload.type === "error") {
              setMessages((prev) =>
                updateMessage(prev, assistantMessage.id, {
                  status: "error",
                  error: payload.message,
                }),
              );
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") {
          setMessages((prev) =>
            updateMessage(prev, assistantMessage.id, (m) => ({
              status: m.events.length ? "done" : "error",
              error: m.events.length ? undefined : "Aborted.",
            })),
          );
        } else {
          setMessages((prev) =>
            updateMessage(prev, assistantMessage.id, {
              status: "error",
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      } finally {
        abortRef.current = null;
        setIsRunning(false);
      }
    },
    [isRunning],
  );

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = React.useCallback(() => {
    if (isRunning) return;
    setMessages([]);
    sessionIdRef.current = null;
  }, [isRunning]);

  return { messages, isRunning, send, stop, clear };
}
