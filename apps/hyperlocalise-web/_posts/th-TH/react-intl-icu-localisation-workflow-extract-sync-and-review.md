---
title: "React Intl และการแปลภาษา ICU: ดึงข้อมูล ซิงค์ และตรวจสอบด้วย Hyperlocalise"
date: 2026-09-24T00:00:00.000Z
excerpt: ผสาน react-intl และไวยากรณ์ข้อความ ICU เข้ากับเวิร์กโฟลว์ที่ทำงานร่วมกับรีโพโดยตรง—ดึงแค็ตตาล็อกด้วย Hyperlocalise CLI ตรวจสอบรูปพหูพจน์ใน pull request ตรวจทานใน Hyperlocalise และนำไฟล์ JSON ที่แปลแล้วขึ้นสู่ระบบจริง
category: วิศวกรรม
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

React Intl จัดเก็บข้อความที่ผู้ใช้เห็นไว้ใน TypeScript แต่ผู้แปลและ CI ต้องการแค็ตตาล็อกที่เสถียรบนดิสก์ ไวยากรณ์ ICU—รูปพหูพจน์ การเลือก ตัวเลข และวันที่—ต้องคงเดิมตลอดกระบวนการส่งต่อ โดยไม่ทำให้เกิดข้อผิดพลาดขณะรันโปรแกรม

คู่มือนี้แสดงวิธีเชื่อมต่อ **react-intl**, **ICU** และ **`hyperlocalise` CLI** ให้เป็นเวิร์กโฟลว์เดียวกัน:

1. วิศวกรเขียนข้อความใน `defineMessages` และ `<FormattedMessage />`.
2. `hl extract` รีเฟรชแค็ตตาล็อก FormatJS ภาษาอังกฤษจากแหล่งที่มา
3. GitHub ตรวจสอบ pull request เพื่อหาความคลาดเคลื่อน คีย์ที่ขาดหาย และปัญหาเกี่ยวกับรูปแบบ ICU
4. `hl sync push` ส่งแค็ตตาล็อกไปยัง Hyperlocalise เพื่อตรวจสอบ
5. และ `hl sync pull` กับ `hl pack` จะนำคำแปลที่ผ่านการตรวจทานกลับเข้าสู่ `lang/*.json` สำหรับแอปของคุณ

รูปแบบนี้สอดคล้องกับวิธีที่ Hyperlocalise ใช้เว็บแอปของตัวเอง สำหรับบันทึกประจำรุ่นและไฟล์ JSON ที่ไม่ใช่ React ในที่เก็บเดียวกัน ให้นำบทแนะนำนี้ไปใช้ร่วมกับ[เวิร์กโฟลว์การแปลเป็นภาษาท้องถิ่นบน GitHub ตั้งแต่ pull request ไปจนถึงการเผยแพร่หลายภาษา](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)

## สิ่งที่เราจะสร้าง

สมมติว่าเป็นแอป React ที่ใช้ Next.js หรือ Vite โดยมีโครงสร้างดังนี้:

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

ภาษาอังกฤษ (`en-US`) เป็นภาษาต้นทาง ภาษาฝรั่งเศสและภาษาเยอรมันเป็นภาษาเป้าหมาย รหัสข้อความและค่า `defaultMessage` อยู่ในไฟล์ `*.messages.ts` (โมดูลฝั่งไคลเอนต์) และในตัวบรรยายแบบอินไลน์บางรายการ JSON ที่แยกออกมาคือสิ่งที่ Hyperlocalise ซิงค์ ส่วน JSON ที่แพ็กแล้วคือสิ่งที่แอปจำนวนมากนำเข้าในขณะรันไทม์

สิ่งที่คุณต้องมี:

- โปรเจ็กต์ Hyperlocalise ที่มี `en-US` เป็นภาษาต้นทางและภาษาเป้าหมายของคุณ;
- และ `HYPERLOCALISE_API_KEY` และ `HYPERLOCALISE_PROJECT_ID` เป็นข้อมูลลับของ GitHub Actions; และ
- มี `react-intl` (หรือ `@formatjs/intl`) ติดตั้งอยู่ในแอปแล้ว

