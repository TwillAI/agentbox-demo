import { SandboxProvider } from "agentbox-sdk";
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
    [SandboxProvider.E2B]: Boolean(process.env.E2B_TEMPLATE_ID),
    [SandboxProvider.Modal]: Boolean(
      process.env.MODAL_IMAGE_ID ?? process.env.OPENAGENT_MODAL_IMAGE,
    ),
    [SandboxProvider.Daytona]: Boolean(process.env.DAYTONA_SNAPSHOT_ID),
    [SandboxProvider.Vercel]: Boolean(
      process.env.VERCEL_TOKEN &&
        process.env.VERCEL_TEAM_ID &&
        process.env.VERCEL_PROJECT_ID &&
        process.env.VERCEL_SNAPSHOT_ID,
    ),
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
