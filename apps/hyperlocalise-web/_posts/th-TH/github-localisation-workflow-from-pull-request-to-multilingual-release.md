---
title: "เวิร์กโฟลว์การแปลเป็นภาษาท้องถิ่นบน GitHub: จาก Pull Request สู่การเผยแพร่หลายภาษา"
date: 2026-09-09T00:00:00.000Z
excerpt: สร้างเวิร์กโฟลว์การปรับให้เข้ากับท้องถิ่นบน GitHub ที่ใช้งานได้จริง เพื่อตรวจสอบสตริงที่เปลี่ยนแปลง ส่งเนื้อหาต้นฉบับไปยัง Hyperlocalise นำคำแปลที่ผ่านการตรวจทานกลับมา และเผยแพร่บันทึกประจำรุ่นหลายภาษา
category: วิศวกรรม
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

คู่มือนี้จะแนะนำวิธีตั้งค่าเวิร์กโฟลว์การแปลภาษาบน GitHub ด้วย GitHub Actions, CLI `hyperlocalise` และแพลตฟอร์ม Hyperlocalise คุณจะเริ่มจากตัวอย่างเล็ก ๆ และติดตามการเปลี่ยนแปลงผลิตภัณฑ์หนึ่งรายการตั้งแต่ pull request แรกไปจนถึงการเผยแพร่หลายภาษา

เมื่อสิ้นสุดแล้ว เวิร์กโฟลว์ของคุณจะครอบคลุมสี่ขั้นตอน:

1. วิศวกรแก้ไขข้อความ UI ภาษาอังกฤษและบันทึกประจำรุ่นของข้อความนั้น
2. GitHub ตรวจสอบ pull request เพื่อหาปัญหาด้านการแปลและปรับให้เข้ากับท้องถิ่น
3. CLI จะส่งเนื้อหาต้นฉบับไปยัง Hyperlocalise ซึ่งทีมงานจะตรวจสอบคำแปล
4. GitHub ดึงไฟล์ที่ผ่านการตรวจทานแล้วและเผยแพร่รีลีสหนึ่งรายการพร้อมบันทึกประจำรุ่นภาษาอังกฤษ ฝรั่งเศส และเยอรมัน

ผลลัพธ์คือกระบวนการที่ทำงานสอดคล้องกับ repository โดยวิศวกรยังทำงานใน pull request ผู้ตรวจทานภาษาได้ทำงานพร้อมบริบทใน Hyperlocalise และการเผยแพร่จะใช้เฉพาะคำแปลที่ส่งกลับเข้า Git แล้วเท่านั้น

หากต้องการดูรูปแบบผลิตภัณฑ์ในภาพรวมก่อนรายละเอียดการใช้งาน โปรดดู[กรณีศึกษาการปรับผลิตภัณฑ์ของ GitHub ให้เหมาะกับท้องถิ่น](/use-cases/product-localisation).

## สิ่งที่เราจะสร้าง

สมมติว่าเว็บแอปพลิเคชันมีโครงสร้างดังนี้:

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

ภาษาอังกฤษเป็นภาษาต้นทาง ส่วนภาษาฝรั่งเศสและภาษาเยอรมันเป็นภาษาเป้าหมาย ไฟล์ JSON เก็บข้อความของผลิตภัณฑ์ ส่วนไฟล์ Markdown เก็บบันทึกประจำรุ่น Hyperlocalise ถือว่าทั้งสองอย่างเป็นเนื้อหาที่แปลได้ ดังนั้นวงจรการตรวจทานเดียวกันจึงครอบคลุมทั้งอินเทอร์เฟซและประกาศรุ่นใหม่ด้วย

คุณจะต้องมี:

- โปรเจ็กต์ Hyperlocalise ที่มี `en-US` เป็นภาษาต้นทาง และ `fr-FR` กับ `de-DE` เป็นภาษาเป้าหมาย;
- `HYPERLOCALISE_API_KEY` ความลับของ GitHub Actions;
- ข้อมูลลับของ GitHub Actions รายการหนึ่ง `HYPERLOCALISE_PROJECT_ID`; และ
- สิทธิ์ในการเพิ่มเวิร์กโฟลว์และข้อมูลลับของที่เก็บโค้ด.