## ขั้นตอนที่ 1: เขียนข้อความ react-intl ที่รองรับ ICU

เก็บข้อความผลิตภัณฑ์ไว้ในตัวอธิบายข้อความ อย่ากระจายเป็นสตริงลิเทอรัล ใช้ ID ที่ระบุชัดเจน เพื่อให้การดึงข้อความและการตรวจทานยังคงเสถียรเมื่อมีการเปลี่ยนถ้อยคำ

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

ใช้ ICU ภายใน `defaultMessage` เมื่อข้อความขึ้นอยู่กับตัวเลขหรือ enum React Intl จะประเมินข้อความทั้งหมดขณะรันไทม์ นักแปลต้องคงโครงสร้าง `{count, plural, ...}` และ `{scope, select, ...}` ไว้ พร้อมเปลี่ยนเฉพาะข้อความที่อ่านได้ในแต่ละ branch

ในคอมโพเนนต์ของหน้า ให้ส่งค่า ICU ผ่าน `formatMessage` หรือ `<FormattedMessage />`:

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

**คอมโพเนนต์ฝั่งเซิร์ฟเวอร์:** อย่านำเข้า `*.messages.ts` จากโมดูลที่ใช้ได้เฉพาะฝั่งเซิร์ฟเวอร์—`defineMessages` ใช้ได้เฉพาะฝั่งไคลเอนต์ ให้ทำเครื่องหมาย UI เป็น `"use client"` หรือใช้วัตถุ `{ id, defaultMessage, description }` แบบอินไลน์ร่วมกับ `getIntlShape(locale).formatMessage()` บนเซิร์ฟเวอร์ ดูขอบเขตของ react-intl ในเฟรมเวิร์กของคุณ ขั้นตอนการดึงข้อมูลยังคงค้นหาตัวบรรยายในไฟล์ `.ts` และ `.tsx` ที่สแกนอยู่ได้

หลีกเลี่ยง `--flatten` กับข้อความ ICU ที่คุณตั้งใจจะเผยแพร่เป็นหน่วย react-intl เดียว การทำให้แบนราบจะยกแขนง plural และ select ขึ้นมาเพื่อเวิร์กโฟลว์การแปลเฉพาะทาง ซึ่งไม่ใช่ค่าเริ่มต้นสำหรับแค็ตตาล็อกรันไทม์

## ขั้นตอนที่ 2: จับคู่แค็ตตาล็อกใน `i18n.yml`

สร้าง `i18n.yml` ที่รูทของ repository (หรือภายในไดเรกทอรีแอปของคุณ หาก monorepo เก็บไฟล์ config ไว้ข้าง UI):

