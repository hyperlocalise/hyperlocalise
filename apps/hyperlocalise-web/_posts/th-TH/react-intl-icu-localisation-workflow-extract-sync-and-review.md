---
title: "React Intl และการแปลภาษา ICU: ดึงข้อมูล ซิงค์ และตรวจสอบด้วย Hyperlocalise"
date: 2026-09-24T00:00:00.000Z
excerpt: ผสาน react-intl และไวยากรณ์ข้อความ ICU เข้ากับเวิร์กโฟลว์ของรีโพโดยตรง—ดึงแค็ตตาล็อกด้วย Hyperlocalise CLI ตรวจสอบรูปพหูพจน์ใน pull request ตรวจทานใน Hyperlocalise และนำไฟล์ JSON ที่แปลแล้วขึ้นใช้งานจริง
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

React Intl เก็บข้อความที่ผู้ใช้เห็นไว้ใน TypeScript แต่ผู้แปลและ CI ต้องมีแค็ตตาล็อกที่เสถียรบนดิสก์ ไวยากรณ์ ICU ทั้งรูปพหูพจน์ การเลือก ตัวเลข และวันที่ ต้องคงอยู่ตลอดการส่งต่อดังกล่าวโดยไม่ทำให้เกิดข้อผิดพลาดขณะรันไทม์.

คู่มือนี้แสดงวิธีเชื่อมต่อ **react-intl**, **ICU** และ **`hyperlocalise` CLI** ให้เป็นเวิร์กโฟลว์เดียวกัน:

1. วิศวกรเขียนข้อความใน `defineMessages` และ `<FormattedMessage />`.
2. `hl extract` รีเฟรชแค็ตตาล็อก FormatJS ภาษาอังกฤษจากแหล่งที่มา
3. GitHub ตรวจสอบ pull request ว่ามีความคลาดเคลื่อน คีย์ที่ขาดหายไป และปัญหาเกี่ยวกับโครงสร้าง ICU หรือไม่
4. `hl sync push` ส่งแค็ตตาล็อกไปยัง Hyperlocalise เพื่อตรวจสอบ
5. และ `hl sync pull` และ `hl pack` จะนำคำแปลที่ผ่านการตรวจสอบแล้วกลับเข้าสู่ `lang/*.json` สำหรับแอปของคุณ

รูปแบบนี้สอดคล้องกับวิธีที่ Hyperlocalise ใช้เว็บแอปของตนเอง สำหรับบันทึกประจำรุ่นและไฟล์ JSON ที่ไม่ใช่ React ในที่เก็บเดียวกัน ให้ใช้บทแนะนำนี้ร่วมกับเวิร์กโฟลว์การแปลเป็นภาษาท้องถิ่นบน [GitHub ตั้งแต่ pull request ไปจนถึงการเผยแพร่หลายภาษา](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)

## สิ่งที่เราจะสร้างขึ้น

สมมติว่าเป็นแอป React ที่ใช้ Next.js หรือ Vite และมีโครงสร้างดังนี้:

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

ภาษาอังกฤษ (`en-US`) เป็น locale ต้นทาง ส่วนภาษาฝรั่งเศสและภาษาเยอรมันเป็น locale เป้าหมาย ID ของข้อความและค่า `defaultMessage` อยู่ในไฟล์ `*.messages.ts` (โมดูลฝั่งไคลเอ็นต์) และใน descriptor แบบ inline บางรายการ JSON ที่แยกออกมาคือสิ่งที่ Hyperlocalise ซิงค์ ส่วน JSON ที่แพ็กแล้วคือสิ่งที่แอปจำนวนมากนำเข้าในขณะทำงาน

สิ่งที่คุณต้องมี:

- โปรเจกต์ Hyperlocalise ที่ใช้ `en-US` เป็นภาษาแหล่งที่มาและภาษาเป้าหมายของคุณ;
- และ `HYPERLOCALISE_API_KEY` และ `HYPERLOCALISE_PROJECT_ID` เป็น GitHub Actions secrets; และ
- `react-intl` (หรือ `@formatjs/intl`) ติดตั้งอยู่ในแอปแล้วแล้ว