ใช้สภาพแวดล้อม GitHub เช่น `localisation` สำหรับข้อมูลรับรองการใช้งานจริง หากองค์กรของคุณกำหนดให้ต้องได้รับอนุมัติก่อนการปรับใช้

## ขั้นตอนที่ 1: จับคู่ไฟล์ต้นทางและไฟล์ปลายทาง

สร้าง `i18n.yml` ที่ไดเรกทอรีรากของ repository:

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

บัคเก็ตทั้งสองทำให้ระบุความเป็นเจ้าของได้อย่างชัดเจน `product` จับคู่แค็ตตาล็อกต้นทางหนึ่งรายการกับแค็ตตาล็อกหนึ่งรายการสำหรับแต่ละโลแคลเป้าหมาย `release-notes` จับคู่ไฟล์ Markdown ภาษาอังกฤษทุกไฟล์กับไดเรกทอรีโลแคลที่เทียบเท่ากัน โดยคงชื่อไฟล์ไว้

การกำหนดเวอร์ชัน CLI ไว้ใน configuration ยังช่วยให้การรันในเครื่องและ CI ตรงกันด้วย อัปเดตเวอร์ชันตัวอย่างให้เป็นรุ่นที่ทีมของคุณทดสอบแล้ว หากคุณไม่ระบุ `version` ให้กำหนดเวอร์ชันของอินพุต `version` ใน install action แทน

โปรไฟล์ LLM จะถูกใช้เมื่อโปรเจ็กต์ของคุณสร้างคำแปลด้วยผู้ให้บริการรายนั้น ให้จัดเก็บข้อมูลรับรองของผู้ให้บริการไว้ใน Hyperlocalise แทนการเพิ่มลงในเวิร์กโฟลว์ GitHub runner ต้องใช้เพียงข้อมูลรับรองสำหรับโปรเจ็กต์ Hyperlocalise เท่านั้น

## ขั้นตอนที่ 2: เปลี่ยนแปลงผลิตภัณฑ์หนึ่งอย่าง

สมมติว่าเวอร์ชัน 1.8.0 เพิ่มฟิลเตอร์ที่บันทึกไว้ Pull request เปลี่ยนแปลง `locales/en-US.json`:

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

นอกจากนี้ยังเพิ่ม `release-notes/en-US/v1.8.0.md`:

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

คอมมิตเนื้อหาต้นฉบับไปพร้อมกับฟีเจอร์ เพื่อให้ผู้ตรวจสอบเห็นการเปลี่ยนแปลงโค้ด ข้อความใน UI และคำอธิบายสำหรับลูกค้าได้ใน pull request เดียว นอกจากนี้ยังช่วยให้ตรวจสอบประวัติ Git ได้ว่ามีการเผยแพร่ข้อความใดไปพร้อมกับรีลีสบ้าง

อย่าคัดลอกข้อความภาษาอังกฤษไปใส่ใน `fr-FR.json` หรือ `de-DE.json` ด้วยตนเองเพื่อใช้เป็น placeholder เครดิตฟรี

## ขั้นตอนที่ 3: ตรวจสอบสตริงที่เปลี่ยนแปลงใน pull request

เพิ่ม `.github/workflows/localise.yml` งานแรกจะทำงานเมื่อมี pull request และจำกัดผลการตรวจพบของ Hyperlocalise ไว้เฉพาะส่วนต่างใน GitHub:

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

เมื่อใช้ `github-diff: true` แอ็กชันจะดึงแพตช์ของ pull request แล้วส่งต่อให้ `hyperlocalise check --diff-stdin` สำหรับแค็ตตาล็อกแบบมีโครงสร้างที่รองรับ คำอธิบายประกอบจะเน้นที่คีย์ที่ pull request นี้เปลี่ยนแปลง แทนที่จะให้ผู้เขียนต้องจัดการงานค้างที่ไม่เกี่ยวข้องด้วย

