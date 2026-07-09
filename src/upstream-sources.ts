import type { PlatformKey } from "./release-manifest";

// Publish-side pins: the upstream prebuilt static full builds we mirror into our
// own release. Consumers never read this -- once mirrored + checksummed into our
// GitHub release, nothing depends on these hosts' retention anymore.
//
// All are full GPL-3.0 static builds with libx264, libfreetype/harfbuzz
// (drawtext), openssl (network/TLS) and libwebp -- the codecs/filters josu-ds
// actually uses. BtbN linux builds target an old glibc (2.22), so they run on
// the slim Debian runtime image. macOS arm64 comes from osxexperts (best-effort;
// prod is Linux) and ships ffmpeg + ffprobe as separate downloads.
//
// Pinned to a specific BtbN month-end autobuild: immutable (a dated tag never
// changes) AND retained (BtbN keeps the last build of each month long-term,
// unlike daily autobuilds pruned after 14 days or the rolling `latest` tag). So
// a first publish and any force=true retry fetch byte-identical inputs.
export type UpstreamArchive = {
  url: string;
  format: "tar.xz" | "zip";
  // Expected SHA-256 of the upstream archive, verified before extraction so a
  // compromised/replaced upstream asset can't be blessed under our release tag.
  // Optional for best-effort sources whose host blocks scripted downloads.
  sha256?: string;
};

export type UpstreamSource = {
  // One or more archives extracted into the same staging dir; ffmpeg + ffprobe
  // must be present across them (a single archive for BtbN, two for osxexperts).
  archives: UpstreamArchive[];
};

const BTBN = "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-06-30-13-34";
const BTBN_BUILD = "ffmpeg-n8.1.2-21-gce3c09c101";
const OSXEXPERTS = "https://www.osxexperts.net";

export const UPSTREAM_SOURCES: Record<PlatformKey, UpstreamSource> = {
  "linux-x64-gnu": {
    archives: [
      {
        url: `${BTBN}/${BTBN_BUILD}-linux64-gpl-8.1.tar.xz`,
        format: "tar.xz",
        sha256: "0ba73bbd93472c7622f6dec26d334c5e62e64d858d072490b2844320970456cd",
      },
    ],
  },
  "win32-x64": {
    archives: [
      {
        url: `${BTBN}/${BTBN_BUILD}-win64-gpl-8.1.zip`,
        format: "zip",
        sha256: "682361e32c9631caec09e5d9f09077101c9ed90c14e275f62014fefa6d397990",
      },
    ],
  },
  "darwin-arm64": {
    // osxexperts publishes ffmpeg and ffprobe separately, named by the release
    // line (8.1 -> `81arm`), not the patch. (best-effort, prod is Linux.)
    archives: [
      {
        url: `${OSXEXPERTS}/ffmpeg81arm.zip`,
        format: "zip",
        sha256: "ebb82529562b71170807bbc6b0e7eb4f0b13af8cbb0e085bb9e8f6fe709598ad",
      },
      {
        url: `${OSXEXPERTS}/ffprobe81arm.zip`,
        format: "zip",
        sha256: "a6640a77d38a6f0527c5b597e599cb36a3427a6931444ed80bc62542421950a1",
      },
    ],
  },
};
