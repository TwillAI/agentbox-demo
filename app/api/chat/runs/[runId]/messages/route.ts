import { z } from "zod";
import { buildAgentInput, filePartSchema } from "@/lib/chat-input";
import { getRun } from "@/lib/run-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    input: z.string().max(16_000).default(""),
    files: z.array(filePartSchema).max(10).optional(),
  })
  .refine(
    (data) => data.input.trim().length > 0 || (data.files?.length ?? 0) > 0,
    {
      message: "Provide input text or at least one file.",
      path: ["input"],
    },
  );

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }

  const entry = getRun(runId);
  if (!entry) {
    return Response.json(
      { error: `No active run with id ${runId}.` },
      { status: 404 },
    );
  }

  try {
    await entry.run.sendMessage(buildAgentInput(parsed.input, parsed.files));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send message to the running agent.",
      },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
