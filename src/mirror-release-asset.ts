import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, cp, mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import { type FfmpegBuildInfo, ffmpegBuildInfoSchema } from "./build-info";
import { getExecutableFileName } from "./platform";
import { type PlatformKey, platformKeySchema, RELEASE_MANIFEST } from "./release-manifest";
import { UPSTREAM_SOURCES, type UpstreamArchive } from "./upstream-sources";

async function downloadFile(url: string, destinationPath: string): Promise<void> {
  // A real browser UA: some upstream hosts (osxexperts) return 503 to default
  // scripted agents. GitHub is unaffected by it.
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    },
  });
  if (!response.ok || response.body === null) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}.`);
  }
  await pipeline(response.body, createWriteStream(destinationPath));
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

function extractUpstreamArchive(
  archivePath: string,
  format: UpstreamArchive["format"],
  dest: string,
) {
  if (format === "zip") {
    execFileSync("unzip", ["-q", archivePath, "-d", dest], { stdio: "inherit" });
  } else {
    execFileSync("tar", ["-xf", archivePath, "-C", dest], { stdio: "inherit" });
  }
}

async function findFile(root: string, fileName: string): Promise<string | undefined> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name === fileName) {
      return join(entry.parentPath, entry.name);
    }
  }
  return undefined;
}

async function findLicense(root: string): Promise<string | undefined> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const match = entries.find((e) => e.isFile() && /^(license|copying|gpl)/i.test(e.name));
  return match ? join(match.parentPath, match.name) : undefined;
}

export async function mirrorReleaseAsset(params: {
  platformKey: PlatformKey;
  outputArchivePath: string;
  // Local archive to repackage instead of downloading (used by tests).
  sourceArchivePath?: string;
}): Promise<void> {
  const source = UPSTREAM_SOURCES[params.platformKey];
  const [primaryArchive] = source.archives;
  if (!primaryArchive) {
    throw new Error(`No upstream archives configured for ${params.platformKey}.`);
  }
  const outputArchivePath = resolve(params.outputArchivePath);
  const workRoot = await mkdtemp(join(tmpdir(), "loti-ffmpeg-mirror-"));
  const upstreamDir = join(workRoot, "upstream");
  const stageDir = join(workRoot, "stage");

  try {
    await mkdir(upstreamDir, { recursive: true });
    await mkdir(join(stageDir, "bin"), { recursive: true });
    await mkdir(join(stageDir, "LICENSES"), { recursive: true });

    if (params.sourceArchivePath) {
      extractUpstreamArchive(params.sourceArchivePath, primaryArchive.format, upstreamDir);
    } else {
      for (const archive of source.archives) {
        const downloadPath = join(workRoot, basename(new URL(archive.url).pathname));
        await downloadFile(archive.url, downloadPath);
        if (archive.sha256) {
          const actual = await sha256File(downloadPath);
          if (actual !== archive.sha256) {
            throw new Error(
              `Upstream checksum mismatch for ${archive.url}: expected ${archive.sha256}, got ${actual}.`,
            );
          }
        }
        extractUpstreamArchive(downloadPath, archive.format, upstreamDir);
      }
    }

    for (const toolName of ["ffmpeg", "ffprobe"] as const) {
      const exe = getExecutableFileName(toolName, params.platformKey);
      const found = await findFile(upstreamDir, exe);
      if (!found) {
        throw new Error(`Upstream archive for ${params.platformKey} is missing ${exe}.`);
      }
      const stagedExe = join(stageDir, "bin", exe);
      await cp(found, stagedExe);
      await chmod(stagedExe, 0o755);
    }

    const licensePath = await findLicense(upstreamDir);
    if (licensePath) {
      await cp(licensePath, join(stageDir, "LICENSES", `ffmpeg-${basename(licensePath)}`));
    } else {
      console.warn(`No license file found in the ${params.platformKey} upstream archive.`);
    }

    // No builtAt: keep the artifact byte-deterministic across re-runs (provenance
    // is the immutable upstreamArchiveUrl, not a wall clock).
    const buildInfo: FfmpegBuildInfo = ffmpegBuildInfoSchema.parse({
      ffmpegVersion: RELEASE_MANIFEST.ffmpegVersion,
      libwebpVersion: RELEASE_MANIFEST.libwebpVersion,
      releaseTag: RELEASE_MANIFEST.releaseTag,
      platformKey: params.platformKey,
      archiveFileName: basename(outputArchivePath),
      ffmpegLicense: RELEASE_MANIFEST.ffmpegLicense,
      upstreamArchiveUrl: primaryArchive.url,
    });
    await writeFile(join(stageDir, "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);

    // Deterministic archive so a force=true retry over identical inputs yields
    // identical bytes: fixed mtimes on every staged entry, uncompressed tar, then
    // gzip -n (no filename/timestamp in the gzip header).
    const fixedMtime = new Date("2020-01-01T00:00:00.000Z");
    const staged = await readdir(stageDir, { recursive: true, withFileTypes: true });
    for (const entry of staged) {
      await utimes(join(entry.parentPath, entry.name), fixedMtime, fixedMtime);
    }
    await utimes(stageDir, fixedMtime, fixedMtime);

    // --format=ustar drops the pax extended headers that bsdtar otherwise fills
    // with per-run atime/ctime (mtime alone is pinned above). gzip -n omits the
    // filename/timestamp from the gzip header. Together: identical bytes on retry.
    const tarPath = join(workRoot, "artifact.tar");
    execFileSync("tar", ["--format=ustar", "-cf", tarPath, "-C", stageDir, "."], {
      stdio: "inherit",
    });
    execFileSync("gzip", ["-n", "-f", tarPath], { stdio: "inherit" });
    await mkdir(dirname(outputArchivePath), { recursive: true });
    await cp(`${tarPath}.gz`, outputArchivePath);
  } finally {
    await rm(workRoot, { force: true, recursive: true });
  }
}

export async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .strict()
    .options({
      "platform-key": {
        type: "string",
        demandOption: true,
        description: "Platform to mirror the pinned upstream prebuilt build for.",
      },
      "output-archive-path": {
        type: "string",
        demandOption: true,
        description: "Path to the .tar.gz release asset to create.",
      },
      "source-archive-path": {
        type: "string",
        description: "Local upstream archive to repackage instead of downloading.",
      },
    })
    .parse();

  await mirrorReleaseAsset({
    platformKey: platformKeySchema.parse(argv.platformKey),
    outputArchivePath: argv.outputArchivePath,
    sourceArchivePath: argv.sourceArchivePath,
  });
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