```yaml
version: hyperlocalise@1.13.5

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

Hyperlocalise ถือว่า FormatJS JSON เป็นเนื้อหาชั้นหนึ่ง: แต่ละคีย์คือ message id และแต่ละค่ามี `defaultMessage` และ `description` ซึ่งเป็นตัวเลือก สตริง ICU จะคงเป็นค่าเดียวต่อ id—`run`, `check` และการซิงก์จะไม่แบ่งสตริงเหล่านั้นออกเป็นประโยค

ตรึงเวอร์ชัน CLI ใน `i18n.yml` (หรือตรึงเวอร์ชันของ install action) เพื่อให้เครื่องภายในเครื่องและ GitHub Actions ใช้ตัวดึงข้อมูลและตัวตรวจสอบชุดเดียวกัน

## ขั้นตอนที่ 3: แยกแค็ตตาล็อกต้นทางด้วย CLI

จากไดเรกทอรีที่มี `i18n.yml` ให้รีเฟรชแคตตาล็อกภาษาอังกฤษ:

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

`extract` สแกน `.ts` และ `.tsx` เพื่อค้นหาตัวบรรยายใน:

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

มันเขียน JSON ของ FormatJS แบบเคร่งครัด:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

หาก descriptor ไม่ระบุ `id` CLI จะสร้างแฮชที่เข้ากันได้กับ FormatJS จาก `defaultMessage` และ `description` การระบุ id อย่างชัดเจนทำให้ตรวจสอบได้ง่ายขึ้นใน diff และใน Hyperlocalise.

คอมมิต `lang/en-US.json` ไปพร้อมกับการเปลี่ยนแปลงโค้ด หากไม่มีคอมมิตไฟล์ extract ให้ถือว่าเหมือนกับไม่มี migration: แพลตฟอร์มจะไม่เห็นสตริงใหม่จนกว่าแค็ตตาล็อกจะได้รับการอัปเดต

ไม่บังคับ: `--prefix-id` จะเติมเส้นทางไฟล์ที่ปรับรูปแบบแล้วไว้หน้ารหัส `src.components.saved-filters-banner.title` ใช้คู่กับ `hl pack --prefix-id` เมื่อบันเดิลขณะรันไทม์ต้องการรหัสแบบสั้น ตัวอย่างที่นี่ใช้รหัสเชิงตรรกะที่คงที่แทน

## ขั้นตอนที่ 4: ป้องกัน pull request ด้วย extract และ `check`

เพิ่ม `.github/workflows/localise.yml`:

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

เกตสองตัวทำงานร่วมกัน:

1. **การเปลี่ยนแปลงของไฟล์ Extract ไม่ตรงกัน** — หากมีคนแก้ไข `defaultMessage` ในโค้ดแต่ลืม `hl extract` งานจะล้มเหลวที่ `git diff`.
2. **`hyperlocalise check`** — ร่วมกับ `github-diff: true` ใช้ตรวจสอบคีย์ที่เปลี่ยนแปลงใน `lang/en-US.json` และเป้าหมายเพื่อหาปัญหา เช่น `not_localized`, `placeholder_mismatch` และ **`icu_shape_mismatch`**.

การตรวจสอบครั้งสุดท้ายนั้นสำคัญต่อ ICU: สตริงภาษาฝรั่งเศสที่ทำ `{count, plural, ...}` หลุดหายไปหรือสลับลำดับสาขา อาจดูเหมือนไม่มีปัญหาสำหรับคนที่กวาดตาดู JSON แต่จะทำงานผิดพลาดขณะรัน การตรวจจับความคลาดเคลื่อนของโครงสร้างใน CI มีต้นทุนต่ำกว่าการตรวจพบปัญหาในระบบจริงมาก

เรียกใช้การตรวจสอบแบบเดียวกันในเครื่องก่อนพุช:

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## ขั้นตอนที่ 5: พุชแค็ตตาล็อกที่แยกออกมาหลังจาก merge

เพิ่มงาน push ในเวิร์กโฟลว์เดียวกัน:

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

หลังจาก merge แล้ว `hl sync push` จะอัปโหลด `lang/en-US.json` ไปยังโปรเจ็กต์ Hyperlocalise ที่เชื่อมโยงไว้ การเรียกใช้ extract ซ้ำกับ `main` จะช่วยหลีกเลี่ยง race condition ที่โค้ดถูก merge โดยไม่มีแค็ตตาล็อกที่ตรงกันใน Git

ใช้ `hl sync push --dry-run` เมื่อคุณเปลี่ยนเส้นทางของบัคเก็ตหรือรายการโลแคล

## ขั้นตอนที่ 6: ตรวจทานข้อความ ICU ใน Hyperlocalise

นักแปลควรเห็นข้อความ ICU ทั้งหมด ไม่ใช่ข้อความภาษาอังกฤษที่แยกเป็นส่วน ๆ ในขั้นตอนตรวจทาน ให้ถามคำถามเฉพาะสำหรับแต่ละภาษา ซึ่ง ICU ซ่อนไว้ในสตริงเดียว:

| ข้อความ                    | คำถามสำหรับการตรวจสอบ                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | แขนง `=0`, `one` และ `other` อ่านได้เป็นธรรมชาติหรือไม่? `#` ขยายได้อย่างถูกต้องตามกฎพหูพจน์ของแต่ละโลแคลหรือไม่? |
| `filters.banner.scope`      | `select` ครอบคลุมค่าทุกค่า `scope` ที่แอปส่งมาหรือไม่? `other` เป็นค่าทดแทนสำรองที่ปลอดภัยหรือไม่?                             |
| ป้ายกำกับสั้นๆ                | ข้อความที่แปลแล้วยังพอดีกับปุ่มหลังการขยายรูปพหูพจน์หรือไม่?                                                |

