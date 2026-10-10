---
title: "React Intl 및 ICU 현지화: Hyperlocalise로 추출, 동기화 및 검토"
date: 2026-09-24T00:00:00.000Z
excerpt: react-intl과 ICU 메시지 구문을 저장소에 적합한 워크플로에 통합하세요. Hyperlocalise CLI로 카탈로그를 추출하고, 풀 리퀘스트에서 복수형을 검증하고, Hyperlocalise에서 검토한 뒤, 번역된 JSON을 프로덕션에 배포하세요.
category: 엔지니어링
tags:
  - react-intl
  - ICU message format
  - FormatJS
  - hyperlocalise extract
  - localization CLI
  - continuous localisation
  - software localisation
  - GitHub Actions
  - translation review
  - i18n.yml
---

React Intl은 사용자에게 표시되는 문구를 TypeScript에 저장하지만, 번역가와 CI에는 디스크에 안정적인 카탈로그가 필요합니다. 복수형, 선택형, 숫자, 날짜와 같은 ICU 구문은 런타임에 오류가 발생하지 않도록 이 전달 과정에서도 그대로 유지되어야 합니다.

이 가이드에서는 **react-intl**, **ICU**, 그리고 **`hyperlocalise` CLI**를 하나의 워크플로에 연결하는 방법을 설명합니다:

1. 엔지니어는 `defineMessages` 및 `<FormattedMessage />`로 메시지를 작성합니다.
2. `hl extract`는 소스에서 영어 FormatJS 카탈로그를 새로 고칩니다.
3. GitHub는 풀 리퀘스트에서 드리프트, 누락된 키 및 ICU 형식 문제를 확인합니다.
4. `hl sync push`가 검토를 위해 카탈로그를 Hyperlocalise에 전송합니다.
5. `hl sync pull` 및 `hl pack`는 검토된 번역을 앱의 `lang/*.json`에 다시 가져옵니다.

이 패턴은 Hyperlocalise가 자체 웹 앱을 직접 사용하며 테스트하는 방식과 일치합니다. 같은 저장소의 릴리스 노트와 React를 사용하지 않는 JSON의 경우, 이 튜토리얼을 [풀 리퀘스트부터 다국어 릴리스까지 이어지는 GitHub 현지화 워크플로](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)와 함께 활용하세요.

## 우리가 만들 것

다음과 같은 구조의 Next.js 또는 Vite React 앱이라고 가정합니다:

```text
.
├── .github/workflows/
│   └── localise.yml
├── src/
│   ├── components/
│   │   └── saved-filters-banner.messages.ts
│   └── app/
│       └── filters-page.tsx
├── lang/
│   ├── en-US.json          # extracted source catalog (FormatJS shape)
│   ├── fr-FR.json
│   └── de-DE.json
└── i18n.yml
```

영어(`en-US`)가 소스 로케일입니다. 프랑스어와 독일어는 대상 로케일입니다. 메시지 ID와 `defaultMessage` 값은 `*.messages.ts` 파일(클라이언트 모듈)과 가끔 인라인 디스크립터에 있습니다. 추출된 JSON은 Hyperlocalise가 동기화하는 파일이고, 패킹된 JSON은 많은 앱이 런타임에 가져오는 파일입니다.

필요한 항목:

- `en-US`를 소스 로캘로, 대상 로캘을 설정하는 Hyperlocalise 프로젝트;
- 그리고 `HYPERLOCALISE_API_KEY` 및 `HYPERLOCALISE_PROJECT_ID`을 GitHub Actions 시크릿으로 설정하고;
- `react-intl`(또는 `@formatjs/intl`)이(가) 앱에 이미 설치되어 있습니다.

## 1단계: ICU를 인식하는 react-intl 메시지 작성

제품 문구는 문자열 리터럴로 여기저기 흩어 놓지 말고 메시지 디스크립터에 유지하세요. 문구가 변경되더라도 추출과 검토가 안정적으로 이루어지도록 명시적인 ID를 사용하세요.

`src/components/saved-filters-banner.messages.ts`:

