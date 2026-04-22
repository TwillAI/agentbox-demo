"use client";

import * as React from "react";
import {
  TriangleAlert,
  Boxes,
  Bot,
  Plus,
  Star,
  Trash2,
  ListTodo,
} from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import { SettingPicker } from "@/components/setting-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AgentJobLogsDisplay } from "@/components/agent-logs";
import {
  HARNESSES,
  HARNESS_LABELS,
  HARNESS_MODELS,
  SANDBOX_LABELS,
  SUPPORTED_SANDBOXES,
  defaultModelFor,
  providerForModel,
  type HarnessName,
} from "@/lib/harness-catalog";
import { AgentProvider, SandboxProvider } from "agentbox-sdk/enums";
import type { SandboxProviderName } from "agentbox-sdk";
import {
  useAgentChat,
  type ChatMessage,
  type QueuedMessage,
} from "@/hooks/use-agent-chat";
import { cn } from "@/lib/utils";

type ChatStatus = React.ComponentProps<typeof PromptInputSubmit>["status"];

export default function HomePage() {
  const [sandboxProvider, setSandboxProvider] =
    React.useState<SandboxProviderName>(SandboxProvider.Vercel);
  const [harness, setHarness] = React.useState<HarnessName>(
    AgentProvider.ClaudeCode,
  );
  const [model, setModel] = React.useState<string>(
    defaultModelFor(AgentProvider.ClaudeCode),
  );
  const [warmupState, setWarmupState] = React.useState<
    "idle" | "warming" | "ready" | "error"
  >("idle");
  const [warmupError, setWarmupError] = React.useState<string | null>(null);
  const [warmupToken, setWarmupToken] = React.useState(0);

  const { messages, queued, isRunning, enqueue, removeQueued, stop, clear } =
    useAgentChat();
  const hasMessages = messages.length > 0;

  React.useEffect(() => {
    if (!HARNESS_MODELS[harness].includes(model)) {
      setModel(defaultModelFor(harness));
    }
  }, [harness, model]);

  // Warm up selected sandbox on mount and whenever it changes.
  // Keep the screen blank ("idle") until either the request resolves or
  // a short delay elapses -- this avoids a sub-second loader flicker when
  // the sandbox is already warm.
  React.useEffect(() => {
    let cancelled = false;
    let settled = false;
    setWarmupState("idle");
    setWarmupError(null);

    const flickerGuard = setTimeout(() => {
      if (!cancelled && !settled) {
        setWarmupState("warming");
      }
    }, 600);

    (async () => {
      try {
        const res = await fetch("/api/warmup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxProvider }),
        });
        if (cancelled) return;
        settled = true;
        clearTimeout(flickerGuard);
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          setWarmupError(
            payload?.message ??
              payload?.error ??
              `Warmup failed (HTTP ${res.status}).`,
          );
          setWarmupState("error");
        } else {
          setWarmupState("ready");
        }
      } catch (error) {
        if (cancelled) return;
        settled = true;
        clearTimeout(flickerGuard);
        setWarmupError(
          error instanceof Error ? error.message : String(error ?? "Unknown"),
        );
        setWarmupState("error");
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(flickerGuard);
    };
  }, [sandboxProvider, warmupToken]);

  const onSubmit = React.useCallback(
    async (
      message: PromptInputMessage,
      event: React.FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();
      const text = message.text?.trim() ?? "";
      const files = (message.files ?? [])
        .filter((f) => f.url && f.mediaType)
        .map((f) => ({
          url: f.url!,
          mediaType: f.mediaType!,
          filename: f.filename,
        }));
      if (!text && files.length === 0) return;
      await enqueue({ input: text, harness, model, sandboxProvider, files });
    },
    [harness, model, sandboxProvider, enqueue],
  );

  const status: ChatStatus = isRunning ? "streaming" : undefined;

  const promptInput = (
    <PromptInputCard
      status={status}
      isRunning={isRunning}
      onSubmit={onSubmit}
      onStop={stop}
      harness={harness}
      model={model}
      setModel={setModel}
      placeholder={
        isRunning
          ? "Queue a follow-up message..."
          : `Ask ${HARNESS_LABELS[harness]} to do something inside the ${SANDBOX_LABELS[sandboxProvider] ?? sandboxProvider} sandbox...`
      }
      disabled={warmupState !== "ready"}
    />
  );

  const queuedList =
    queued.length > 0 ? (
      <QueuedMessagesList queued={queued} onRemove={removeQueued} />
    ) : null;

  return (
    <div className="bg-background flex h-dvh min-h-0 w-full flex-col">
      <Header
        showNewChat={hasMessages}
        onNewChat={clear}
        disabled={isRunning}
      />

      <main className="relative mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-4">
        {hasMessages ? (
          <>
            <WarningBanner />
            <Conversation className="">
              <ConversationContent className="py-4 px-2">
                {messages.map((m) => (
                  <ChatMessageView key={m.id} message={m} />
                ))}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
            {queuedList}
            {promptInput}
          </>
        ) : (
          <>
            <div className="pointer-events-none absolute inset-x-6 top-4 z-10">
              <div className="pointer-events-auto">
                <WarningBanner />
              </div>
            </div>
            <ComposeView
              sandboxLabel={SANDBOX_LABELS[sandboxProvider] ?? sandboxProvider}
              harnessLabel={HARNESS_LABELS[harness]}
              model={model}
              warmupState={warmupState}
              warmupError={warmupError}
              onRetry={() => setWarmupToken((n) => n + 1)}
            >
              {promptInput}
              <SandboxHarnessBar
                sandboxProvider={sandboxProvider}
                setSandboxProvider={setSandboxProvider}
                harness={harness}
                setHarness={setHarness}
                disabled={warmupState === "warming"}
              />
            </ComposeView>
          </>
        )}
      </main>
    </div>
  );
}

