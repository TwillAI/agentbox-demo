import {
  HARNESSES,
  HARNESS_LABELS,
  HARNESS_MODELS,
  SANDBOX_LABELS,
  SUPPORTED_SANDBOXES,
} from "@/lib/harness-catalog";

export const runtime = "nodejs";

export async function GET() {
  const imagesConfigured = {
    e2b: Boolean(process.env.E2B_TEMPLATE_ID),
    modal: Boolean(
      process.env.MODAL_IMAGE_ID ?? process.env.OPENAGENT_MODAL_IMAGE,
    ),
    daytona: Boolean(process.env.DAYTONA_SNAPSHOT_ID),
  };

  return Response.json({
    sandboxes: SUPPORTED_SANDBOXES.map((id) => ({
      id,
      label: SANDBOX_LABELS[id] ?? id,
      configured: imagesConfigured[id as keyof typeof imagesConfigured],
    })),
    harnesses: HARNESSES.map((id) => ({
      id,
      label: HARNESS_LABELS[id],
      models: HARNESS_MODELS[id],
    })),
  });
}
