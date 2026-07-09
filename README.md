# ffmpeg-artifacts

Publishes pinned, mirrored **FFmpeg + ffprobe** release binaries for Loti-supported
platforms (`linux-x64-gnu`, `darwin-arm64`, `win32-x64`). These are consumed by
`@loti/ffmpeg` in the monorepo via `install:release`.

## What it does

This repo is the **publisher** (the "factory"). It does not compile ffmpeg — it
**mirrors** a pinned, full-featured, statically-linked upstream build (BtbN for
Linux/Windows, osxexperts for macOS arm64), verifies each upstream archive's
SHA-256, repackages into a stable `bin/{ffmpeg,ffprobe}` + `LICENSES/` +
`build-info.json` layout, generates `checksums.sha256`, and uploads them as a
**public GitHub Release on this repo**. Because the release lives here, the
publish workflow uses this repo's own `GITHUB_TOKEN` — no cross-repo token.

The archives are byte-deterministic (`tar --format=ustar` + fixed mtimes +
`gzip -n`), so a re-publish over the same pinned inputs yields identical bytes.

## Publishing a new version

1. Update [`src/upstream-sources.ts`](src/upstream-sources.ts): point each
   platform at the new pinned upstream asset (an immutable, retained tag) and
   update its `sha256`.
2. Update [`src/release-manifest.ts`](src/release-manifest.ts): `releaseTag`,
   `ffmpegVersion`, etc.
3. Push to `main` (or run the workflow manually). The
   [Publish FFmpeg Release](.github/workflows/publish.yml) workflow mirrors all
   three platforms on one runner and publishes the release.
4. Bump `RELEASE_MANIFEST.releaseTag` in the monorepo's `@loti/ffmpeg` to match.

## Licensing

The mirrored binaries are **GPL-3.0-or-later** full builds (libx264, libfreetype,
openssl, libwebp). Corresponding source is the upstream FFmpeg release recorded
in each artifact's `build-info.json` (`upstreamArchiveUrl`).
