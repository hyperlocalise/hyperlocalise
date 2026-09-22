# Multilingual key-value view

Approved design: add a Multilingual option to the Content Editor for string files. Display one row per source key, followed by the source and one column per selected target language. Keep the key column and header visible while scrolling. Match the existing app tokens and dense table styling.

Reuse TanStack Virtual on both axes and the existing paged queue. Fetch translations only for mounted cells through the shared, cancellable, four-request scheduler and React Query cache. Align translations by segment identity, never by independently paginated language lists. Language selection hides columns without changing the active queue's search, filter, or order.

Selecting a translation opens the existing editor at that key and locale, preserving its save, permission, and unsaved-change handling. Missing translations, loading, and failed reads must be distinguishable, with retry for failed cells. Use semantic table roles and focusable controls, localized labels, and automatic text direction.

Validate capability selection, bounded rendering and requests for large datasets, locale and key identity, missing/error/loading states, and editor navigation. Run the repository-required web test and check commands.
