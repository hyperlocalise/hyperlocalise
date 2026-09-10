# Multiple locales per domain

Approved design: show each hostname once with its supported locales. Link and edit dialogs allow multiple locale selections. A shared research locale selector applies to overview, keywords, ranks, AI visibility, and prompts, and persists in the URL across tabs. DNS verification remains attached to the hostname.

The existing research UI uses prototype fixtures. Keep locale edits and newly linked domains in an organization-scoped client cache for the current session. Clearly disclose this limitation in the dialogs. Store supported locales on the domain and associate each research catalog with one locale. Do not display another locale’s metrics when research is unavailable. Use an explicit empty state instead.

Show locales, audit score, and verification in the domain list. Keep market-specific keyword and traffic metrics inside research. Validate at least one locale and prevent duplicate hostnames when linking. Test multi-locale selection, navigation, data isolation, and pending domain verification. Run `vp test` and `vp check --fix`.