แนบภาพหน้าจอเมื่อมีแขนงพหูพจน์ในเลย์เอาต์ที่มีข้อจำกัด Hyperlocalise จะเก็บอภิธานศัพท์และคำแนะนำของโปรเจกต์ไว้พร้อมกับเซกเมนต์ ส่วน CLI ทำหน้าที่เพียงย้ายไฟล์เท่านั้น

อนุมัติคำแปลบนแพลตฟอร์มก่อนดึงกลับมา การอนุมัติเป็นด่านตรวจด้านภาษา ส่วน Git จะบันทึกสิ่งที่นำไปใช้งานจริง

## ขั้นตอนที่ 7: ดึงคำแปลและแพ็กสำหรับใช้งานขณะรัน

เพิ่มงานดึงข้อมูลด้วยตนเอง:

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

`sync pull` เขียน `lang/fr-FR.json` และ `lang/de-DE.json` ในรูปแบบของ FormatJS (ids, `defaultMessage` และบางครั้งมี `description`) `hl pack` ลบ `description` และข้อมูลเมตาอื่น ๆ ออก โดยยังคงรักษา ICU ในแต่ละ `defaultMessage` ไว้ พร้อมสำหรับบันเดิลเลอร์ที่นำเข้า JSON แยกตาม locale

ตัวอย่างรายการภาษาฝรั่งเศสแบบแพ็ก:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

เปิด pull request สำหรับการแปลในแอป เปลี่ยน locale แล้วทดสอบ `count = 0`, `count = 1` และ `count = 5` การถดถอยของ ICU มักปรากฏเฉพาะกับกฎพหูพจน์ที่ไม่ใช่ภาษาอังกฤษ

## ขั้นตอนที่ 8: โหลดแคตตาล็อกในแอป

นำเข้าไฟล์ locale ที่บรรจุไว้แล้ว แล้วแมปไปยัง `IntlProvider` หรือ `createIntl`:

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

บางทีมเก็บค่าเริ่มต้นภาษาอังกฤษไว้ในซอร์สโค้ดเท่านั้น และโหลด JSON สำหรับภาษาเป้าหมายเท่านั้น—ทั้งสองแนวทางใช้ได้ หาก `defaultMessage` ในโค้ดและ `lang/en-US.json` สอดคล้องกันผ่านการดึงข้อมูล

## โฟลว์ทั้งหมดทำงานอย่างไร

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

Extract เชื่อมต่อโค้ดกับแค็ตตาล็อก, Sync เชื่อมต่อแค็ตตาล็อกกับผู้ตรวจทาน และ Pack เชื่อมต่อ JSON ที่ผ่านการตรวจทานแล้วเข้ากับบันเดิลของคุณ.

## รูปแบบความล้มเหลวที่พบบ่อย

### Pull request ไม่ผ่านเมื่อ extract เกิดความคลาดเคลื่อน

เรียกใช้ `hl extract` ในเครื่องโดยใช้รูปแบบ `--ignore` เดียวกับ CI แล้วคอมมิต `lang/en-US.json` และพุช หาก ID เพิ่มขึ้นอย่างไม่คาดคิด ให้ตรวจสอบว่าตัวบรรยายมีฟิลด์ `id` ที่คงที่รวมอยู่ด้วย

### `icu_shape_mismatch` ในคำแปลที่โดยรวมแล้ว “ดี”

เปรียบเทียบลำดับ branch และชื่อ placeholder กับ `en-US` เรียกใช้ `hl check --check icu_shape_mismatch --locale fr-FR` ในเครื่อง แก้ไข JSON เป้าหมายหรือส่งส่วนนี้กลับไปตรวจสอบ—อย่าปิดการตรวจสอบสำหรับข้อความ ICU จริง ๆ

