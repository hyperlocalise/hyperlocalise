---
title: "GitHub 현지화 워크플로: 풀 리퀘스트부터 다국어 릴리스까지"
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

이 가이드에서는 GitHub Actions, `hyperlocalise` CLI, Hyperlocalise 플랫폼을 사용해 GitHub 현지화 워크플로를 설정하는 방법을 안내합니다. 간단한 예제로 시작해 첫 풀 리퀘스트부터 다국어 릴리스까지 제품 변경 사항 하나를 따라가 봅니다.

마지막에는 워크플로가 네 단계를 모두 포함하게 됩니다:

1. 엔지니어가 영어 UI 문자열과 릴리스 노트를 변경합니다.
2. GitHub은 풀 리퀘스트에 현지화 문제가 있는지 확인합니다.
3. CLI는 소스 콘텐츠를 Hyperlocalise로 푸시하며, 팀은 그곳에서 번역을 검토합니다.
4. GitHub는 검토된 파일을 가져와 영어, 프랑스어, 독일어 릴리스 노트가 포함된 릴리스 하나를 게시합니다.

이는 저장소에 자연스럽게 통합된 프로세스입니다. 엔지니어는 풀 리퀘스트에서 작업하고, 언어 검토자는 Hyperlocalise에서 문맥을 확인하며, 릴리스에는 Git에 반영된 번역만 사용됩니다.

구현 세부 정보에 앞서 더 넓은 제품 패턴을 살펴보고 싶다면, [GitHub 제품 현지화 사용 사례](/use-cases/product-localisation)를 참조하세요.

## 우리가 만들 것

다음과 같은 구조를 가진 웹 애플리케이션이 있다고 가정해 보세요:

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

영어는 원본 로캘입니다. 프랑스어와 독일어는 대상 로캘입니다. JSON 파일에는 제품 문구가, Markdown 파일에는 릴리스 노트가 들어 있습니다. Hyperlocalise는 둘 다 번역 가능한 콘텐츠로 취급하므로, 동일한 검토 주기에서 인터페이스와 공지 사항을 함께 검토합니다.

필요한 것:

- 소스 로캘이 `en-US`이고 `fr-FR` 및 `de-DE`를 대상으로 하는 Hyperlocalise 프로젝트;
- `HYPERLOCALISE_API_KEY` GitHub Actions 시크릿;
- 하나의 `HYPERLOCALISE_PROJECT_ID` GitHub Actions 시크릿; 그리고
- 워크플로와 리포지토리 시크릿을 추가할 권한.

조직에서 배포 승인을 요구하는 경우 프로덕션 자격 증명에 `localisation`와 같은 GitHub 환경을 사용하세요.

## 1단계: 소스 및 대상 파일 매핑

저장소 루트에 `i18n.yml`을 생성하세요:

```yaml
version: hyperlocalise@1.13.3

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

두 버킷은 소유권을 명확히 합니다. `product`은 하나의 소스 카탈로그를 각 대상 로캘의 카탈로그 하나에 매핑합니다. `release-notes`은 모든 영어 Markdown 파일을 파일명을 유지하면서 해당 로캘 디렉터리에 매핑합니다.

설정에서 CLI 버전을 고정하면 로컬 및 CI 실행 결과도 일치합니다. 예시 버전을 팀에서 테스트한 릴리스로 업데이트하세요. `version`을 생략하는 경우, 대신 설치 작업에서 `version` 입력을 고정하세요.

LLM 프로필은 프로젝트에서 해당 공급자를 사용해 번역을 생성할 때 사용됩니다. 공급자 인증 정보는 워크플로에 추가하는 대신 Hyperlocalise에 저장하세요. GitHub 러너에는 Hyperlocalise 프로젝트에 대한 인증 정보만 있으면 됩니다.

## 2단계: 제품을 한 가지 변경하기

버전 1.8.0에서 저장된 필터를 추가한다고 가정해 보겠습니다. 풀 리퀘스트에서 `locales/en-US.json`을 변경합니다:

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

또한 `release-notes/en-US/v1.8.0.md`도 추가합니다:

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

기능과 함께 소스 콘텐츠를 커밋하세요. 그러면 리뷰어가 하나의 풀 리퀘스트에서 코드 변경 사항, UI 문구, 고객 대상 설명을 모두 확인할 수 있습니다. 또한 Git 기록을 통해 특정 릴리스에 어떤 문구가 포함되어 출시되었는지 확인할 수 있습니다.

`fr-FR.json` 또는 `de-DE.json`에 영어 문자열을 그대로 복사해 넣지 마세요. 원문을 복사한 값은 간단한 키 개수 검사에서는 완성된 것처럼 보일 수 있지만, 실제로는 현지화가 이루어지지 않은 것입니다.

## 3단계: 풀 리퀘스트에서 변경된 문자열 확인

`.github/workflows/localise.yml`를 추가하세요. 첫 번째 작업은 풀 리퀘스트에서 실행되며 Hyperlocalise에서 발견한 항목을 GitHub diff로 제한합니다:

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

`github-diff: true`을 사용하면 작업이 풀 리퀘스트 패치를 가져와 `hyperlocalise check --diff-stdin`에 전달합니다. 지원되는 구조화된 카탈로그의 경우, 작성자가 관련 없는 백로그를 해결하도록 하는 대신 이 풀 리퀘스트에서 변경된 키에 주석을 집중합니다.

이 작업은 JSON 보고서와 텍스트 요약도 업로드합니다. 검사가 실패하더라도 해당 아티팩트를 보존하세요. 이를 통해 구조적 오류, 누락된 번역, 콘텐츠 관련 발견 사항을 설치 또는 구성 실패와 구분할 수 있습니다.

이 검사는 언어 검토가 아니라 첫 번째 검토 단계입니다. 검토자가 각 번역의 정확성, 일관성, 제품 적합성을 판단하는 동안 저장소 문제를 조기에 발견합니다.

## 4단계: 병합된 소스 콘텐츠를 Hyperlocalise에 푸시

동일한 `localise.yml` 워크플로에 두 번째 작업을 추가합니다:

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

이것이 푸시 경계입니다. 기능 풀 리퀘스트가 `main`에 병합되면, `hl sync push`은 `i18n.yml`의 버킷을 읽고 영어 JSON 및 Markdown 소스를 연결된 Hyperlocalise 프로젝트로 전송합니다.

작업은 콘텐츠를 외부로 전송하지만 Git을 수정하지 않으므로 저장소에 대한 읽기 전용 권한을 갖습니다. 해당 자격 증명은 필요한 단계에만 저장됩니다. `paths` 필터는 관련 없는 병합으로 인해 불필요한 동기화 실행이 생성되는 것을 방지합니다.

커밋하기 전에 동일한 작업을 실행할 수 있습니다:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

버킷 매핑을 변경할 때 `--dry-run`을 사용하세요. 원격 프로젝트를 업데이트하기 전에 계획을 확인할 수 있습니다.

## 5단계: 제품 문자열과 릴리스 노트를 함께 검토하기

소스 동기화가 완료되면 Hyperlocalise에서 새 콘텐츠를 검토하세요. UI 문자열과 릴리스 노트는 별도의 버킷에 유지되지만 프로젝트 용어, 지침, 대상 로캘은 공유합니다.

이 예시에서는 검토자가 문자 그대로의 정확성뿐 아니라 다른 측면도 확인해야 합니다:

| 내용            | 검토 질문                                      |
| --------------- | ---------------------------------------------- |
| `filters.save`  | 이것은 저장된 상태가 아니라 명확한 동작인가요? |
| `filters.saved` | 용어가 내비게이션 및 설정 문구와 일치하나요?   |
| 설명            | UI에 적합하며 “workspace” 용어를 유지하나요?   |
| 릴리스 제목     | 제품 기능과 동일한 이름을 사용하나요?          |
| 릴리스 항목     | 명령어, 메뉴 이름 및 사용자 결과가 일관되나요? |

짧은 문자열이 모호하다면 제품 맥락이나 스크린샷을 첨부하세요. 번역가가 “필터 저장”이라는 문구만 보면 버튼인지, 토스트 메시지인지, 페이지 제목인지 알 수 없습니다. 플랫폼은 바로 이 지점에서 CLI를 보완합니다. Git은 파일을 이동하고, Hyperlocalise는 올바른 언어적 판단을 내리는 데 필요한 정보를 전달합니다.

프로젝트 워크플로에 따라 검토 의견을 해결하고 번역을 승인한 후 다시 가져오세요. 승인을 단순한 행정 절차가 아니라 릴리스 게이트로 취급하세요.

## 6단계: 검토된 번역을 GitHub로 가져오기

`localise.yml`에 세 번째 작업을 추가합니다:

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

검토 후 **Actions** 탭에서 이 작업을 실행하세요. `hl sync pull`은(는) 대상 콘텐츠를 `i18n.yml`에 지정된 경로에 기록하여 다음과 같은 파일을 생성합니다:

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

워크플로는 `main`에 직접 커밋하는 대신 풀 리퀘스트를 엽니다. 이렇게 하면 브랜치 보호가 유지되고, 엔지니어가 각 로캘로 애플리케이션을 실행해 볼 기회를 얻으며, 릴리스에 포함된 번역을 정확히 기록할 수 있습니다.

프로덕션에서는 종속성 정책에 따라 타사 액션을 전체 커밋 SHA로 고정하세요. 변경될 수 있는 메이저 태그를 사용하면 이 튜토리얼을 쉽게 읽을 수 있지만, 변경 불가능한 참조를 사용하면 공급망 위험을 줄일 수 있습니다.

## 7단계: 번역된 풀 리퀘스트 테스트

번역 풀 리퀘스트에서 `locales/**` 및 `release-notes/**`을 변경하므로 자동 검사가 다시 실행됩니다. 애플리케이션 자체 테스트도 필수 검사에 추가하세요.

최소한 다음 사항을 확인하세요:

- 모든 대상 카탈로그에는 새 키가 포함되어 있습니다;
- 플레이스홀더와 ICU 인수는 원문과 일치합니다;
- 번역된 버튼이 지원되는 뷰포트 크기에 맞습니다;
- Markdown 제목, 목록, 링크 및 코드 구문이 여전히 올바르게 렌더링됩니다;
- 제품과 릴리스 노트에서 동일한 기능 이름을 사용하며;
- 원본 문자열이 대상 파일로 유출되지 않았습니다.

검토자는 렌더링된 제품도 열어봐야 합니다. 파일 수준의 검토로 용어 오류는 찾아낼 수 있지만, 버튼이 잘리거나 줄바꿈으로 중요한 텍스트가 가려지는 문제는 발견할 수 없습니다.

해당 검사가 통과한 경우에만 번역 풀 리퀘스트를 병합하세요. Git에는 이제 릴리스에 승인된 언어 상태가 포함되어 있습니다.

## 8단계: 다국어 릴리스 노트 게시

GitHub 릴리스에는 릴리스 본문이 하나만 있으므로 각 로캘의 내용을 하나의 Markdown 문서로 모으세요. `.github/workflows/release.yml` 추가:

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

기능 및 번역 풀 리퀘스트가 병합된 후에만 태그를 생성하세요:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

어느 로캘이든 릴리스 노트가 누락되었거나 비어 있으면 릴리스 작업이 실패합니다. 이는 의도된 동작입니다. 대체 처리를 조용히 수행하면 불완전한 릴리스가 다국어 릴리스로 표시되지만, 작업이 실패하면 팀은 어떤 파일을 검토 절차에 다시 보내야 하는지 정확히 알 수 있습니다.

같은 태그로 빌드 및 배포 작업을 실행할 수 있습니다. 공지가 게시되기 전에 바이너리가 있어야 한다면 릴리스 작업이 해당 작업에 의존하도록 설정하세요.

## 전체 흐름이 작동하는 방식

완성된 GitHub 현지화 워크플로에는 명확한 방향이 있습니다:

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

각 전환에는 하나의 책임이 있습니다. 풀 리퀘스트는 저장소 변경 사항을 검토합니다. Hyperlocalise는 언어 관련 결정을 검토합니다. 태그는 변경할 수 없고 이미 검토된 상태를 게시합니다.

## 일반적인 실패 유형

### PR 검사에서 관련 없는 번역이 보고됩니다.

액션이 `pull_request` 이벤트에서 실행되고 `github-diff: true`을 설정하는지 확인하세요. 액션이 패치를 가져오려면 `pull-requests: read`이 필요합니다. diff 범위 검사는 지원되는 구조화된 번역 파일에 적용됩니다. 백로그도 확인하려면 전체 프로젝트 검사는 별도의 예약 작업으로 유지하세요.

### 소스 푸시에 인증할 수 없습니다.

선택한 GitHub 환경에 `HYPERLOCALISE_API_KEY`과 `HYPERLOCALISE_PROJECT_ID`이 모두 있는지 확인하세요. 작업에서 해당 환경을 지정하지 않으면 환경 시크릿을 사용할 수 없으며, 보호된 환경은 승인을 기다려야 할 수 있습니다.

### 번역을 가져와도 Git diff가 발생하지 않습니다

먼저 `HYPERLOCALISE_PROJECT_ID`이라는 같은 프로젝트에서 번역 작업이 완료되었는지 확인하세요. 그런 다음 `i18n.yml`의 대상 경로를 확인하세요. 파일을 덮어쓰지 않고 다운로드 예정 항목을 확인하려면 `hl sync pull --dry-run`을 로컬에서 실행하세요.

### 릴리스에서 릴리스 노트를 찾을 수 없습니다.

태그와 Markdown 파일 이름이 정확히 일치해야 합니다. 태그 `v1.8.0`에는 `release-notes/<locale>/v1.8.0.md`이 필요합니다. 두 위치 모두에서 `v`을 유지하거나, 워크플로의 경로 구성을 한 번의 의도적인 규칙 업데이트로 변경하세요.

### 번역은 제품 출시 이후 제공됩니다.

번역 동기화를 추적되지 않는 출시 후 작업으로 만들지 마세요. 태그를 만들기 전에 번역 풀 리퀘스트를 필수로 하거나, 배포 워크플로에서 현지화를 명시적인 릴리스 후보 점검 항목으로 설정하세요.

## 출시 체크리스트

다국어 버전에 태그를 지정하기 전에 다음을 확인하세요:

- [ ] 소스 문자열과 영어 릴리스 노트가 함께 병합됨;
- [ ] 풀 리퀘스트 현지화 검사를 통과했습니다;
- [ ] `hl sync push` 병합 후 완료됨;
- [ ] 대상 언어가 Hyperlocalise에서 검토 및 승인되었습니다;
- [ ] `hl sync pull`님이 번역 풀 리퀘스트를 열었습니다;
- [ ] 자동화, 언어 및 시각적 검사를 통과함;
- [ ] 번역 풀 리퀘스트가 병합되었고;
- [ ] 모든 릴리스 노트 로캘에는 태그와 일치하는 비어 있지 않은 파일이 있습니다.

## 현지화를 릴리스 프로세스에 포함하세요.

GitHub 현지화에서 중요한 것은 YAML이 아닙니다. 책임 소재가 분명한 인수인계가 이어지는 과정입니다.

`hyperlocalise` CLI는 저장소 파일을 플랫폼에 연결합니다. GitHub Action은 엔지니어가 변경된 문자열에 대한 피드백을 빠르게 받을 수 있도록 합니다. Hyperlocalise는 언어 검토자에게 Git만으로는 제공할 수 없는 문맥과 승인 워크플로를 제공합니다. 최종 태그는 팀이 검토한 내용을 정확히 게시합니다.

그렇게 하면 현지화는 개발 후에 하는 작업이 아니라 릴리스 자체의 일부가 됩니다.

[제품 현지화를 위해 Hyperlocalise를 살펴보세요](/use-cases/product-localisation) 저장소, 검토 워크플로, 다국어 릴리스를 연결하세요.
