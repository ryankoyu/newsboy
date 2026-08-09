/**
 * Admin console availability gate — separate from auth (auth.ts/session.ts
 * answer "is this operator logged in?"; this answers "can the console work
 * at all here?").
 *
 * Why this exists: the admin console reads/writes pipeline/output/ directly
 * on the local filesystem (localFsEditionRepository.ts — see that file's
 * header for the "로컬 모드 우선" rationale). pipeline/output/ is gitignored
 * (pipeline/.gitignore) and never pushed to GitHub, so on Vercel it simply
 * does not exist — process.cwd()/../pipeline/output resolves to a path with
 * nothing there. Without this gate, that isn't a 500 (the repository layer
 * already treats ENOENT as "empty"), but it silently shows a confusing empty
 * table instead of explaining *why* nothing shows up. This gate turns that
 * into an explicit, honest notice instead.
 *
 * ADMIN_ENABLED=false is an explicit operator override (task instruction) —
 * e.g. to hide the console even in an environment where the directory
 * happens to exist, without having to break the filesystem to do it.
 */
import { stat } from "node:fs/promises";
import { PIPELINE_OUTPUT_DIR } from "@/lib/config/paths";

export type AdminUnavailableReason = "disabled" | "no-repository";

export interface AdminAvailability {
  available: boolean;
  reason?: AdminUnavailableReason;
}

export async function checkAdminAvailability(): Promise<AdminAvailability> {
  if ((process.env.ADMIN_ENABLED ?? "").toLowerCase() === "false") {
    return { available: false, reason: "disabled" };
  }

  try {
    const info = await stat(PIPELINE_OUTPUT_DIR);
    if (!info.isDirectory()) return { available: false, reason: "no-repository" };
    return { available: true };
  } catch {
    // ENOENT (dir missing — the Vercel/Supabase-not-connected case) or any
    // other stat failure (permissions, etc.) — treat all as "unavailable",
    // never let this throw into a page render.
    return { available: false, reason: "no-repository" };
  }
}
