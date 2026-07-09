import type { PlatformKey } from "./release-manifest";

export type FfmpegToolName = "ffmpeg" | "ffprobe";

export function resolvePlatformKey(params?: {
  platform?: NodeJS.Platform;
  arch?: string;
}): PlatformKey {
  const runtimePlatform = params?.platform ?? process.platform;
  const runtimeArch = params?.arch ?? process.arch;

  if (runtimePlatform === "linux" && runtimeArch === "x64") {
    return "linux-x64-gnu";
  }

  if (runtimePlatform === "darwin" && runtimeArch === "arm64") {
    return "darwin-arm64";
  }

  if (runtimePlatform === "win32" && runtimeArch === "x64") {
    return "win32-x64";
  }

  throw new Error(
    `@loti/ffmpeg does not support platform ${runtimePlatform}/${runtimeArch}. Supported platforms: linux/x64, darwin/arm64, win32/x64.`,
  );
}

export function getExecutableFileName(toolName: FfmpegToolName, platformKey: PlatformKey): string {
  return platformKey === "win32-x64" ? `${toolName}.exe` : toolName;
}
