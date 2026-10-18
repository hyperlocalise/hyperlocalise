---
title: "GitHub 현지화 워크플로: 풀 리퀘스트에서 다국어 릴리스까지"
date: 2026-09-09T00:00:00.000Z
excerpt: 변경된 문자열을 확인하고, 원본 콘텐츠를 Hyperlocalise로 보내고, 검토된 번역을 가져와 다국어 릴리스 노트를 게시하는 실용적인 GitHub 현지화 워크플로를 구축하세요.
category: 엔지니어링
tags:
  - github localization
  - GitHub localisation workflow
  - localize release notes
  - multilingual release
  - localization GitHub Actions
  - localisation CLI
  - continuous localisation
  - software localisation
  - release automation
  - translation review
---

This guide walks you through setting up a GitHub localization workflow with GitHub Actions, the `hyperlocalise` CLI, and the Hyperlocalise platform. You will start with a small example and follow one product change from its first pull request to a multilingual release.

최종적으로 워크플로는 다음 네 단계를 거치게 됩니다:

1. 엔지니어가 영어 UI 문자열과 릴리스 노트를 변경합니다.
2. GitHub은 풀 리퀘스트에서 현지화 문제가 있는지 확인합니다.
3. CLI는 소스 콘텐츠를 Hyperlocalise에 전송하고, 팀은 그곳에서 번역을 검토합니다.
4. GitHub는 검토된 파일을 가져와 영어, 프랑스어, 독일어 릴리스 노트가 포함된 릴리스 하나를 게시합니다.

그 결과 저장소에 자연스럽게 통합된 프로세스가 만들어집니다. 엔지니어는 풀 리퀘스트에서 작업하고, 언어 검토자는 Hyperlocalise에서 문맥을 확인하며 작업하며, 릴리스에는 Git으로 돌아온 번역만 사용됩니다.

If you want the broader product pattern before the implementation details, see the [GitHub product localisation use case](/use-cases/product-localisation).

## 만들어 볼 것

다음과 같은 구조의 웹 애플리케이션이 있다고 가정해 보세요:

```text
.
├── .github/workflows/
│   ├── localise.yml
│   └── release.yml
├── locales/
│   ├── en-US.json
│   ├── de-DE.json
│   └── fr-FR.json
├── release-notes/
│   ├── en-US/v1.8.0.md
│   ├── de-DE/v1.8.0.md
│   └── fr-FR/v1.8.0.md
└── i18n.yml
```

영어는 원본 로캘입니다. 프랑스어와 독일어는 대상 로캘입니다. JSON 파일에는 제품 문구가, Markdown 파일에는 릴리스 노트가 들어 있습니다. Hyperlocalise는 둘 다 번역할 콘텐츠로 취급하므로, 동일한 검토 주기에서 인터페이스와 공지 사항을 모두 검토합니다.

필요한 것:

- a Hyperlocalise project with `en-US` as its source locale and `fr-FR` and `de-DE` as targets;
- a `HYPERLOCALISE_API_KEY` GitHub Actions secret;
- a `HYPERLOCALISE_PROJECT_ID` GitHub Actions secret; and
- 워크플로 및 리포지토리 시크릿 추가 권한.

Use a GitHub environment such as `localisation` for production credentials if your organisation requires deployment approvals.

## 1단계: 소스 및 대상 파일 매핑

Create `i18n.yml` at the repository root:

```yaml
version: hyperlocalise@1.13.4

locales:
  source: en-US
  targets:
    - fr-FR
    - de-DE

buckets:
  product:
    files:
      - from: locales/{{source}}.json
        to: locales/{{target}}.json
  release-notes:
    files:
      - from: release-notes/{{source}}/*.md
        to: release-notes/{{target}}/*.md

llm:
  profiles:
    default:
      provider: openai
      model: gpt-6-luna

hyperlocalise:
  project_id_env: HYPERLOCALISE_PROJECT_ID
  api_base_url: https://hyperlocalise.com/api
  api_key_env: HYPERLOCALISE_API_KEY
```

The two buckets make ownership explicit. `product` maps one source catalogue to one catalogue per target locale. `release-notes` maps every English Markdown file to the equivalent locale directory while preserving its filename.

Pinning the CLI in the configuration also makes local and CI runs agree. Update the example version to the release your team has tested. If you omit `version`, pin the `version` input in the install action instead.

LLM 프로필은 프로젝트에서 해당 제공업체를 사용해 번역을 생성할 때 사용됩니다. 자격 증명을 워크플로에 추가하는 대신 Hyperlocalise에 저장하세요. GitHub 러너에는 Hyperlocalise 프로젝트에 대한 자격 증명만 있으면 됩니다.