```ts
"use client";

import { defineMessages } from "react-intl";

export const savedFiltersBannerMessages = defineMessages({
  title: {
    id: "filters.banner.title",
    defaultMessage: "Saved filters",
    description: "Heading above the saved-filters list",
  },
  savedCount: {
    id: "filters.banner.savedCount",
    defaultMessage:
      "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    description: "Banner summary of how many filters the user saved",
  },
  scope: {
    id: "filters.banner.scope",
    defaultMessage:
      "{scope, select, workspace {Shared with your workspace} personal {Only visible to you} other {Custom scope}}",
    description: "Explains who can see the saved filter set",
  },
});
```

숫자나 열거형에 따라 문구가 달라지는 경우 `defaultMessage` 내부에서 ICU를 사용하세요. React Intl은 런타임에 전체 메시지를 평가합니다. 번역자는 사람이 읽을 수 있는 분기는 변경하되 `{count, plural, ...}` 및 `{scope, select, ...}` 스켈레톤을 보존해야 합니다.

페이지 컴포넌트에서 ICU 값을 `formatMessage` 또는 `<FormattedMessage />`을 통해 전달하세요:

```tsx
"use client";

import { FormattedMessage, useIntl } from "react-intl";
import { savedFiltersBannerMessages } from "../components/saved-filters-banner.messages";

export function FiltersPage({ savedCount, scope }: { savedCount: number; scope: string }) {
  const intl = useIntl();

  return (
    <section>
      <h1>
        <FormattedMessage {...savedFiltersBannerMessages.title} />
      </h1>
      <p>{intl.formatMessage(savedFiltersBannerMessages.savedCount, { count: savedCount })}</p>
      <p>{intl.formatMessage(savedFiltersBannerMessages.scope, { scope })}</p>
    </section>
  );
}
```

**서버 컴포넌트:** 서버 전용 모듈에서 `*.messages.ts`을(를) 가져오지 마세요. `defineMessages`은(는) 클라이언트 전용입니다. UI에 `"use client"`을(를) 표시하거나 서버에서 `getIntlShape(locale).formatMessage()`을(를) 사용하는 인라인 `{ id, defaultMessage, description }` 객체를 사용하세요. 프레임워크의 react-intl 경계에 관한 문서를 참고하세요. 추출 단계는 스캔하는 `.ts` 및 `.tsx` 파일에서도 설명자를 계속 찾습니다.

단일 react-intl 단위로 배포하려는 ICU 메시지에서는 `--flatten`을 피하세요. Flattening은 특수 번역 워크플로를 위해 복수형 및 선택 분기를 상위로 끌어올립니다. 런타임 카탈로그에서는 기본 동작이 아닙니다.

## 2단계: 다음에서 카탈로그 매핑 `i18n.yml`

저장소 루트에 `i18n.yml`를 생성하세요(또는 모노레포에서 UI 옆에 설정 파일을 두는 경우 앱 디렉터리 아래에):

```yaml
version: hyperlocalise@1.13.3

locales:
  source: en-US
  targets:
    - fr-FR
    - de-DE

buckets:
  ui:
    files:
      - from: lang/{{source}}.json
        to: lang/{{target}}.json

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

Hyperlocalise는 FormatJS JSON을 일급 콘텐츠로 취급합니다. 각 키는 메시지 ID이고, 각 값에는 `defaultMessage`이 포함되며 `description`은 선택 사항입니다. ICU 문자열은 ID당 하나의 값으로 유지되며, `run`, `check` 및 sync는 이를 문장 단위로 분할하지 않습니다.

로컬 머신과 GitHub Actions에서 동일한 추출기와 검증기를 실행하도록 `i18n.yml`의 CLI 버전을 고정하거나 설치 액션을 고정하세요.

## 3단계: CLI로 소스 카탈로그 추출

`i18n.yml`가 포함된 디렉터리에서 영어 카탈로그를 새로 고치세요:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"

hl extract src \
  --out-file lang/en-US.json \
  --ignore "**/*.test.ts" \
  --ignore "**/*.test.tsx" \
  --ignore "**/*.stories.tsx" \
  --ignore "**/__tests__/**"
```

`extract`은(는) `.ts` 및 `.tsx`에서 설명자를 검색합니다:

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

엄격한 FormatJS JSON을 작성합니다:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

descriptor에서 `id`를 생략하면 CLI가 `defaultMessage`와 `description`를 바탕으로 FormatJS 호환 해시를 생성합니다. 명시적 ID는 diff와 Hyperlocalise에서 검토하기가 더 쉽습니다.

