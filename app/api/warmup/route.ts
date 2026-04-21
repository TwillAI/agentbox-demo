import { z } from "zod";
import { getSandbox, type SupportedProvider } from "@/lib/sandbox-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sandboxProvider: z.enum(["e2b", "modal", "daytona"]),
});

export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }

  try {
    await getSandbox(body.sandboxProvider as SupportedProvider);
    return Response.json({ status: "ready" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}