การดำเนินการนี้ยังอัปโหลดรายงาน JSON และสรุปข้อความด้วย โปรดเก็บไฟล์เหล่านี้ไว้เมื่อการตรวจสอบไม่ผ่าน เพราะไฟล์เหล่านี้ช่วยแยกข้อผิดพลาดด้านโครงสร้าง คำแปลที่ขาดหาย และข้อค้นพบด้านเนื้อหา ออกจากปัญหาการติดตั้งหรือการกำหนดค่าได้

การตรวจสอบนี้เป็นด่านทบทวนขั้นแรก ไม่ใช่การทบทวนภาษา โดยจะช่วยตรวจพบปัญหาใน repository ได้ตั้งแต่เนิ่น ๆ ขณะที่ผู้ตรวจทานยังคงเป็นผู้ตัดสินว่าคำแปลแต่ละรายการถูกต้อง สอดคล้องกัน และเหมาะสมกับผลิตภัณฑ์หรือไม่

## ขั้นตอนที่ 4: ส่งเนื้อหาต้นฉบับที่ผสานแล้วไปยัง Hyperlocalise

เพิ่ม job ที่สองในเวิร์กโฟลว์เดียวกัน `localise.yml`:

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

นี่คือขอบเขตของการ push หลังจาก pull request ของฟีเจอร์ถูกรวมเข้ากับ `main` แล้ว `hl sync push` จะอ่านบัคเก็ตใน `i18n.yml` และส่งไฟล์ต้นฉบับ JSON และ Markdown ภาษาอังกฤษไปยังโปรเจกต์ Hyperlocalise ที่ลิงก์ไว้แล้ว

งานนี้มีสิทธิ์เข้าถึง repository แบบอ่านอย่างเดียว เนื่องจากส่งเนื้อหาออกไป ข้อมูลรับรองจะอยู่เฉพาะในขั้นตอนที่จำเป็นต้องใช้ ตัวกรอง `paths` ป้องกันไม่ให้การ merge ที่ไม่เกี่ยวข้องทำให้เกิดการรันซิงก์โดยไม่จำเป็น

คุณสามารถเรียกใช้การดำเนินการเดียวกันนี้ก่อนคอมมิตได้:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

ใช้ `--dry-run` เมื่อต้องการเปลี่ยนการแมปบัคเก็ต ซึ่งช่วยให้คุณตรวจสอบแผนก่อนอัปเดตโปรเจกต์ระยะไกลได้

## ขั้นตอนที่ 5: ตรวจสอบสตริงของผลิตภัณฑ์และบันทึกประจำรุ่นร่วมกัน

เมื่อซิงค์แหล่งที่มาเสร็จแล้ว ให้ตรวจสอบเนื้อหาใหม่ใน Hyperlocalise สตริง UI และบันทึกประจำรุ่นยังคงอยู่ในหมวดหมู่แยกกัน แต่ใช้คำศัพท์เฉพาะของโปรเจกต์ คำแนะนำ และภาษาเป้าหมายร่วมกัน

สำหรับตัวอย่างนี้ ผู้ตรวจสอบควรตรวจสอบมากกว่าความถูกต้องตามตัวอักษร:

| เนื้อหา                | คำถามสำหรับการตรวจสอบ                                         |
| ---------------------- | ------------------------------------------------------------- |
| `filters.save`         | สิ่งนี้เป็นการกระทำอย่างชัดเจน ไม่ใช่สถานะที่บันทึกไว้ใช่ไหม? |
| `filters.saved`        | คำนี้สอดคล้องกับข้อความในการนำทางและการตั้งค่าหรือไม่?        |
| คำอธิบาย               | เหมาะกับ UI และคงคำว่า “workspace” ไว้หรือไม่?                |
| ชื่อรุ่น               | ใช้ชื่อเดียวกับฟีเจอร์ของผลิตภัณฑ์หรือไม่?                    |
| รายการหัวข้อการเผยแพร่ | คำสั่ง ชื่อเมนู และผลลัพธ์ที่ผู้ใช้ได้รับสอดคล้องกันหรือไม่?  |

