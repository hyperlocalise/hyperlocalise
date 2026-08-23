# Hyperlocalise agent evals

Offline evals for the conversational agent, run against real models through the
Vercel AI Gateway. They are a separate test lane from `vp test`: unit tests mock
the model; these suites measure model-dependent behavior (routing, tool
selection, answer quality) and are therefore non-hermetic and slightly flaky by
nature.

## Running

```bash
cp .env.eval.example .env.eval   # set AI_GATEWAY_API_KEY
vp run test:eval
```

Suites skip (not fail) when no `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` is
configured. Each suite writes a JSON report to `artifacts/evals/<suite>.json`
(gitignored) with per-case results, the model id, and the git SHA — the same
convention as the Go CLI eval harness reports under `artifacts/`.

Model matrix runs:

```bash
EVAL_MODEL=anthropic/claude-sonnet-4.5 vp run test:eval
EVAL_JUDGE_MODEL=openai/gpt-5.6-luna vp run test:eval   # swap the judge
```

## Suites

- `classifier.eval.ts` — accuracy of the pre-turn conversation classifier
  (repository-tool routing) against labeled cases in `datasets/classifier-cases.ts`.
  Deterministic scoring, no judge.
- `glossary-routing.eval.ts` — trajectory eval: given a turn, did the agent call
  the right tools (and avoid unnecessary ones)? Deterministic scoring.
- `answer-quality.eval.ts` — LLM-as-judge rubric scoring of final answers,
  including honesty when a capability is gated off.

## How the harness works

`harness.ts` assembles the agent from the production parts — the real skill
plan (`buildConversationSkillPlan`), real composed instructions, and real tool
input schemas (`buildConversationSkillTools`) — then replaces every tool
`execute` with a per-scenario fixture. The model sees exactly what production
sees; no database, sandbox, or TMS is touched. Keep the assembly in sync with
`@/lib/agent-runtime/loops/conversation-skill-agent.ts`.

Growing the suites:

- Add classifier cases from real misroutes (the prompt examples in
  `conversation-classifier.ts` exist because routing misfired once — mine
  production `agent_runs` for more).
- Keep judged suites small (~10 cases); they are the noisiest and most
  expensive. Prefer a trajectory assertion when one can capture the behavior.
- Fixtures should match the tool's output schema shape so the model behaves
  realistically (validation is disabled, but garbage shapes change behavior).