## 2단계: 제품을 한 가지 변경하세요.

Suppose version 1.8.0 adds saved filters. The pull request changes `locales/en-US.json`:

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

It also adds `release-notes/en-US/v1.8.0.md`:

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

기능 변경과 함께 원본 콘텐츠를 커밋하세요. 그러면 리뷰어가 하나의 풀 리퀘스트에서 코드 변경 사항, UI 문구, 고객에게 공개되는 설명을 확인할 수 있습니다. 또한 Git 기록을 통해 어떤 문구가 어떤 릴리스에 포함되었는지 확인할 수 있습니다.

Do not hand-copy English strings into `fr-FR.json` or `de-DE.json` as placeholders. A copied source value can look complete to a simple key-count check even though no localisation happened.

## 3단계: 풀 리퀘스트에서 변경된 문자열 확인

Add `.github/workflows/localise.yml`. The first job runs on pull requests and scopes Hyperlocalise findings to the GitHub diff:

```yaml
name: Localise

on:
  pull_request:
    paths:
      - "i18n.yml"
      - "locales/**"
      - "release-notes/**"
      - ".github/workflows/localise.yml"
  push:
    branches: [main]
    paths:
      - "i18n.yml"
      - "locales/en-US.json"
      - "release-notes/en-US/**"
  workflow_dispatch:
    inputs:
      pull_translations:
        description: Pull reviewed translations into a pull request
        required: true
        type: boolean
        default: true

concurrency:
  group: localise-${{ github.event_name }}-${{ github.ref }}
  cancel-in-progress: false

jobs:
  check:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    steps:
      - uses: actions/checkout@v4

      - name: Check changed localisation content
        uses: hyperlocalise/hyperlocalise@v1
        with:
          check: check
          config-path: i18n.yml
          hyperlocalise-version: config
          github-diff: true
          fail-on-findings: true
          upload-artifact: true
```

With `github-diff: true`, the action fetches the pull request patch and passes it to `hyperlocalise check --diff-stdin`. For supported structured catalogues, annotations focus on keys changed by this pull request rather than making the author resolve unrelated backlog.

이 작업은 JSON 보고서와 텍스트 요약도 업로드합니다. 검사가 실패하더라도 해당 파일을 보존하세요. 이 파일들은 구조 오류, 누락된 번역, 콘텐츠 관련 문제를 설치 또는 구성 실패와 구분하는 데 도움이 됩니다.

이 검사는 첫 번째 검토 단계이지, 언어 검토는 아닙니다. 검토자가 각 번역이 정확하고 일관되며 제품에 적합한지 판단하는 동안 저장소 문제를 조기에 찾아냅니다.

## 4단계: 병합된 소스 콘텐츠를 Hyperlocalise에 푸시하기

Add a second job to the same `localise.yml` workflow:

```yaml
push-sources:
  if: github.event_name == 'push'
  runs-on: ubuntu-latest
  environment: localisation
  permissions:
    contents: read
  steps:
    - uses: actions/checkout@v4

    - name: Install Hyperlocalise
      uses: hyperlocalise/hyperlocalise/install@v1
      with:
        version: config

    - name: Push source content
      run: hl sync push
      env:
        HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
        HYPERLOCALISE_PROJECT_ID: ${{ secrets.HYPERLOCALISE_PROJECT_ID }}
```

This is the push boundary. After the feature pull request merges to `main`, `hl sync push` reads the buckets in `i18n.yml` and sends the English JSON and Markdown sources to the linked Hyperlocalise project.

The job has read-only repository permission because it sends content out but does not modify Git. Its credentials live only in the step that needs them. The `paths` filter prevents unrelated merges from creating unnecessary sync runs.

커밋하기 전에 동일한 작업을 실행할 수 있습니다:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Use `--dry-run` when changing bucket mappings. It lets you inspect the plan before updating the remote project.

## 5단계: 제품 문자열과 릴리스 노트를 함께 검토하세요

소스 동기화가 완료되면 Hyperlocalise에서 새 콘텐츠를 검토하세요. UI 문자열과 릴리스 노트는 별도의 버킷에 유지되지만 프로젝트 용어, 지침, 대상 로캘은 공유합니다.

이 예시에서는 검토자가 문자 그대로의 정확성뿐 아니라 더 많은 것을 확인해야 합니다:

| 콘텐츠         | 검토 질문                                          |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Is this clearly an action, rather than a saved state?    |
| `filters.saved` | Does the term match navigation and settings copy?        |
| UI에 잘 맞고 “workspace” 용어를 유지하나요? |
| 릴리스 제목   | 제품 기능과 동일한 이름을 사용하나요?        |
| 릴리스 항목 | 명령어, 메뉴 이름 및 사용자 결과가 일관적인가요?  |