แนบบริบทของผลิตภัณฑ์หรือภาพหน้าจอเมื่อข้อความสั้น ๆ มีความกำกวม นักแปลที่เห็นเพียง “บันทึกตัวกรอง” จะไม่รู้ว่าข้อความนี้ใช้เป็นปุ่ม ข้อความแจ้งเตือนแบบโทสต์ หรือหัวข้อหน้า บริบทนี้เองที่ทำให้แพลตฟอร์มทำงานเสริมกับ CLI: Git ใช้ย้ายไฟล์ ส่วน Hyperlocalise รวบรวมความรู้ที่จำเป็นต่อการตัดสินใจเลือกภาษาได้อย่างเหมาะสม

แก้ไขความคิดเห็นจากการตรวจทานและอนุมัติคำแปลตามขั้นตอนการทำงานของโปรเจกต์ก่อนดึงกลับมา ให้ถือว่าการอนุมัติเป็นขั้นตอนก่อนเผยแพร่ ไม่ใช่แค่ขั้นตอนทางธุรการ

## ขั้นตอนที่ 6: ดึงคำแปลที่ตรวจทานแล้วเข้าสู่ GitHub

เพิ่มงานที่สามใน `localise.yml`:

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

เรียกใช้งาน job นี้จากแท็บ **Actions** หลังจากตรวจทานแล้ว `hl sync pull` จะเขียนเนื้อหาที่แปลแล้วลงในพาธต่าง ๆ ใน `i18n.yml` เพื่อสร้างไฟล์ต่าง ๆ เช่น:

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

เวิร์กโฟลว์จะเปิด pull request แทนการคอมมิตโดยตรงไปยัง `main` ซึ่งช่วยรักษาการป้องกันสาขา เปิดโอกาสให้วิศวกรทดลองเรียกใช้แอปพลิเคชันในแต่ละโลแคล และบันทึกคำแปลที่รวมอยู่ในรีลีสไว้อย่างชัดเจน

สำหรับ production ให้ pin third-party actions ด้วย full commit SHA ตามนโยบาย dependency ของคุณ การใช้ major tag ที่ขยับตามการอัปเดตช่วยให้บทช่วยสอนนี้อ่านเข้าใจง่าย แต่การอ้างอิงแบบ immutable ช่วยลดความเสี่ยงด้าน supply chain ได้

## ขั้นตอนที่ 7: ทดสอบ pull request ที่แปลแล้ว

การตรวจสอบอัตโนมัติจะทำงานอีกครั้ง เนื่องจาก pull request สำหรับการแปลเปลี่ยนแปลง `locales/**` และ `release-notes/**` เพิ่มการทดสอบของแอปพลิเคชันของคุณเองในการตรวจสอบที่จำเป็นด้วย♀♀♀♀♀♀

อย่างน้อยที่สุด ให้ตรวจสอบ:

- แค็ตตาล็อกเป้าหมายทุกชุดมีคีย์ใหม่;
- ตัวยึดตำแหน่งและอาร์กิวเมนต์ ICU ต้องตรงกับต้นฉบับ;
- ปุ่มที่แปลแล้วแสดงผลได้พอดีในขนาดวิวพอร์ตที่รองรับ;
- หัวข้อ รายการ ลิงก์ และช่วงโค้ดใน Markdown ยังคงแสดงผลได้อย่างถูกต้อง;
- ผลิตภัณฑ์และบันทึกประจำรุ่นใช้ชื่อฟีเจอร์เดียวกัน; และ
- สตริงต้นทางไม่รั่วไหลไปยังไฟล์เป้าหมาย

ผู้ตรวจทานควรเปิดดูผลิตภัณฑ์ที่แสดงผลแล้วด้วย การตรวจทานระดับไฟล์ช่วยจับข้อผิดพลาดด้านคำศัพท์ได้ แต่ไม่สามารถเผยให้เห็นปุ่มที่ถูกตัดหรือการขึ้นบรรทัดใหม่ที่ซ่อนข้อความสำคัญได้