interface HeaderProps {
  showNewChat?: boolean;
  onNewChat?: () => void;
  disabled?: boolean;
}

function Header({ showNewChat, onNewChat, disabled }: HeaderProps) {
  return (
    <header className="border-border bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 w-full border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">AgentBox Demo</span>
            <span className="text-muted-foreground text-xs">
              Coding agents in isolated sandboxes
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href="https://github.com/TwillAI/agentbox-demo"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "h-8 text-xs hidden sm:inline-flex",
            })}
          >
            App Source
          </a>
          <a
            href="https://github.com/TwillAI/agentbox-sdk"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({
              variant: "default",
              size: "sm",
              className: "h-8 gap-1.5 text-xs hidden sm:inline-flex",
            })}
          >
            <Star className="size-3.5 fill-current" />
            AgentBox SDK
          </a>
          {showNewChat ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={onNewChat}
              disabled={disabled}
            >
              <Plus className="size-3.5" />
              New chat
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function WarningBanner() {
  return (
    <Alert className="border-amber-500/40 bg-amber-50/60 text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100">
      <TriangleAlert className="size-4 text-amber-600 dark:text-amber-300" />
      <AlertTitle className="text-amber-900 dark:text-amber-100">
        Shared sandbox demo
      </AlertTitle>
      <AlertDescription className="text-amber-900/80 dark:text-amber-100/80">
        Chats reuse one sandbox per provider to keep costs low. Anything you
        say, write, or run may be visible to other users. Do not paste secrets.
      </AlertDescription>
    </Alert>
  );
}

interface ComposeViewProps {
  sandboxLabel: string;
  harnessLabel: string;
  model: string;
  warmupState: "idle" | "warming" | "ready" | "error";
  warmupError: string | null;
  onRetry: () => void;
  children: React.ReactNode;
}

function ComposeView({
  sandboxLabel,
  harnessLabel,
  model,
  warmupState,
  warmupError,
  onRetry,
  children,
}: ComposeViewProps) {
  // During "idle" (first ~600ms of the warmup request) render nothing so we
  // don't flash a loader when the sandbox is already warm.
  if (warmupState === "idle") {
    return <div className="flex flex-1 flex-col items-center justify-center" />;
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        {warmupState === "warming" ? (
          <div className="space-y-1">
            <Shimmer as="h1" className="text-base font-medium tracking-tight">
              {`Warming up the ${sandboxLabel} sandbox...`}
            </Shimmer>
            <p className="text-muted-foreground text-xs">
              This can take up to a minute on cold starts.
            </p>
          </div>
        ) : warmupState === "error" ? (
          <>
            <span className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
              <TriangleAlert className="size-5" />
            </span>
            <div className="space-y-1">
              <h1 className="text-base font-medium tracking-tight">
                Could not boot the sandbox
              </h1>
              <p className="text-muted-foreground max-w-md text-xs">
                {warmupError ?? "Sandbox failed to start."}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">
                {`Chatting with ${harnessLabel} (${model}) on ${sandboxLabel}.`}
              </h1>
            </div>
          </>
        )}
      </div>
      {warmupState !== "warming" ? (
        <div className="flex w-full max-w-2xl flex-col gap-3">{children}</div>
      ) : null}
    </div>
  );
}

interface PromptInputCardProps {
  status: ChatStatus;
  isRunning: boolean;
  onSubmit: (
    message: PromptInputMessage,
    event: React.FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
  onStop: () => void;
  harness: HarnessName;
  model: string;
  setModel: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}

function PromptInputCard({
  status,
  isRunning,
  onSubmit,
  onStop,
  harness,
  model,
  setModel,
  placeholder,
  disabled,
}: PromptInputCardProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Focus the textarea once it becomes enabled (e.g. after sandbox warmup)
  // and whenever a run finishes so the user can keep typing.
  React.useEffect(() => {
    if (disabled || isRunning) return;
    textareaRef.current?.focus();
  }, [disabled, isRunning]);

  return (
    <PromptInput multiple globalDrop onSubmit={onSubmit}>
      <PromptInputAttachmentsDisplay />
      <PromptInputBody>
        <PromptInputTextarea
          ref={textareaRef}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools className="flex-wrap gap-0">
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger disabled={disabled} />
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
          <SettingPicker
            label="Model"
            value={model}
            onValueChange={setModel}
            options={HARNESS_MODELS[harness].map((m) => ({
              value: m,
              label: m,
              provider: providerForModel(harness, m),
            }))}
          />
        </PromptInputTools>
        <PromptInputSubmit
          status={status}
          onStop={onStop}
          disabled={disabled && !isRunning}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}

function PromptInputAttachmentsDisplay() {
  const attachments = usePromptInputAttachments();

  const handleRemove = React.useCallback(
    (id: string) => attachments.remove(id),
    [attachments],
  );

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments variant="inline">
      {attachments.files.map((file) => (
        <AttachmentItem
          key={file.id}
          attachment={file}
          onRemove={handleRemove}
        />
      ))}
    </Attachments>
  );
}

interface AttachmentItemProps {
  attachment: {
    id: string;
    type: "file";
    filename?: string;
    mediaType: string;
    url: string;
  };
  onRemove: (id: string) => void;
}

const AttachmentItem = React.memo(function AttachmentItem({
  attachment,
  onRemove,
}: AttachmentItemProps) {
  const handleRemove = React.useCallback(
    () => onRemove(attachment.id),
    [onRemove, attachment.id],
  );

  return (
    <Attachment data={attachment} onRemove={handleRemove}>
      <AttachmentPreview />
      <AttachmentRemove />
    </Attachment>
  );
});

interface SandboxHarnessBarProps {
  sandboxProvider: SandboxProviderName;
  setSandboxProvider: (value: SandboxProviderName) => void;
  harness: HarnessName;
  setHarness: (value: HarnessName) => void;
  disabled?: boolean;
}

function SandboxHarnessBar({
  sandboxProvider,
  setSandboxProvider,
  harness,
  setHarness,
  disabled,
}: SandboxHarnessBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <SettingPicker
        icon={<Boxes className="size-3.5" />}
        label="Sandbox"
        tooltip="Sandbox provider"
        value={sandboxProvider}
        onValueChange={(v) => setSandboxProvider(v as SandboxProviderName)}
        disabled={disabled}
        options={SUPPORTED_SANDBOXES.map((id) => ({
          value: id,
          label: SANDBOX_LABELS[id] ?? id,
        }))}
      />
      <SettingPicker
        icon={<Bot className="size-3.5" />}
        label="Harness"
        tooltip="Harness provider"
        value={harness}
        onValueChange={(v) => setHarness(v as HarnessName)}
        disabled={disabled}
        options={HARNESSES.map((h) => ({
          value: h,
          label: HARNESS_LABELS[h],
        }))}
      />
    </div>
  );
}

function ChatMessageView({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isRunning =
    message.status === "streaming" || message.status === "pending";

  if (isUser) {
    const hasFiles = (message.files?.length ?? 0) > 0;
    return (
      <Message from="user">
        <MessageContent>
          {hasFiles && (
            <Attachments variant="inline">
              {message.files!.map((file, i) => (
                <Attachment
                  key={`${file.url}-${i}`}
                  data={{
                    id: `${message.id}-${i}`,
                    type: "file",
                    url: file.url,
                    mediaType: file.mediaType,
                    filename: file.filename,
                  }}
                >
                  <AttachmentPreview />
                </Attachment>
              ))}
            </Attachments>
          )}
          {message.text && (
            <p className="whitespace-pre-wrap">{message.text}</p>
          )}
        </MessageContent>
      </Message>
    );
  }

  const hasEvents = message.events.length > 0;

  return (
    <Message from="assistant">
      <MessageContent className="w-full max-w-full gap-3">
        {hasEvents && (
          <AgentJobLogsDisplay
            provider={message.harness ?? AgentProvider.ClaudeCode}
            logs={message.events as never}
            isRunning={isRunning}
            className={cn(isRunning && "min-h-4")}
          />
        )}

        {message.status === "error" && (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{message.error}</AlertDescription>
          </Alert>
        )}

        {isRunning && !hasEvents && (
          <Shimmer as="span" className="text-sm">
            {`Running ${HARNESS_LABELS[message.harness ?? AgentProvider.ClaudeCode]}`}
          </Shimmer>
        )}
      </MessageContent>
    </Message>
  );
}

interface QueuedMessagesListProps {
  queued: QueuedMessage[];
  onRemove: (id: string) => void;
}

function QueuedMessagesList({ queued, onRemove }: QueuedMessagesListProps) {
  return (
    <Queue>
      <QueueSection defaultOpen>
        <QueueSectionTrigger>
          <QueueSectionLabel
            count={queued.length}
            label="Queued"
            icon={<ListTodo className="size-4" />}
          />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {queued.map((item) => (
              <QueuedRow key={item.id} item={item} onRemove={onRemove} />
            ))}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
}

interface QueuedRowProps {
  item: QueuedMessage;
  onRemove: (id: string) => void;
}

function QueuedRow({ item, onRemove }: QueuedRowProps) {
  const isError = item.status === "error";
  const attachmentCount = item.files?.length ?? 0;
  const label =
    item.text.trim().length > 0
      ? item.text
      : attachmentCount > 0
        ? `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`
        : "(empty)";

  return (
    <QueueItem title={isError ? item.error : undefined}>
      <div className="flex items-start gap-2">
        {isError ? (
          <TriangleAlert className="text-destructive mt-0.5 size-3 shrink-0" />
        ) : (
          <QueueItemIndicator />
        )}
        <QueueItemContent className={cn(isError && "text-destructive")}>
          {label}
        </QueueItemContent>
        <QueueItemActions>
          <QueueItemAction
            aria-label="Remove queued message"
            onClick={() => onRemove(item.id)}
          >
            <Trash2 className="size-3.5" />
          </QueueItemAction>
        </QueueItemActions>
      </div>
    </QueueItem>
  );
}