짧은 문자열의 의미가 모호하다면 제품 관련 맥락이나 스크린샷을 첨부하세요. “필터 저장”이라는 문구만 본 번역가는 이것이 버튼인지, 토스트 메시지인지, 페이지 제목인지 알 수 없습니다. 바로 이런 맥락에서 플랫폼은 CLI를 보완합니다. Git은 파일을 옮기고, Hyperlocalise는 올바른 언어적 결정을 내리는 데 필요한 지식을 담아 전달합니다.

가져오기 전에 프로젝트 워크플로에 따라 검토 의견을 해결하고 번역을 승인하세요. 승인은 행정 절차가 아니라 출시 관문으로 간주하세요.

## 6단계: 검토된 번역을 GitHub로 가져오기

Add a third job to `localise.yml`:

```yaml
pull-translations:
  if: github.event_name == 'workflow_dispatch' && inputs.pull_translations
  runs-on: ubuntu-latest
  environment: localisation
  permissions:
    contents: write
    pull-requests: write
  steps:
    - uses: actions/checkout@v4

    - name: Install Hyperlocalise
      uses: hyperlocalise/hyperlocalise/install@v1
      with:
        version: config

    - name: Pull reviewed translations
      run: hl sync pull
      env:
        HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
        HYPERLOCALISE_PROJECT_ID: ${{ secrets.HYPERLOCALISE_PROJECT_ID }}

    - name: Create translation pull request
      uses: peter-evans/create-pull-request@v8
      with:
        branch: hyperlocalise/reviewed-translations
        delete-branch: true
        commit-message: "chore(i18n): sync reviewed translations"
        title: "chore(i18n): sync reviewed translations"
        body: |
          Pulls the latest reviewed product strings and release notes from
          Hyperlocalise. Check terminology, placeholders, links, and locale
          coverage before merging.
        labels: localization
```

Run this job from the **Actions** tab after review. `hl sync pull` writes target content to the paths in `i18n.yml`, producing files such as:

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

The workflow opens a pull request instead of committing directly to `main`. That preserves branch protection, gives engineers a chance to run the application with each locale, and records the exact translations included in the release.

프로덕션 환경에서는 종속성 정책에 따라 타사 액션을 전체 커밋 SHA로 고정하세요. 변경 가능한 메이저 태그를 사용하면 이 튜토리얼을 읽기 쉽게 유지할 수 있지만, 변경 불가능한 참조는 공급망 위험을 줄여 줍니다.

## 7단계: 번역된 풀 리퀘스트 테스트

The automated check will run again because the translation pull request changes `locales/**` and `release-notes/**`. Add your application's own tests to the required checks as well.

최소한 다음 사항을 확인하세요:

- 모든 대상 카탈로그에 새 키가 포함되어 있습니다;
- 플레이스홀더와 ICU 인수가 원본과 일치합니다;
- 번역된 버튼이 지원되는 뷰포트 크기에 맞습니다;
- 마크다운 제목, 목록, 링크 및 코드 스팬은 여전히 올바르게 렌더링됩니다;
- 제품과 릴리스 노트는 동일한 기능명을 사용합니다; 그리고
- 소스 문자열이 대상 파일로 유출되지 않았습니다.

검토자는 렌더링된 제품도 열어봐야 합니다. 파일 수준 검토로 용어 오류는 찾아낼 수 있지만, 버튼이 잘리거나 중요한 텍스트를 숨기는 줄바꿈은 확인할 수 없습니다.

해당 검사가 통과한 경우에만 번역 풀 리퀘스트를 병합하세요. 이제 Git에는 릴리스에 승인된 언어 상태가 포함되어 있습니다.

## 8단계: 다국어 릴리스 노트 게시

GitHub Releases has one release body, so assemble each locale into one Markdown document. Add `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build multilingual release notes
        env:
          VERSION: ${{ github.ref_name }}
        run: |
          set -euo pipefail
          mkdir -p dist

          for locale in en-US fr-FR de-DE; do
            file="release-notes/${locale}/${VERSION}.md"
            test -s "${file}" || {
              echo "Missing release notes: ${file}" >&2
              exit 1
            }
          done

          {
            printf '# English\n\n'
            cat "release-notes/en-US/${VERSION}.md"
            printf '\n\n---\n\n# Français\n\n'
            cat "release-notes/fr-FR/${VERSION}.md"
            printf '\n\n---\n\n# Deutsch\n\n'
            cat "release-notes/de-DE/${VERSION}.md"
          } > dist/release-notes.md

      - name: Publish GitHub release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "${{ github.ref_name }}" --verify-tag --notes-file dist/release-notes.md
```

