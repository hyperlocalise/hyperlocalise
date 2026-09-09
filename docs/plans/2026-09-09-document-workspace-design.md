# Document workspace redesign

Approved direction: a document-first editing workspace for localization reviewers.

The translation is a centered, readable page on a quiet workspace. A compact formatting toolbar stays above the writing surface. Document metadata starts collapsed under Details. Compare original opens the source alongside the translation, with the existing visibility preference respected. Save state and approval sit together in the header; supplementary file actions remain available from a menu.

Markdown uses the existing editor with a document presentation that removes its nested scrolling and resize handle. MDX opens as a formatted preview with an explicit Edit code action, preserving JSX through the existing lossless text path. No new document conversion or persistence API is introduced.

Keep source read-only, preserve permissions and generation actions, disable saving during loading or errors, and show save failures without discarding edits. Verify metadata editing, MDX round trips, comparison, and save-state behavior with component tests, then run vp test and vp check --fix. Inspect the document Storybook examples at desktop and mobile sizes in both themes.

## Selection AI

Select translated Markdown text and click Ask. A compact action menu offers Rewrite, Retranslate, Fix grammar, Shorten, More formal, and Use glossary. Choosing an action opens the loading/result popup, with the proposed text, a short explanation, Replace, and Dismiss. There is no instruction form. Only explicit replacement edits the document; concurrent document edits invalidate the suggestion. Model output is inserted as text, never parsed as HTML.

The selected passage is the existing recommendation input. Surrounding text and the original document use existing context fields. The authenticated recommendation service uses the project model and permissions; there is no separate documentSelection API field. MDX retains its lossless code workflow.

The original pane slides and fades in over 200ms and out over 150ms. The translation animates its position during comparison changes. Reduced-motion users receive immediate transitions.