`lang/en-US.json`을 코드 변경과 함께 커밋하세요. 추출 커밋이 누락된 경우 마이그레이션이 누락된 것과 동일하게 처리하세요. 카탈로그가 업데이트되기 전까지 플랫폼은 새 문자열을 볼 수 없습니다.

선택 사항: `--prefix-id`는 ID 앞에 정규화된 파일 경로(`src.components.saved-filters-banner.title`)를 붙입니다. 런타임 번들에서 짧은 ID를 기대하는 경우 `hl pack --prefix-id`와 함께 사용하세요. 여기의 예시에서는 대신 안정적인 논리 ID를 사용합니다.

## 4단계: extract와 `check`를 사용해 풀 리퀘스트를 보호하세요

추가 `.github/workflows/localise.yml`:

```yaml
name: Localise

on:
  pull_request:
    paths:
      - "i18n.yml"
      - "lang/**"
      - "src/**/*.ts"
      - "src/**/*.tsx"
      - ".github/workflows/localise.yml"
  push:
    branches: [main]
    paths:
      - "i18n.yml"
      - "lang/en-US.json"
      - "src/**/*.ts"
      - "src/**/*.tsx"
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

      - name: Install Hyperlocalise
        uses: hyperlocalise/hyperlocalise/install@v1
        with:
          version: config

      - name: Verify extracted catalog matches source
        run: |
          set -euo pipefail
          hl extract src \
            --out-file lang/en-US.json \
            --ignore "**/*.test.ts" \
            --ignore "**/*.test.tsx" \
            --ignore "**/*.stories.tsx" \
            --ignore "**/__tests__/**"
          git diff --exit-code -- lang/en-US.json

      - name: Check localisation content
        uses: hyperlocalise/hyperlocalise@v1
        with:
          check: check
          config-path: i18n.yml
          hyperlocalise-version: config
          github-diff: true
          fail-on-findings: true
          upload-artifact: true
```

두 개의 게이트가 함께 작동합니다:

1. **추출 불일치** — 코드에서 `defaultMessage`를 수정하고 `hl extract`를 잊으면, `git diff`에서 작업이 실패합니다.
2. **`hyperlocalise check`** — `github-diff: true`와 함께 `lang/en-US.json`의 변경된 키와 대상을 검증하여 `not_localized`, `placeholder_mismatch`, **`icu_shape_mismatch`** 등의 문제를 찾습니다.

마지막 점검은 ICU에서 중요합니다. `{count, plural, ...}`를 누락하거나 분기를 재배열한 프랑스어 문자열은 JSON을 대충 훑어보는 사람에게는 괜찮아 보일 수 있지만 런타임에는 실패합니다. CI에서 구조 변화를 잡아내는 편이 프로덕션에서 발견하는 것보다 비용이 적게 듭니다.

푸시하기 전에 동일한 검사를 로컬에서 실행하세요:

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## 5단계: 병합 후 추출된 카탈로그를 푸시합니다

같은 워크플로에 push 작업을 추가합니다:

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

    - name: Refresh source catalog
      run: |
        hl extract src \
          --out-file lang/en-US.json \
          --ignore "**/*.test.ts" \
          --ignore "**/*.test.tsx" \
          --ignore "**/*.stories.tsx" \
          --ignore "**/__tests__/**"

    - name: Push sources
      run: hl sync push
      env:
        HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
        HYPERLOCALISE_PROJECT_ID: ${{ secrets.HYPERLOCALISE_PROJECT_ID }}
```

병합 후, `hl sync push`은 연결된 Hyperlocalise 프로젝트에 `lang/en-US.json`을 업로드합니다. `main`에서 extract를 다시 실행하면 Git에 일치하는 카탈로그가 없는 상태로 코드가 병합되는 경쟁 상태를 방지할 수 있습니다.

버킷 경로나 로캘 목록을 변경할 때는 `hl sync push --dry-run`을 사용하세요.

## 6단계: Hyperlocalise에서 ICU 메시지 검토

번역가는 영어 문구만 따로 보는 것이 아니라 전체 ICU 메시지를 확인해야 합니다. 검토할 때는 ICU가 하나의 문자열에 숨겨 둔 로캘별 질문을 확인하세요:

| 메시지                      | 검토 질문                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | `=0`, `one`, `other` 분기는 자연스럽게 읽히나요? `#`는 각 로캘의 복수형 규칙에 맞게 올바르게 확장되나요? |
| `filters.banner.scope`      | 앱에서 전송하는 모든 `scope` 값이 `select`에 포함되나요? `other`은 안전한 대체값인가요?                  |
| 짧은 레이블                 | 복수형 확장 후에도 번역된 문자열이 버튼에 들어가나요?                                                    |

