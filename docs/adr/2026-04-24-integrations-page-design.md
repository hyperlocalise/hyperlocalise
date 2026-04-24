# Integrations page design

## Context

Hyperlocalise needs a workspace-level integrations page for configuring the LLM provider used by localization jobs and previewing planned TMS connections.

## Decision

Add `/org/[organizationSlug]/integrations` inside the authenticated app shell. The page has two sections:

- LLM providers: OpenAI, Anthropic, Gemini, Groq, and Mistral from the existing provider catalog. The page reads, saves, and disconnects the shared organization credential through the existing provider credential API.
- TMS: Lokalise, Phrase, Crowdin, Transifex, POEditor, and Smartling. These cards are visible but disabled with a “Coming soon” status because backend TMS sync is not implemented.

The UI follows the existing dark operational shell, uses existing cards/buttons/badges, and avoids adding new backend contracts for TMS placeholders.

## Consequences

Teams can configure AI provider credentials outside onboarding. TMS connectors become discoverable without implying they are usable yet.
