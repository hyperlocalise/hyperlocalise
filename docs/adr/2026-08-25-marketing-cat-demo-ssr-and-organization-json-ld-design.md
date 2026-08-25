# Marketing CAT Demo SSR and Organization JSON-LD Design

## Context

The marketing homepage and `/en/product/next-gen-cat-tool` both render the interactive CAT demo. During server rendering, that client component tree can evaluate browser-only code and raise `ReferenceError: localStorage is not defined`.

The marketing site also needs a single Organization structured-data entity that describes Hyperlocalise and its founders. Robots metadata is currently absent from most routes, so public pages do not emit an explicit `index, follow` directive and private routes lack a consistent `noindex` default.

## Design

Keep the mesh stage and its image server-rendered, but load the interactive `HeroFrame` with `next/dynamic` and `ssr: false`. A structural loading shell will reserve the demo's height while its client bundle loads. This boundary is deliberately narrow: it excludes the browser-dependent CAT workspace from server rendering without turning the surrounding showcase into client-only content.

Render a typed Organization JSON-LD object from the marketing layout through the existing `JsonLd` component. Placing it in the marketing layout emits one entity on every public marketing page while excluding authenticated and utility routes. The existing serializer escapes angle brackets before placing JSON in the script element.

Set `noindex, nofollow` in the root metadata as the safe default for authenticated, auth, and utility routes. Override that policy with `index, follow` in the marketing layout. Existing route-specific restrictions remain in place.

## Verification

- Add coverage for the client-only CAT demo boundary and loading shell.
- Add coverage for the Organization JSON-LD fields rendered by the marketing layout.
- Add coverage for the public and private robots policies.
- Run the web test and check commands required by the repository.
