import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { mirrorReleaseAsset } from "./mirror-release-asset";
import { RELEASE_MANIFEST, SUPPORTED_PLATFORM_KEYS } from "./release-manifest";

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

// Mirror every supported platform's pinned upstream build into our archive
// layout, generate checksums.sha256, and publish them to THIS repo's release.
// Runs inside lotillc/ffmpeg-artifacts, so `gh` authenticates with the repo's
// own GITHUB_TOKEN (contents: write) -- no cross-repo PAT needed.
async function main(): Promise<void> {
  const stagingDirectoryPath = await mkdtemp(join(tmpdir(), "ffmpeg-publish-"));
  try {
    const archivePaths: string[] = [];
    for (const platformKey of SUPPORTED_PLATFORM_KEYS) {
      const outputArchivePath = join(
        stagingDirectoryPath,
        RELEASE_MANIFEST.assets[platformKey].archiveFileName,
      );
      await mirrorReleaseAsset({ platformKey, outputArchivePath });
      archivePaths.push(outputArchivePath);
    }

    const checksumLines = [];
    for (const archivePath of archivePaths) {
      checksumLines.push(`${await sha256File(archivePath)} ${basename(archivePath)}`);
    }
    const checksumsPath = join(stagingDirectoryPath, RELEASE_MANIFEST.checksumsFileName);
    await writeFile(checksumsPath, `${checksumLines.join("\n")}\n`);

    const { releaseTag, repo, ffmpegVersion } = RELEASE_MANIFEST;
    const releaseNotes =
      `Pinned FFmpeg + ffprobe (${ffmpegVersion}) for Loti-supported platforms, mirrored and ` +
      "repackaged from pinned upstream prebuilt builds. Corresponding source: the upstream " +
      "FFmpeg release recorded in each artifact's build-info.json (upstreamArchiveUrl). GPL-3.0-or-later.";

    try {
      execFileSync("gh", ["release", "view", releaseTag, "--repo", repo], { stdio: "ignore" });
    } catch {
      execFileSync(
        "gh",
        ["release", "create", releaseTag, "--repo", repo, "--title", `FFmpeg ${ffmpegVersion} (${releaseTag})`, "--notes", releaseNotes],
        { stdio: "inherit" },
      );
    }
    execFileSync(
      "gh",
      ["release", "upload", releaseTag, "--repo", repo, "--clobber", ...archivePaths, checksumsPath],
      { stdio: "inherit" },
    );
  } finally {
    await rm(stagingDirectoryPath, { force: true, recursive: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