기능 및 번역 풀 리퀘스트가 모두 병합된 후에만 태그를 생성하세요:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

어느 로캘이든 릴리스 노트가 없거나 비어 있으면 릴리스 작업은 실패합니다. 이는 의도된 동작입니다. 별다른 알림 없이 대체 처리하면 불완전한 릴리스가 다국어 릴리스인 것처럼 표시됩니다. 작업이 실패하면 검토를 거쳐 다시 반영해야 할 파일이 무엇인지 팀에 정확히 알려 줍니다.

동일한 태그로 빌드 및 배포 작업을 실행할 수 있습니다. 공지가 공개되기 전에 바이너리가 준비되어야 한다면 릴리스 작업이 해당 작업에 종속되도록 설정하세요.

## 전체 흐름은 어떻게 작동하는가

완성된 GitHub 현지화 워크플로는 방향이 명확합니다:

```text
feature branch
    │
    ├─ change English strings and release notes
    └─ pull request: Hyperlocalise check + application tests
             │
             ▼
           main
             │
             └─ hl sync push → Hyperlocalise
                                  │
                                  ├─ translate
                                  ├─ review
                                  └─ approve
                                       │
                                       ▼
                              manual hl sync pull
                                       │
                                       ▼
                           translation pull request
                                       │
                                       ├─ checks
                                       ├─ visual QA
                                       └─ merge
                                            │
                                            ▼
                                       version tag
                                            │
                                            └─ multilingual GitHub release
```

각 전환에는 하나의 책임이 있습니다. 풀 리퀘스트는 저장소 변경 사항을 검토하고, Hyperlocalise는 언어 관련 결정을 검토합니다. 태그는 변경할 수 없는, 이미 검토된 상태를 게시합니다.

## 일반적인 실패 유형

### PR 검사에서 관련 없는 번역이 보고됩니다

Confirm the action runs on a `pull_request` event and sets `github-diff: true`. The action needs `pull-requests: read` so it can fetch the patch. Diff-scoped checking applies to supported structured translation files; keep full-project checks in a separate scheduled job if you also want backlog visibility.

### 소스 푸시를 인증할 수 없습니다.

Check that both `HYPERLOCALISE_API_KEY` and `HYPERLOCALISE_PROJECT_ID` exist in the selected GitHub environment. Environment secrets are not available unless the job declares that environment, and protected environments may wait for approval.

### 번역을 가져와도 Git diff가 생성되지 않습니다.

First confirm that translation work has finished in the same project named by `HYPERLOCALISE_PROJECT_ID`. Then check the target paths in `i18n.yml`. Run `hl sync pull --dry-run` locally to inspect the planned download without overwriting files.

### 릴리스에서 릴리스 노트를 찾을 수 없습니다

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### 번역은 제품 출시 후에 도착합니다

번역 동기화를 추적되지 않는 출시 후 작업으로 만들지 마세요. 태그를 생성하기 전에 번역 풀 리퀘스트를 필수로 요구하거나, 배포 워크플로에서 현지화를 명시적인 릴리스 후보 검사 항목으로 지정하세요.

## 릴리스 체크리스트

다국어 버전에 태그를 지정하기 전에 다음 사항을 확인하세요:

- [ ] 소스 문자열과 영어 릴리스 노트가 함께 병합되었습니다;
- [ ] 풀 리퀘스트 현지화 검사를 통과했습니다;
- [ ] `hl sync push` completed after merge;
- [ ] 대상 언어가 Hyperlocalise에서 검토 및 승인되었습니다;
- [ ] `hl sync pull` opened a translation pull request;
- [ ] 자동화, 언어 및 시각적 검사를 통과했습니다;
- [ ] 번역 풀 리퀘스트가 병합되었으며; 그리고
- [ ] 모든 릴리스 노트 로캘에 태그와 일치하는 비어 있지 않은 파일이 있습니다.

## 현지화를 릴리스 프로세스 내에 유지하세요.

GitHub 현지화에서 중요한 것은 YAML이 아닙니다. 책임 소재가 분명한 인계가 이어지는 과정입니다.

The `hyperlocalise` CLI connects repository files to the platform. The GitHub Action gives engineers fast feedback on changed strings. Hyperlocalise gives language reviewers the context and approval workflow that Git alone cannot provide. The final tag publishes exactly what the team reviewed.

이를 통해 현지화는 개발 후에 하는 작업이 아니라 릴리스 자체의 일부가 됩니다.

[Explore Hyperlocalise for product localisation](/use-cases/product-localisation) to connect your repositories, review workflows, and multilingual releases.
