import { z } from "zod";

const PLATFORM_KEY_VALUES = ["linux-x64-gnu", "darwin-arm64", "win32-x64"] as const;

export const platformKeySchema = z.enum(PLATFORM_KEY_VALUES);
export type PlatformKey = z.infer<typeof platformKeySchema>;

const releaseAssetSchema = z.strictObject({
  archiveFileName: z.string().min(1),
});

const releaseManifestSchema = z.strictObject({
  repo: z.string().min(1),
  releaseTag: z.string().min(1),
  ffmpegVersion: z.string().min(1),
  libwebpVersion: z.string().min(1),
  revision: z.string().min(1),
  checksumsFileName: z.string().min(1),
  ffmpegLicense: z.literal("GPL-3.0-or-later"),
  assets: z.record(platformKeySchema, releaseAssetSchema),
});

export const RELEASE_MANIFEST = releaseManifestSchema.parse({
  repo: "lotillc/ffmpeg-artifacts",
  releaseTag: "ffmpeg-v8.1.2-loti.1",
  ffmpegVersion: "8.1.2",
  libwebpVersion: "1.6.0",
  revision: "1",
  checksumsFileName: "checksums.sha256",
  ffmpegLicense: "GPL-3.0-or-later",
  assets: {
    "linux-x64-gnu": {
      archiveFileName: "ffmpeg-linux-x64-gnu.tar.gz",
    },
    "darwin-arm64": {
      archiveFileName: "ffmpeg-darwin-arm64.tar.gz",
    },
    "win32-x64": {
      archiveFileName: "ffmpeg-win32-x64.tar.gz",
    },
  },
});

export const SUPPORTED_PLATFORM_KEYS = [...PLATFORM_KEY_VALUES];
