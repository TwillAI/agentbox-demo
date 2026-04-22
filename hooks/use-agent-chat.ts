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

export interface QueuedMessage {
  id: string;
  text: string;
  files?: ChatFile[];
  status: "pending" | "error";
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
  const [queued, setQueued] = React.useState<QueuedMessage[]>([]);
  const [isRunning, setIsRunning] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  // In-memory only: lost on refresh, which is the desired behavior.
  const sessionIdRef = React.useRef<string | null>(null);
  // Identifies the in-flight SDK run so we can inject messages mid-run.
  const runIdRef = React.useRef<string | null>(null);
  // Which assistant message should receive the next raw events. Rotated every
  // time the SDK emits a `message.injected` event so each injected turn gets
  // its own bubble in the conversation.
  const activeAssistantIdRef = React.useRef<string | null>(null);
  // Snapshot of the current harness/model so promoted queue items render consistently.
  const runContextRef = React.useRef<{
    harness: HarnessName;
    model: string;
    sandboxProvider: SandboxProviderName;
  } | null>(null);

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
      activeAssistantIdRef.current = assistantMessage.id;
      runContextRef.current = { harness, model, sandboxProvider };

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
              runId?: string;
              content?: string;
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
              if (payload.runId) {
                runIdRef.current = payload.runId;
              }
              setMessages((prev) =>
                updateMessage(prev, assistantMessage.id, {
                  status: "streaming",
                }),
              );
            } else if (payload.type === "raw" && payload.event) {
              const targetId =
                activeAssistantIdRef.current ?? assistantMessage.id;
              setMessages((prev) =>
                updateMessage(prev, targetId, (m) => ({
                  events: [...m.events, payload.event],
                  status: "streaming",
                })),
              );
            } else if (payload.type === "injected") {
              const ctx = runContextRef.current ?? {
                harness,
                model,
                sandboxProvider,
              };
              let promotedFiles: ChatFile[] | undefined;
              let promotedText: string | undefined;
              // Pop the oldest pending queued item and adopt its text/files so
              // the promoted user bubble preserves any attachments.
              setQueued((prev) => {
                const idx = prev.findIndex((q) => q.status === "pending");
                if (idx === -1) return prev;
                const item = prev[idx];
                promotedFiles = item.files;
                promotedText = item.text;
                return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
              });

              const newUser: ChatMessage = {
                id: randomId(),
                role: "user",
                text: promotedText ?? payload.content ?? "",
                files:
                  promotedFiles && promotedFiles.length > 0
                    ? promotedFiles
                    : undefined,
                events: [],
                status: "done",
              };
              const newAssistant: ChatMessage = {
                id: randomId(),
                role: "assistant",
                text: "",
                harness: ctx.harness,
                model: ctx.model,
                sandboxProvider: ctx.sandboxProvider,
                events: [],
                status: "streaming",
              };
              const previousAssistantId = activeAssistantIdRef.current;
              activeAssistantIdRef.current = newAssistant.id;
              setMessages((prev) => {
                // Close out the prior assistant turn so its "Running" shimmer
                // stops and any in-flight tool rows settle into their final
                // state. Subsequent events go to the new assistant bubble.
                const closed = previousAssistantId
                  ? updateMessage(prev, previousAssistantId, (m) =>
                      m.status === "streaming" || m.status === "pending"
                        ? { status: "done" }
                        : {},
                    )
                  : prev;
                return [...closed, newUser, newAssistant];
              });
            } else if (payload.type === "done") {
              if (payload.sessionId) {
                sessionIdRef.current = payload.sessionId;
              }
              const targetId =
                activeAssistantIdRef.current ?? assistantMessage.id;
              setMessages((prev) =>
                updateMessage(prev, targetId, (m) => ({
                  status: "done",
                  text: payload.text ?? m.text,
                })),
              );
            } else if (payload.type === "error") {
              const targetId =
                activeAssistantIdRef.current ?? assistantMessage.id;
              setMessages((prev) =>
                updateMessage(prev, targetId, {
                  status: "error",
                  error: payload.message,
                }),
              );
            }
          }
        }
      } catch (err) {
        const targetId = activeAssistantIdRef.current ?? assistantMessage.id;
        if ((err as { name?: string })?.name === "AbortError") {
          setMessages((prev) =>
            updateMessage(prev, targetId, (m) => ({
              status: m.events.length ? "done" : "error",
              error: m.events.length ? undefined : "Aborted.",
            })),
          );
        } else {
          setMessages((prev) =>
            updateMessage(prev, targetId, {
              status: "error",
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      } finally {
        abortRef.current = null;
        runIdRef.current = null;
        activeAssistantIdRef.current = null;
        runContextRef.current = null;
        setIsRunning(false);
      }
    },
    [isRunning],
  );

  const enqueue = React.useCallback(
    async (args: SendArgs) => {
      // When nothing is running we simply start a fresh run. This keeps the
      // non-streaming path identical to the previous `send` behavior.
      if (!isRunning) {
        await send(args);
        return;
      }

      const runId = runIdRef.current;
      if (!runId) {
        // No active run id yet (e.g. warmup race). Skip silently; the next
        // Enter press will either queue or start a run correctly.
        return;
      }

      const item: QueuedMessage = {
        id: randomId(),
        text: args.input,
        files: args.files && args.files.length > 0 ? args.files : undefined,
        status: "pending",
      };
      setQueued((prev) => [...prev, item]);

      try {
        const response = await fetch(
          `/api/chat/runs/${encodeURIComponent(runId)}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: args.input, files: args.files }),
          },
        );

        if (!response.ok) {
          let message = `Failed to queue message (HTTP ${response.status}).`;
          try {
            const json = (await response.json()) as { error?: string };
            if (json?.error) message = json.error;
          } catch {
            // ignore
          }
          setQueued((prev) =>
            prev.map((q) =>
              q.id === item.id ? { ...q, status: "error", error: message } : q,
            ),
          );
        }
        // On success we leave the queued item in `pending` state. The streaming
        // loop removes it when the matching `injected` event arrives and
        // promotes it into a real user bubble.
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error ?? "Error");
        setQueued((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "error", error: message } : q,
          ),
        );
      }
    },
    [isRunning, send],
  );

  const removeQueued = React.useCallback((id: string) => {
    // Best-effort cancellation. The server-side POST may have already reached
    // `run.sendMessage`, in which case the corresponding `injected` event
    // will still arrive; we defend against that by matching on id only.
    setQueued((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const stop = React.useCallback(() => {
    // Ask the SDK to stop the run server-side. The route handler translates
    // this into `run.abort()` on the registered AgentRun, which is the
    // authoritative way to halt the agent.
    //
    // We intentionally do NOT abort the local fetch here: after the SDK
    // aborts, the server still needs to flush a final `done` payload
    // carrying the run's sessionId so the next message can resume the same
    // provider conversation. Tearing down the fetch early would cancel the
    // ReadableStream before that event is delivered, causing the next user
    // message to start a brand-new conversation with no prior context.
    const runId = runIdRef.current;
    if (runId) {
      fetch(`/api/chat/runs/${encodeURIComponent(runId)}`, {
        method: "DELETE",
      }).catch(() => {
        // Best-effort. If the DELETE itself fails we fall back to aborting
        // the local fetch so the UI doesn't get stuck in a running state.
        abortRef.current?.abort();
      });
    } else {
      // No run id yet (warmup phase) — nothing to tell the server about,
      // so aborting the in-flight fetch is the only option.
      abortRef.current?.abort();
    }
  }, []);

  const clear = React.useCallback(() => {
    if (isRunning) return;
    setMessages([]);
    setQueued([]);
    sessionIdRef.current = null;
    runIdRef.current = null;
    activeAssistantIdRef.current = null;
    runContextRef.current = null;
  }, [isRunning]);

  return {
    messages,
    queued,
    isRunning,
    send,
    enqueue,
    removeQueued,
    stop,
    clear,
  };
}