รวม pull request การแปลก็ต่อเมื่อการตรวจสอบเหล่านั้นผ่าน ขณะนี้ Git มีสถานะภาษาที่ได้รับอนุมัติสำหรับรุ่นนี้แล้ว

## ขั้นตอนที่ 8: เผยแพร่บันทึกประจำรุ่นหลายภาษา

GitHub Releases มีเนื้อหารีลีสได้เพียงรายการเดียว ดังนั้นให้รวมแต่ละภาษาเป็นเอกสาร Markdown เดียว เพิ่ม `.github/workflows/release.yml`:

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

สร้างแท็กหลังจากรวม pull request สำหรับฟีเจอร์และการแปลแล้วเท่านั้น:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

งานเผยแพร่จะล้มเหลวหากบันทึกของภาษาใดภาษาหนึ่งหายไปหรือว่างเปล่า ซึ่งเป็นสิ่งที่ตั้งใจไว้ การใช้ค่าเริ่มต้นสำรองโดยไม่แจ้งเตือนจะทำให้การเผยแพร่ที่ไม่สมบูรณ์ถูกระบุว่ารองรับหลายภาษา แต่เมื่องานล้มเหลว ทีมจะทราบได้อย่างชัดเจนว่าไฟล์ใดต้องกลับเข้าสู่กระบวนการตรวจสอบอีกครั้ง

แท็กเดียวกันสามารถใช้เรียกใช้งาน build และ deployment ของคุณได้ กำหนดให้งาน release ขึ้นอยู่กับงานเหล่านั้น หากต้องมีไบนารีก่อนที่ประกาศจะเผยแพร่

## การทำงานของโฟลว์ทั้งหมด

เวิร์กโฟลว์การแปลเป็นภาษาท้องถิ่นบน GitHub ที่เสร็จสมบูรณ์มีทิศทางที่ชัดเจน:

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

แต่ละขั้นตอนมีหน้าที่รับผิดชอบเพียงอย่างเดียว Pull request ใช้ตรวจสอบการเปลี่ยนแปลงใน repository ส่วน Hyperlocalise ใช้ตรวจสอบการตัดสินใจด้านภาษา แท็กใช้เผยแพร่สถานะที่ผ่านการตรวจสอบแล้วและไม่สามารถเปลี่ยนแปลงได้

## รูปแบบความล้มเหลวที่พบบ่อย

### การตรวจสอบ PR รายงานคำแปลที่ไม่เกี่ยวข้อง

ยืนยันว่าแอ็กชันทำงานเมื่อเกิดเหตุการณ์ `pull_request` และกำหนดค่า `github-diff: true` แอ็กชันต้องใช้ `pull-requests: read` เพื่อดึงแพตช์ การตรวจสอบที่จำกัดขอบเขตตาม diff ใช้ได้กับไฟล์แปลภาษาที่มีโครงสร้างซึ่งรองรับ หากต้องการเห็นรายการงานค้างด้วย ให้แยกการตรวจสอบทั้งโปรเจกต์ไว้ในงานที่กำหนดเวลาแยกต่างหาก

### ไม่สามารถตรวจสอบสิทธิ์ Source push ได้

ตรวจสอบว่า `HYPERLOCALISE_API_KEY` และ `HYPERLOCALISE_PROJECT_ID` มีอยู่ใน environment ของ GitHub ที่เลือกหรือไม่ โดยจะใช้ environment secrets ได้ก็ต่อเมื่อ job ระบุ environment นั้นไว้ และ environment ที่มีการป้องกันอาจต้องรอการอนุมัติก่อนดำเนินการต่อ

### ดึงคำแปลแล้วไม่มี Git diff

