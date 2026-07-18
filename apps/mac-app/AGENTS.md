# Mac App Agent Instructions

Native SwiftUI macOS app. Licensed BSL 1.1 (`LICENSE`).

## Tooling

- Generate the Xcode project with `./Scripts/generate-project.sh` (requires `xcodegen`).
- Do not commit `Hyperlocalise.xcodeproj` unless the team decides to vend it.
- Prefer editing sources under `Hyperlocalise/` and `HyperlocaliseTests/`.
- Keep auth on the WorkOS sealed session cookie channel — do not invent a parallel Bearer identity for org APIs.
- Sparkle 2 is an SPM dependency in `project.yml`. Set `SU_PUBLIC_ED_KEY` after
  `./Scripts/generate-sparkle-keys.sh`; never commit `.sparkle-keys/`.

## Before Finalizing

On macOS with Xcode installed:

```bash
./Scripts/generate-project.sh
xcodebuild -scheme Hyperlocalise -destination 'platform=macOS' build
xcodebuild test -scheme Hyperlocalise -destination 'platform=macOS'
```

When changing the native auth bridge in `apps/hyperlocalise-web`, also run
`vp test` and `vp check --fix` there.
