import {
  Agent,
  type AgentProviderName,
  type RawAgentEvent,
  type UserContent,
  type UserContentPart,
} from "agentbox-sdk";
import { z } from "zod";
import {
  agentEnv,
  getSandbox,
  isBusy,
  releaseSlot,
  tryAcquireSlot,
  type SupportedProvider,
} from "@/lib/sandbox-pool";
import { HARNESS_MODELS } from "@/lib/harness-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filePartSchema = z.object({
  url: z.string().min(1),
  mediaType: z.string().min(1),
  filename: z.string().optional(),
});

const bodySchema = z
  .object({
    sandboxProvider: z.enum(["e2b", "modal", "daytona"]),
    harness: z.enum(["claude-code", "opencode", "codex"]),
    model: z.string().min(1),
    input: z.string().max(16_000).default(""),
    files: z.array(filePartSchema).max(10).optional(),
    resumeSessionId: z.string().min(1).optional(),
  })
  .refine((data) => data.input.trim().length > 0 || (data.files?.length ?? 0) > 0, {
    message: "Provide input text or at least one file.",
    path: ["input"],
  });

function buildAgentInput(
  text: string,
  files: z.infer<typeof filePartSchema>[] | undefined,
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

function writeLine(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  data: unknown,
) {
  controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
}

export async function POST(req: Request) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }

  const { sandboxProvider, harness, model, input, files, resumeSessionId } =
    parsed;

  if (!HARNESS_MODELS[harness as AgentProviderName].includes(model)) {
    return Response.json(
      { error: `Model "${model}" is not available for ${harness}.` },
      { status: 400 },
    );
  }

  if (isBusy(sandboxProvider as SupportedProvider)) {
    return Response.json(
      {
        error:
          "The shared sandbox for this provider is currently busy with another chat. Try again in a few seconds.",
      },
      { status: 409 },
    );
  }

  if (!tryAcquireSlot(sandboxProvider as SupportedProvider)) {
    return Response.json(
      {
        error:
          "The shared sandbox for this provider is currently busy with another chat. Try again in a few seconds.",
      },
      { status: 409 },
    );
  }

  const encoder = new TextEncoder();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseSlot(sandboxProvider as SupportedProvider);
  };

  const abortSignal = req.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const sandbox = await getSandbox(sandboxProvider as SupportedProvider);

        const agent = new Agent(harness as AgentProviderName, {
          sandbox,
          cwd: "/workspace",
          approvalMode: "auto",
          env: agentEnv(),
        });

        const run = agent.stream({
          model,
          input: buildAgentInput(input, files),
          resumeSessionId,
        });

        writeLine(controller, encoder, {
          type: "started",
          runId: run.id,
          provider: harness,
        });

        const abortHandler = () => {
          run.abort().catch(() => undefined);
        };
        abortSignal.addEventListener("abort", abortHandler);

        try {
          for await (const event of run.rawEvents() as AsyncIterable<RawAgentEvent>) {
            writeLine(controller, encoder, {
              type: "raw",
              provider: harness,
              event: event.payload,
            });
          }

          const result = await run.finished;
          writeLine(controller, encoder, {
            type: "done",
            text: result.text,
            sessionId: result.sessionId,
          });
        } finally {
          abortSignal.removeEventListener("abort", abortHandler);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error ?? "Error");
        try {
          writeLine(controller, encoder, { type: "error", message });
        } catch {
          // stream may already be closed
        }
      } finally {
        release();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      release();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
