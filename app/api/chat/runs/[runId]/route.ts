import { getRun } from "@/lib/run-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  const entry = getRun(runId);
  if (!entry) {
    // The run may have already finished and been unregistered; treat as a
    // no-op success so repeated stop clicks don't surface spurious errors.
    return Response.json({ ok: true, alreadyStopped: true });
  }

  try {
    await entry.run.abort();
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to stop the running agent.",
      },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
