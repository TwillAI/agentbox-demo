import {
  Agent,
  type AgentProviderName,
  type NormalizedAgentEvent,
  type RawAgentEvent,
} from "agentbox-sdk";
import { z } from "zod";
import {
  agentEnv,
  getSandbox,
  type SupportedProvider,
} from "@/lib/sandbox-pool";
import { HARNESS_MODELS } from "@/lib/harness-catalog";
import { buildAgentInput, filePartSchema } from "@/lib/chat-input";
import { registerRun, unregisterRun } from "@/lib/run-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const encoder = new TextEncoder();

  const abortSignal = req.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let registeredRunId: string | null = null;
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

        registeredRunId = run.id;
        registerRun(run.id, {
          run,
          provider: sandboxProvider as SupportedProvider,
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

        // Consume the normalized event stream in parallel so we can surface
        // `message.injected` to the client as a deterministic signal that the
        // SDK accepted a queued message and a new assistant turn is starting.
        const normalizedLoop = (async () => {
          try {
            for await (const event of run as AsyncIterable<NormalizedAgentEvent>) {
              if (event.type === "message.injected") {
                writeLine(controller, encoder, {
                  type: "injected",
                  content: event.content,
                });
              }
            }
          } catch {
            // Errors are surfaced via the raw/finished path below.
          }
        })();

        try {
          for await (const event of run.rawEvents() as AsyncIterable<RawAgentEvent>) {
            writeLine(controller, encoder, {
              type: "raw",
              provider: harness,
              event: event.payload,
            });
          }

          try {
            const result = await run.finished;
            await normalizedLoop;
            writeLine(controller, encoder, {
              type: "done",
              text: result.text,
              sessionId: result.sessionId,
            });
          } catch (finishedError) {
            // `run.finished` rejects when the run is aborted (stop button)
            // or when the provider errors out. The SDK still retains the
            // captured sessionId on the run, so emit a `done` event with
            // it whenever available — this lets the next user message
            // resume the same provider session instead of starting a new
            // conversation. If no sessionId was ever captured (abort
            // happened before the provider announced one), fall through
            // to the error path below.
            await normalizedLoop.catch(() => undefined);
            const salvagedSessionId = run.sessionId;
            if (salvagedSessionId) {
              writeLine(controller, encoder, {
                type: "done",
                sessionId: salvagedSessionId,
              });
            } else {
              throw finishedError;
            }
          }
        } finally {
          abortSignal.removeEventListener("abort", abortHandler);
          await normalizedLoop.catch(() => undefined);
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
        if (registeredRunId) {
          unregisterRun(registeredRunId);
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
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
