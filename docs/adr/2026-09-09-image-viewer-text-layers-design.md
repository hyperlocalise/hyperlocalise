# Image viewer and persisted text layers

Approved on 2026-09-09.

The image file viewer follows the multilingual content studio mock: a large image canvas and a text-layer inspector. Original comparison slides in and out with the document viewer's motion. A divider directly on the image compares original and localised pixels with pointer, touch, and keyboard input. There is no separate comparison slider control. Zoom and text overlays share image coordinates.

Users extract text on demand, correct detected text, and save locale-specific replacements and instructions. Extraction uses the existing managed vision-capable language model and usage metering. Empty results and failures appear in the inspector. Extraction must not silently overwrite saved edits.

Store a versioned `imageTextLayers` object in the source stored file's existing JSON metadata. Include source SHA-256, extraction timestamp, stable region IDs, normalized bounding boxes, and locale-specific instructions/replacements. Validate every read and write, scope access to the owning organization and project, preserve unrelated metadata, and reject stale updates. No database migration is required.

Image variant generation reads the saved source metadata and adds the relevant locale's region context to the prompt. Treat extracted text as data, preserve surrounding artwork, and ignore metadata with a different source hash. Raster text regions are inferred, not native design-file layers.

Verify schema validation, stale updates, authorization, persistence, prompt integration, comparison controls, and extraction/edit states. Run `vp test` and `vp check --fix` before completing the implementation.

## Approved refinements

Use “Localise image” for first generation, “Regenerate image” for subsequent generations, and “Original / Localised” for comparison. Generation appears beside the localised preview. Unsaved layers produce “Save & localise” or “Save & regenerate”; generation starts only after a successful save. The generation dialog identifies the locale, layer context, and additional image instructions. Preserve edits and inputs on failure. Keep approval separate from generation.

The text-layer helper reads: “Extract text to refine the translation in your image.”

Extraction applies to project-stored PNG, JPEG, and WebP assets. External image URLs remain viewable but do not expose metadata extraction. Inferred text regions are approximate and should be reviewed. Schema, extraction, and UI tests run without an AI provider. Database integration tests require local PostgreSQL.
