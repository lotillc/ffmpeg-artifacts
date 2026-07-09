import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { PlatformKey } from "./release-manifest";

export const ffmpegBuildInfoSchema = z.strictObject({
  ffmpegVersion: z.string().min(1),
  libwebpVersion: z.string().min(1),
  releaseTag: z.string().min(1).nullable(),
  platformKey: z.string().min(1),
  archiveFileName: z.string().min(1).nullable(),
  ffmpegLicense: z.string().min(1),
  // Provenance: the upstream prebuilt archive this artifact was mirrored from.
  upstreamArchiveUrl: z.url().optional(),
  // Omitted by the mirror so repackaged artifacts are byte-deterministic across
  // re-runs; provenance is the immutable upstreamArchiveUrl, not a wall clock.
  builtAt: z.iso.datetime().optional(),
});

export type FfmpegBuildInfo = z.infer<typeof ffmpegBuildInfoSchema>;

export function getBuildInfoPath(packageRoot: string, platformKey: PlatformKey): string {
  return join(packageRoot, "dist", "vendor", platformKey, "build-info.json");
}

export function readBundledBuildInfo(
  packageRoot: string,
  platformKey: PlatformKey,
): FfmpegBuildInfo | undefined {
  const buildInfoPath = getBuildInfoPath(packageRoot, platformKey);
  if (!existsSync(buildInfoPath)) {
    return undefined;
  }

  return ffmpegBuildInfoSchema.parse(JSON.parse(readFileSync(buildInfoPath, "utf8")));
}