## ขั้นตอนที่ 1: เขียนข้อความ react-intl ที่รองรับ ICU

เก็บข้อความผลิตภัณฑ์ไว้ในตัวบรรยายข้อความ ไม่กระจายเป็นสตริงตัวอักษร ใช้ ID ที่ระบุชัดเจน เพื่อให้การดึงข้อความและการตรวจทานมีความคงที่ แม้ถ้อยคำจะเปลี่ยนไป

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

ใช้ ICU ภายใน `defaultMessage` เมื่อข้อความขึ้นอยู่กับตัวเลขหรือ enum React Intl จะประเมินข้อความทั้งหมดขณะรันไทม์ นักแปลต้องคงโครงสร้าง `{count, plural, ...}` และ `{scope, select, ...}` ไว้ พร้อมปรับข้อความที่ผู้ใช้อ่านได้ในแต่ละกรณีตามต้องการેણ

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

**คอมโพเนนต์เซิร์ฟเวอร์:** อย่านำเข้า `*.messages.ts` จากโมดูลที่ทำงานเฉพาะฝั่งเซิร์ฟเวอร์—`defineMessages` ใช้ได้เฉพาะฝั่งไคลเอนต์ ให้ทำเครื่องหมาย UI เป็น `"use client"` หรือใช้วัตถุ `{ id, defaultMessage, description }` แบบ inline พร้อม `getIntlShape(locale).formatMessage()` บนเซิร์ฟเวอร์ โปรดดูขอบเขตการทำงานของ react-intl ในเฟรมเวิร์กของคุณ ขั้นตอนการดึงข้อมูลยังคงค้นหาตัวบรรยายในไฟล์ `.ts` และ `.tsx` ที่สแกนอยู่】【。

หลีกเลี่ยง `--flatten` ในข้อความ ICU ที่คุณต้องการส่งเป็นหน่วย react-intl เดียว การทำให้แบนจะยกสาขา plural และ select ขึ้นมาเพื่อรองรับเวิร์กโฟลว์การแปลเฉพาะทาง ซึ่งไม่ใช่ค่าเริ่มต้นสำหรับแค็ตตาล็อกรันไทม์

## ขั้นตอนที่ 2: แมปแค็ตตาล็อกใน `i18n.yml`

สร้าง `i18n.yml` ไว้ที่รูทของ repository (หรือในไดเรกทอรีแอปของคุณ หาก monorepo เก็บไฟล์กำหนดค่าไว้ข้าง UI):

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

Hyperlocalise ถือว่า FormatJS JSON เป็นเนื้อหาประเภท first-class: แต่ละคีย์คือ message id และแต่ละค่าจะมี `defaultMessage` และ `description` ซึ่งเป็นตัวเลือก ข้อความ ICU จะคงเป็นค่าเดียวต่อ id—`run`, `check` และ sync จะไม่แยกข้อความเหล่านี้ตามประโยค

กำหนดเวอร์ชัน CLI ให้ตายตัวใน `i18n.yml` (หรือกำหนดเวอร์ชันของ install action ให้ตายตัว) เพื่อให้เครื่องในเครื่องและ GitHub Actions ใช้ตัวแยกข้อมูลและตัวตรวจสอบชุดเดียวกัน

## ขั้นตอนที่ 3: แยกแค็ตตาล็อกต้นทางด้วย CLI

จากไดเรกทอรีที่มี `i18n.yml` ให้รีเฟรชแค็ตตาล็อกภาษาอังกฤษ:

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

`extract` สแกน `.ts` และ `.tsx` เพื่อค้นหาตัวบ่งชี้ใน:

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

เขียน JSON ของ FormatJS แบบ strict:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

