# GitHub translation review and fix design

## Summary

Hyperlocalise will add explicit `@hyperlocalise review` and `@hyperlocalise fix` commands for pull requests. Both commands operate only on translation units added or modified by the pull request. They use one provider-neutral change set across repository-native files, Hyperlocalise project files, and external TMS resources.

`review` remains read-only. It checks translation quality and external approval state. `fix` may update code and native project files on the pull request branch, but it creates approval-gated proposals for external TMS changes. It never approves external translations automatically.

## Project resolution

GitHub repositories and Hyperlocalise projects have a many-to-many relationship. One monorepo may feed several projects, and one project may draw files from several repositories.

Each mapping defines:

- GitHub installation repository
- Hyperlocalise project
- Repository source root
- Included and excluded translation paths
- Source and target locale mapping
- Native or external TMS mode
- External provider resource identifiers, when applicable
- Read visibility and writable mutation ownership
- Enabled state and configuration version

Several projects may read the same translation unit, but exactly one mapping may own its mutation. Setup rejects overlapping writable mappings. The runtime returns `project_mapping_missing` when no mapping matches and `ambiguous_project_mapping` when ownership conflicts.

## Runtime resolution

For each changed translation unit, the workflow resolves:

```text
GitHub installation + repository + pull request
  -> changed path and translation key
  -> repository-project mapping
  -> Hyperlocalise project and effective policy
  -> native file or external TMS resource
  -> review finding or mutation target
```

The run stores the base SHA, head SHA, project IDs, provider resource IDs, configuration version, and effective policy snapshot. Later configuration changes do not alter an in-flight or completed run.

## Review command

`@hyperlocalise review` builds the PR-scoped change set and checks:

- Translation-file syntax and structure
- Missing or untranslated values
- Placeholder and ICU compatibility
- Terminology and glossary rules
- Source-target consistency and locale quality
- Relevant source-code usage, where supported
- Repository and external TMS value drift
- External source-version drift
- External translation approval status
- Provider-state freshness and availability

Unapproved mapped external translations produce blocking `approval_required` findings. Linguistic failures remain separate from workflow-status failures. Provider outages follow the matched project's snapshotted block-or-warn policy and never appear as successful validation.

GitHub receives one check run grouped by project and locale. Inline annotations appear when a finding maps to a changed line. Unmapped repositories receive repository-only review with an explicit notice that project and TMS checks were skipped.

## Fix command

`@hyperlocalise fix` revalidates actor permissions, writable ownership, and the current pull request head before exposing write tools. If the head changed after review, the workflow stops.

The command may:

1. Correct source code and native translation files in a scoped checkout.
2. Run the relevant validation commands.
3. Commit and push the verified diff to the pull request branch.
4. Create external TMS proposals partitioned by project, credential, provider, and resource.
5. Wait for an authorised reviewer to approve or deny each external proposal.
6. Recheck provider versions before write-back and rerun the GitHub check afterward.

Repository and provider retries use idempotency keys. Mutation logs record the actor, workflow, changed paths, provider, approval, commands, and outcome.

## Delivery phases

1. Add versioned repository-project mappings, deterministic resolution, policy, and setup UI.
2. Build the provider-neutral PR translation change set and immutable run snapshots.
3. Ship native `@hyperlocalise review` with stable findings and GitHub checks.
4. Enrich review with external TMS state, drift detection, and approval gates.
5. Ship `@hyperlocalise fix` with repository writes and approval-gated TMS proposals.
6. Add approval UX, resilience, observability, diagnostics, and provider conformance tests.

The implementation plan lives in Linear under [Agent: Repo Localisation Assistant](https://linear.app/hyperlocalise/project/agent-repo-localisation-assistant-2b06f7832c28), phase parents HL-463 through HL-468, and child tickets HL-469 through HL-486.

## Safety and failure handling

- Review tasks receive no provider mutation tools.
- Fix tasks receive write tools only after actor and mapping authorization.
- External write-back always requires an approval record.
- A stale pull request head, provider source version, or expired proposal blocks mutation.
- Partial provider failure preserves other findings but cannot lower the overall blocking conclusion.
- Logs exclude credentials, repository contents, and raw translations.
- Cancellation and timeouts propagate through repository and provider operations.

## Test strategy

Focused tests cover mapping conflicts, monorepos, multi-repository projects, diff parsing, command permissions, request idempotency, finding classification, stale heads, and mutation gates. Provider contract tests normalize Crowdin, Lokalise, and Phrase behavior. End-to-end fixtures cover native review, external approval blocking, repository fixes, approved write-back, provider outages, retries, and check reruns.