제한된 레이아웃에서 복수형 분기가 나타나면 스크린샷을 첨부하세요. Hyperlocalise는 용어집과 프로젝트 지침을 세그먼트와 함께 유지하고, CLI는 파일만 이동합니다.

플랫폼에서 번역을 승인한 후 다시 가져오세요. 승인은 언어 품질 관리 단계이며, Git은 실제로 배포되는 내용을 기록합니다.

## 7단계: 번역을 가져와 런타임용으로 패키징하기

수동 가져오기 작업을 추가합니다:

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

    - name: Refresh source catalog
      run: |
        hl extract src --out-file lang/en-US.json \
          --ignore "**/*.test.ts" \
          --ignore "**/*.test.tsx"

    - name: Pull reviewed translations
      run: hl sync pull
      env:
        HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
        HYPERLOCALISE_PROJECT_ID: ${{ secrets.HYPERLOCALISE_PROJECT_ID }}

    - name: Pack locale catalogs
      run: hl pack --bucket ui

    - name: Create translation pull request
      uses: peter-evans/create-pull-request@v8
      with:
        branch: hyperlocalise/reviewed-translations
        delete-branch: true
        commit-message: "chore(i18n): sync reviewed react-intl catalogs"
        title: "chore(i18n): sync reviewed react-intl catalogs"
        body: |
          Pulls reviewed UI strings from Hyperlocalise.

          - `hl sync pull` — download target locale JSON
          - `hl pack` — strip translator metadata, keep id → defaultMessage

          Verify ICU placeholders, plural branches, and layout in fr-FR and de-DE before merging.
        labels: localization
```

`sync pull`은 FormatJS 형식(id, `defaultMessage`, 때로는 `description`)으로 `lang/fr-FR.json`와 `lang/de-DE.json`를 작성합니다. `hl pack`은 각 `defaultMessage`의 ICU를 보존하면서 `description` 및 기타 메타데이터를 제거합니다. 로케일별 JSON을 가져오는 번들러에서 바로 사용할 수 있습니다.

프랑스어 항목 압축 예시:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

앱에서 번역 풀 리퀘스트를 열고, 로캘을 전환한 다음 `count = 0`, `count = 1`, `count = 5`를 테스트하세요. ICU 회귀는 영어가 아닌 복수형 규칙에서만 나타나는 경우가 많습니다.

## 8단계: 앱에서 카탈로그 불러오기

패킹된 로캘 파일을 가져와 `IntlProvider` 또는 `createIntl`에 매핑합니다:

```tsx
import frFR from "../lang/fr-FR.json";
import deDE from "../lang/de-DE.json";

const catalogs = {
  "fr-FR": flattenFormatJSCatalog(frFR),
  "de-DE": flattenFormatJSCatalog(deDE),
};

function flattenFormatJSCatalog(
  catalog: Record<string, { defaultMessage: string } | string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(catalog).map(([id, value]) => [
      id,
      typeof value === "string" ? value : value.defaultMessage,
    ]),
  );
}
```

일부 팀은 소스 코드에만 영어 기본값을 두고 대상 언어에 대해서만 JSON을 로드합니다. 두 방식 모두 코드의 `defaultMessage`와 `lang/en-US.json`가 extract를 통해 서로 일치하면 사용할 수 있습니다.

## 전체 흐름의 동작 방식

```text
feature branch
    │
    ├─ edit *.messages.ts / FormattedMessage
    ├─ hl extract → lang/en-US.json
    └─ pull request
           ├─ extract drift check
           └─ hyperlocalise check (ICU + keys, diff-scoped)
                    │
                    ▼
                  main
                    │
                    ├─ hl extract
                    └─ hl sync push → Hyperlocalise
                                         │
                                         ├─ translate + review ICU
                                         └─ approve
                                              │
                                              ▼
                                   workflow_dispatch
                                              │
                                              ├─ hl sync pull
                                              ├─ hl pack
                                              └─ translation pull request
                                                       │
                                                       └─ merge → deploy
