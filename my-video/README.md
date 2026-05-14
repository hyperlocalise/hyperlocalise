# Hyperlocalise Launch Video

Remotion composition for a 1080x700, 30fps Apple-style product launch video.

## Assets

- `public/logo.png` is copied from `apps/hyperlocalise-web/public/images/logo.png`.
- `public/bella.png` is copied from `apps/hyperlocalise-web/public/images/profile/bella.png` for the human Slack avatar.
- Replace `public/banner-before.svg` and `public/banner-after.svg` with the supplied before/after image assets, or update `ASSET_IMAGES` in `src/Composition.tsx` if the filenames differ.

## Commands

```console
bun install
bun run music
bun run lint
bun run render
```

The rendered video is written to `out/hyperlocalise-launch.mp4`.