หาก descriptor ไม่ระบุ `id` CLI จะสร้างแฮชที่เข้ากันได้กับ FormatJS จาก `defaultMessage` และ `description` ID ที่ระบุไว้อย่างชัดเจนจะตรวจสอบได้ง่ายกว่าใน diff และใน Hyperlocalise เขตวัฒนา

คอมมิต `lang/en-US.json` ไปพร้อมกับการเปลี่ยนแปลงโค้ด หากไม่มีคอมมิตการดึงข้อความ ให้ถือว่าเหมือนไม่มีการย้ายข้อมูล: แพลตฟอร์มจะไม่เห็นข้อความใหม่จนกว่าแค็ตตาล็อกจะได้รับการอัปเดต

ไม่บังคับ: `--prefix-id` จะเติมพาธไฟล์ที่ปรับรูปแบบให้เป็นมาตรฐาน (`src.components.saved-filters-banner.title`) ไว้ข้างหน้า ID จับคู่กับ `hl pack --prefix-id` เมื่อบันเดิลขณะรันไทม์ต้องการ ID แบบสั้น ตัวอย่างในที่นี้ใช้ ID เชิงตรรกะที่คงที่แทน

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

ประตูสองบานทำงานร่วมกัน:

1. **Extract drift** — หากมีคนแก้ไข `defaultMessage` ในโค้ด แต่ลืม `hl extract` งานจะล้มเหลวบน `git diff`.
2. **`hyperlocalise check`** — ใช้ร่วมกับ `github-diff: true` เพื่อตรวจสอบคีย์ที่เปลี่ยนแปลงใน `lang/en-US.json` และเป้าหมายเพื่อหาปัญหา เช่น `not_localized`, `placeholder_mismatch` และ **`icu_shape_mismatch`**.

การตรวจสอบขั้นสุดท้ายนี้สำคัญสำหรับ ICU: สตริงภาษาฝรั่งเศสที่ทำ `{count, plural, ...}` หายไปหรือสลับลำดับสาขา อาจดูเหมือนไม่มีปัญหาสำหรับคนที่กวาดตาดู JSON แต่จะทำงานผิดพลาดขณะรัน การตรวจจับรูปแบบที่เปลี่ยนไปใน CI มีค่าใช้จ่ายน้อยกว่าการตรวจพบในระบบจริง

เรียกใช้การตรวจสอบแบบเดียวกันในเครื่องก่อนพุช:

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## ขั้นตอนที่ 5: พุชแคตตาล็อกที่ดึงออกมาหลังจากรวมแล้ว

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

หลังจากรวมการเปลี่ยนแปลงแล้ว `hl sync push` จะอัปโหลด `lang/en-US.json` ไปยังโปรเจกต์ Hyperlocalise ที่ลิงก์ไว้ การเรียกใช้ extract ซ้ำบน `main` จะช่วยป้องกันปัญหาการแข่งกันที่โค้ดถูกรวมเข้าไปโดยไม่มีแค็ตตาล็อกที่ตรงกันใน Git

ใช้ `hl sync push --dry-run` เมื่อคุณเปลี่ยนเส้นทางบักเก็ตหรือรายการโลแคล

## ขั้นตอนที่ 6: ตรวจทานข้อความ ICU ใน Hyperlocalise

ผู้แปลควรเห็นข้อความ ICU ทั้งหมด ไม่ใช่แค่ส่วนภาษาอังกฤษที่แยกออกมา ในการตรวจทาน ให้ถามคำถามเฉพาะสำหรับแต่ละภาษา ซึ่ง ICU ซ่อนไว้ในสตริงเดียว:

| ข้อความ                     | คำถามสำหรับการทบทวน                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `filters.banner.savedCount` | สาขา `=0`, `one` และ `other` อ่านแล้วเป็นธรรมชาติหรือไม่? `#` ขยายได้อย่างถูกต้องตามกฎพหูพจน์ของแต่ละโลแคลหรือไม่? |
| `filters.banner.scope`      | `select` ครอบคลุมค่าทุกค่าของ `scope` ที่แอปส่งมาหรือไม่? `other` เป็นทางเลือกสำรองที่ปลอดภัยหรือไม่?              |
| ป้ายกำกับสั้น               | ข้อความแปลยังพอดีกับปุ่มหลังขยายรูปพหูพจน์หรือไม่?                                                                 |