```

Extract는 코드를 카탈로그에 연결합니다. Sync는 카탈로그를 검토자와 연결합니다. Pack은 검토된 JSON을 번들에 연결합니다.

## 일반적인 실패 유형

### 추출 데이터 불일치로 풀 리퀘스트 실패

CI와 동일한 `--ignore` 패턴으로 `hl extract`을 로컬에서 실행하고, `lang/en-US.json`한 다음 푸시하세요. ID가 예상치 않게 건너뛰면 설명자에 안정적인 `id` 필드가 포함되어 있는지 확인하세요.

### `icu_shape_mismatch` 그 외에는 “좋은” 번역에서

분기 순서와 자리표시자 이름을 `en-US`와 비교하세요. `hl check --check icu_shape_mismatch --locale fr-FR`을 로컬에서 실행하세요. 대상 JSON을 수정하거나 이 세그먼트를 검토를 위해 다시 보내세요. 실제 ICU 메시지에 대한 검사를 무시하지 마세요.

### 런타임에 `MISSING_TRANSLATION` 또는 대상 로케일의 영어가 표시됩니다.

번역 풀 리퀘스트가 병합되었는지, `hl pack`이 실행되었는지, 가져오기가 패킹된 파일을 가리키는지 확인하세요. 코드의 메시지 ID가 JSON의 키와 일치하는지(`--prefix-id` 규칙 포함) 확인하세요.

### `hl sync pull` 아무것도 바꾸지 않습니다

`HYPERLOCALISE_PROJECT_ID`에서 참조된 프로젝트의 승인을 확인하세요. `hl sync pull --dry-run`을 실행하세요. `i18n.yml` `to:` 경로가 앱에서 카탈로그를 가져오는 경로와 일치하는지 확인하세요.

### 패키징된 파일에서 ICU가 실수로 제거됨

FormatJS JSON에서는 기본값 `hl pack`을 사용하세요. 그러면 `defaultMessage`이 그대로 유지됩니다. 카탈로그 형식이 일반 중첩 JSON인 경우가 아니라면 일반 중첩 JSON용 워크플로로 pack을 실행하지 마세요.

## 릴리스 체크리스트

새 문구에 의존하는 기능을 출시하기 전에:

- [ ] 추출된 메시지 설명자와 병합됨 `lang/en-US.json`
- [ ] 풀 리퀘스트 추출 및 `hyperlocalise check` 통과
- [ ] `hl sync push`이(가) `main`에 실행됨
- [ ] Hyperlocalise에서 대상 로캘을 검토하고 승인함
- [ ] 번역 풀 리퀘스트 병합됨 (`sync pull` + `pack`)
- [ ] 로케일별 복수형 및 `select` 분기 수동 QA
- [ ] 프로덕션 배포는 병합된 `lang/*.json` 아티팩트를 사용합니다

## extract도 계속 상황을 알 수 있게 해 주세요.

React Intl은 문구를 함께 배치하는 방식을 권장하고, Hyperlocalise는 검토된 파일 기반 번역을 권장합니다. **`hl extract`** 명령은 기본 카탈로그에 별도의 FormatJS CLI를 도입하지 않고도 두 방식을 연결합니다.

풀 리퀘스트에서 ICU 구조를 보호하려면 **`check`**를 사용하세요. 리뷰어 워크플로에는 **sync**를 사용하세요. 프로덕션 번들을 가볍게 유지하면서 번역가가 pull 사이에 Git에 풍부한 메타데이터를 보관할 수 있도록 **`pack`**를 사용하세요.

UI 문자열과 함께 Markdown 릴리스 노트까지 포함한 더 폭넓은 GitHub 릴리스 이야기를 보려면 [풀 리퀘스트부터 다국어 릴리스까지: GitHub 현지화 워크플로](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)를 확인하거나, [Hyperlocalise에서 제품 현지화 살펴보기](/use-cases/product-localisation)를 확인하세요.
