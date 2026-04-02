# Agent Instructions

## Setup

- Run `make bootstrap` before working if dependencies are not installed yet.

## Commit Messages

- Use conventional commit style when possible: `<type>(<scope>): <summary>`.
- Keep the summary short, imperative, and specific.
- Common types in this repo include `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, and `init`.
- Use a scope when it adds clarity, for example `feat(schema): add enum column metadata`.

## Before Finalizing

- Run `make fmt`.
- Run `make lint`.
- Run `make test`.

Do not finalize work until all three commands complete successfully.