แนบภาพหน้าจอเมื่อมีแขนงพหูพจน์ปรากฏในเลย์เอาต์ที่มีพื้นที่จำกัด Hyperlocalise จะเก็บอภิธานศัพท์และคำแนะนำของโปรเจ็กต์ไว้ควบคู่กับเซกเมนต์ ส่วน CLI ทำหน้าที่เพียงย้ายไฟล์เท่านั้น

อนุมัติคำแปลบนแพลตฟอร์มก่อนดึงกลับมา การอนุมัติเป็นด่านควบคุมด้านภาษา ส่วน Git จะบันทึกสิ่งที่เผยแพร่จริง

## ขั้นตอนที่ 7: ดึงคำแปลและแพ็กสำหรับรันไทม์

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

`sync pull` เขียน `lang/fr-FR.json` และ `lang/de-DE.json` ในรูปแบบของ FormatJS (ids, `defaultMessage` และบางครั้งก็มี `description`) `hl pack` ลบ `description` และข้อมูลเมตาอื่นๆ ออก โดยยังคงรักษา ICU ใน `defaultMessage` แต่ละรายการไว้ พร้อมให้ bundler นำเข้า JSON แยกตาม locale ได้ทันที

ตัวอย่างรายการภาษาฝรั่งเศสที่บรรจุไว้:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

เปิด pull request สำหรับการแปลในแอป สลับภาษา แล้วทดสอบ `count = 0`, `count = 1` และ `count = 5` การถดถอยของ ICU มักปรากฏเฉพาะเมื่อใช้กฎพหูพจน์ของภาษาอื่นที่ไม่ใช่ภาษาอังกฤษ

## ขั้นตอนที่ 8: โหลดแคตตาล็อกในแอป

นำเข้าไฟล์ภาษาแบบแพ็ก แล้วแมปเป็น `IntlProvider` หรือ `createIntl`:

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

บางทีมเก็บค่าเริ่มต้นภาษาอังกฤษไว้เฉพาะในซอร์สโค้ด และโหลด JSON เฉพาะสำหรับภาษาเป้าหมายเท่านั้น—ทั้งสองรูปแบบใช้ได้ หาก `defaultMessage` ในโค้ดและ `lang/en-US.json` สอดคล้องกันผ่าน extract

## การทำงานของโฟลว์ทั้งหมดเป็นอย่างไร

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

Extract เชื่อมโค้ดกับแคตตาล็อก Sync เชื่อมแคตตาล็อกกับผู้ตรวจทาน Pack เชื่อม JSON ที่ผ่านการตรวจทานเข้ากับบันเดิลของคุณ.

## รูปแบบความล้มเหลวที่พบบ่อย

### Pull request ล้มเหลวเนื่องจาก extract drift

เรียกใช้ `hl extract` ในเครื่องโดยใช้รูปแบบ `--ignore` เดียวกับ CI, commit `lang/en-US.json` แล้ว push หาก ID กระโดดอย่างไม่คาดคิด ให้ตรวจสอบว่า descriptor มีฟิลด์ `id` ที่คงที่อยู่ด้วย

### `icu_shape_mismatch` ในคำแปลที่โดยรวมแล้ว “ดี”

เปรียบเทียบลำดับ branch และชื่อ placeholder กับ `en-US` เรียกใช้ `hl check --check icu_shape_mismatch --locale fr-FR` ในเครื่อง แก้ไข JSON เป้าหมายหรือส่งส่วนนี้กลับไปตรวจสอบ อย่าปิดการตรวจสอบสำหรับข้อความ ICU จริง ๆ