### รันไทม์แสดง `MISSING_TRANSLATION` หรือภาษาอังกฤษในภาษาท้องถิ่นเป้าหมาย

ยืนยันว่า pull request สำหรับการแปลถูกรวมแล้ว, `hl pack` ทำงานแล้ว และการนำเข้าชี้ไปยังไฟล์ที่แพ็กไว้ ตรวจสอบว่า message id ในโค้ดตรงกับคีย์ใน JSON (รวมถึงรูปแบบ `--prefix-id` หากมี)

### `hl sync pull` ไม่เปลี่ยนแปลงอะไร

ยืนยันการอนุมัติในโปรเจ็กต์ที่อ้างอิงโดย `HYPERLOCALISE_PROJECT_ID` เรียกใช้ `hl sync pull --dry-run` ตรวจสอบให้แน่ใจว่าเส้นทาง `i18n.yml` `to:` ตรงกับตำแหน่งที่แอปนำเข้าแค็ตตาล็อก

### ไฟล์แพ็กถูกลบ ICU ออกโดยไม่ตั้งใจ

ใช้ `hl pack` เป็นค่าเริ่มต้นบน FormatJS JSON ซึ่งจะคง `defaultMessage` ไว้ อย่าเรียกใช้ pack ด้วยเวิร์กโฟลว์ที่ออกแบบมาสำหรับ JSON แบบ nested ธรรมดา เว้นแต่แค็ตตาล็อกของคุณจะมีโครงสร้างแบบนั้น

## รายการตรวจสอบก่อนเผยแพร่

ก่อนเปิดตัวฟีเจอร์ที่ต้องใช้ข้อความใหม่:

- [ ] ตัวบอกข้อความถูกรวมเข้ากับรายการที่แยกออกมา `lang/en-US.json`
- [ ] การดึงข้อมูล Pull request และ `hyperlocalise check` ผ่านแล้ว
- [ ] `hl sync push` ทำงานเมื่อ `main`
- [ ] ตรวจสอบและอนุมัติภาษาเป้าหมายใน Hyperlocalise แล้ว
- [ ] รวม pull request การแปลแล้ว (`sync pull` + `pack`)
- [ ] ตรวจสอบ QA ด้วยตนเองกับสาขาพหูพจน์และ `select` สำหรับแต่ละภาษา
- [ ] การปรับใช้ในระบบ Production ใช้อาร์ติแฟกต์ที่ผสานแล้ว `lang/*.json`

## คอยแจ้ง extract ให้ทราบอยู่เสมอ

React Intl สนับสนุนให้วางข้อความไว้ใกล้กับโค้ดที่ใช้งาน ส่วน Hyperlocalise สนับสนุนคำแปลที่ผ่านการตรวจทานและจัดเก็บไว้ในไฟล์ คำสั่ง **`hl extract`** เชื่อมโยงแนวทางทั้งสองเข้าด้วยกัน โดยไม่ต้องใช้ FormatJS CLI แยกต่างหากสำหรับแค็ตตาล็อกพื้นฐาน

ใช้ **`check`** เพื่อรักษาโครงสร้าง ICU ใน pull request ใช้ **sync** สำหรับเวิร์กโฟลว์ของผู้ตรวจสอบ ใช้ **`pack`** เพื่อให้บันเดิลสำหรับโปรดักชันมีขนาดเล็ก ขณะที่นักแปลยังคงเก็บข้อมูลเมตาที่ครบถ้วนไว้ใน Git ระหว่างการดึงข้อมูลแต่ละครั้ง】【。

หากต้องการดูภาพรวมการเผยแพร่รุ่นของ GitHub ที่ครอบคลุมยิ่งขึ้น ซึ่งรวมถึงบันทึกประจำรุ่น Markdown ควบคู่ไปกับสตริง UI โปรดอ่านต่อที่ [เวิร์กโฟลว์การแปลเป็นภาษาท้องถิ่นของ GitHub: จาก pull request สู่การเผยแพร่หลายภาษา](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release) หรือ [สำรวจการแปลผลิตภัณฑ์เป็นภาษาท้องถิ่นบน Hyperlocalise](/use-cases/product-localisation)