ก่อนอื่นให้ยืนยันว่าการแปลในโปรเจ็กต์เดียวกันที่ระบุชื่อไว้ว่า `HYPERLOCALISE_PROJECT_ID` เสร็จสิ้นแล้ว จากนั้นตรวจสอบพาธปลายทางใน `i18n.yml` เรียกใช้ `hl sync pull --dry-run` ในเครื่องเพื่อตรวจสอบรายการดาวน์โหลดที่วางแผนไว้ โดยไม่เขียนทับไฟล์เดิม

### ไม่พบบันทึกประจำรุ่นของรุ่นนี้

แท็กและชื่อไฟล์ Markdown ต้องตรงกันทุกประการ แท็ก `v1.8.0` ต้องใช้ `release-notes/<locale>/v1.8.0.md` ให้คง `v` ไว้ทั้งสองตำแหน่ง หรือเปลี่ยนการสร้างพาธของเวิร์กโฟลว์โดยปรับแนวทางให้เป็นแบบเดียวกันอย่างชัดเจนในครั้งเดียว

### งานแปลจะมาถึงหลังจากผลิตภัณฑ์เปิดตัวแล้ว

อย่าทำให้การซิงค์คำแปลเป็นงานหลังเผยแพร่ที่ไม่มีการติดตาม กำหนดให้ต้องมี pull request สำหรับการแปลก่อนสร้างแท็ก หรือกำหนดให้การปรับให้เข้ากับภาษาท้องถิ่นเป็นการตรวจสอบ release candidate อย่างชัดเจนในเวิร์กโฟลว์การนำขึ้นใช้งาน】【。

## รายการตรวจสอบก่อนเผยแพร่

ก่อนติดแท็กเวอร์ชันหลายภาษา โปรดยืนยันว่า:

- [ ] สตริงต้นฉบับและบันทึกประจำรุ่นภาษาอังกฤษถูกรวมเข้าด้วยกัน;
- [ ] การตรวจสอบการแปลภาษาของ pull request ผ่านแล้ว;
- [ ] `hl sync push` เสร็จสิ้นหลังการผสาน;
- [ ] ภาษาเป้าหมายได้รับการตรวจสอบและอนุมัติใน Hyperlocalise แล้ว;
- [ ] `hl sync pull` เปิด pull request สำหรับการแปลแล้ว;
- [ ] ผ่านการตรวจสอบอัตโนมัติ ด้านภาษา และด้านภาพแล้ว;
- [ ] pull request สำหรับคำแปลถูกรวมแล้ว; และ
- [ ] ทุกภาษาของบันทึกประจำรุ่นมีไฟล์ที่ไม่ว่างเปล่าซึ่งตรงกับแท็ก

## ให้การปรับให้เข้ากับท้องถิ่นเป็นส่วนหนึ่งของกระบวนการเผยแพร่

ส่วนสำคัญของการปรับ GitHub ให้เข้ากับท้องถิ่นไม่ใช่ YAML แต่เป็นลำดับการส่งต่องานที่มีผู้รับผิดชอบอย่างชัดเจน

CLI `hyperlocalise` เชื่อมไฟล์ใน repository เข้ากับแพลตฟอร์ม GitHub Action ช่วยให้วิศวกรได้รับข้อเสนอแนะเกี่ยวกับสตริงที่เปลี่ยนแปลงได้อย่างรวดเร็ว Hyperlocalise มอบบริบทและเวิร์กโฟลว์การอนุมัติให้ผู้ตรวจสอบภาษา ซึ่ง Git เพียงอย่างเดียวไม่สามารถทำได้ แท็กสุดท้ายจะเผยแพร่สิ่งที่ทีมตรวจสอบแล้วอย่างตรงตามนั้น

นั่นทำให้การปรับให้เข้ากับท้องถิ่นเปลี่ยนจากงานที่ทำหลังการพัฒนา มาเป็นส่วนหนึ่งของการเผยแพร่เอง

[สำรวจ Hyperlocalise สำหรับการปรับผลิตภัณฑ์ให้เข้ากับท้องถิ่น](/use-cases/product-localisation) เพื่อเชื่อมต่อคลังโค้ด เวิร์กโฟลว์การตรวจสอบ และการเผยแพร่หลายภาษาของคุณ.