### รันไทม์แสดง `MISSING_TRANSLATION` หรือภาษาอังกฤษในภาษาเป้าหมาย

ยืนยันว่า pull request สำหรับการแปลถูกรวมแล้ว, `hl pack` ทำงานแล้ว และ import ชี้ไปยังไฟล์ที่แพ็กไว้ ตรวจสอบว่า message id ในโค้ดตรงกับคีย์ใน JSON (รวมถึงรูปแบบ `--prefix-id` หากมี)

### `hl sync pull` ไม่เปลี่ยนแปลงอะไรเลย

ยืนยันการอนุมัติในโปรเจ็กต์ที่อ้างอิงโดย `HYPERLOCALISE_PROJECT_ID` เรียกใช้ `hl sync pull --dry-run` ตรวจสอบให้แน่ใจว่าเส้นทาง `i18n.yml` `to:` ตรงกับตำแหน่งที่แอปนำเข้าแค็ตตาล็อก

### ไฟล์ที่บีบอัดไว้ถูกลบ ICU ออกโดยไม่ได้ตั้งใจ

ใช้ `hl pack` เริ่มต้นกับ FormatJS JSON ซึ่งจะคง `defaultMessage` ไว้เหมือนเดิม อย่าเรียกใช้ pack กับเวิร์กโฟลว์ที่ออกแบบมาสำหรับ JSON แบบซ้อนทั่วไป เว้นแต่ว่านั่นจะเป็นรูปแบบแค็ตตาล็อกของคุณเอง

## รายการตรวจสอบก่อนเผยแพร่

ก่อนเปิดตัวฟีเจอร์ที่ต้องใช้ข้อความใหม่:

- [ ] ตัวอธิบายข้อความที่ผสานเข้ากับ `lang/en-US.json` ที่แยกออกมา
- [ ] แยก pull request และ `hyperlocalise check` ผ่านแล้ว
- [ ] `hl sync push` ทำงานเมื่อ `main`
- [ ] ตรวจสอบและอนุมัติภาษาเป้าหมายใน Hyperlocalise
- [ ] รวม pull request สำหรับการแปลแล้ว (`sync pull` + `pack`)
- [ ] ตรวจสอบ QA ด้วยตนเองในแต่ละ locale สำหรับรูปแบบพหูพจน์และสาขา `select`
- [ ] การ deploy production ใช้อาร์ติแฟกต์ที่ผสานแล้ว `lang/*.json`

## คอยอัปเดต extract อยู่เสมอ

React Intl สนับสนุนการวางข้อความไว้ใกล้กับโค้ด ส่วน Hyperlocalise สนับสนุนคำแปลที่ผ่านการตรวจสอบและจัดเก็บไว้ในไฟล์ คำสั่ง **`hl extract`** เชื่อมโยงทั้งสองแนวทางเข้าด้วยกัน โดยไม่ต้องใช้ CLI ของ FormatJS แยกต่างหากสำหรับแค็ตตาล็อกพื้นฐาน

ใช้ **`check`** เพื่อปกป้องโครงสร้าง ICU ใน pull request ใช้ **sync** สำหรับเวิร์กโฟลว์ของผู้รีวิว ใช้ **`pack`** เพื่อให้บันเดิลสำหรับ production มีขนาดเล็ก ขณะที่นักแปลยังคงเก็บเมทาดาทาที่ครบถ้วนไว้ใน Git ระหว่างการ pullแต่ละครั้ง

หากต้องการอ่านเรื่องราวการเผยแพร่ GitHub ในภาพรวมที่กว้างขึ้น—รวมถึงบันทึกประจำรุ่นใน Markdown ควบคู่กับสตริง UI—อ่านต่อได้ที่ [เวิร์กโฟลว์การแปล GitHub: จาก pull request สู่การเผยแพร่หลายภาษา](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release) หรือ [สำรวจการแปลและปรับผลิตภัณฑ์ให้เข้ากับท้องถิ่นบน Hyperlocalise](/use-cases/product-localisation).
