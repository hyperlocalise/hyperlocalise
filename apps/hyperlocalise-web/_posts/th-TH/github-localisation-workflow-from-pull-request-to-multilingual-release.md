---
title: "เวิร์กโฟลว์การแปลเป็นภาษาท้องถิ่นบน GitHub: จาก Pull Request สู่การเผยแพร่หลายภาษา"
date: 2026-09-09T00:00:00.000Z
excerpt: สร้างเวิร์กโฟลว์การแปลและปรับให้เข้ากับแต่ละภาษาบน GitHub ที่ใช้งานได้จริง โดยตรวจสอบข้อความที่เปลี่ยนแปลง ส่งเนื้อหาต้นฉบับไปยัง Hyperlocalise ดึงคำแปลที่ผ่านการตรวจทานแล้วกลับมา และเผยแพร่บันทึกประจำรุ่นหลายภาษา
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

คู่มือนี้จะแนะนำวิธีตั้งค่าเวิร์กโฟลว์การแปลภาษาบน GitHub โดยใช้ GitHub Actions, CLI `hyperlocalise` และแพลตฟอร์ม Hyperlocalise คุณจะเริ่มจากตัวอย่างเล็กๆ และติดตามการเปลี่ยนแปลงผลิตภัณฑ์หนึ่งรายการ ตั้งแต่ pull request แรกไปจนถึงการเผยแพร่หลายภาษา

ในตอนท้าย เวิร์กโฟลว์ของคุณจะครอบคลุมสี่ขั้นตอน:

1. วิศวกรเปลี่ยนข้อความ UI ภาษาอังกฤษและบันทึกประจำรุ่นของข้อความนั้น
2. GitHub ตรวจสอบคำขอการดึง (pull request) เพื่อหาปัญหาด้านการแปลเป็นภาษาท้องถิ่น
3. CLI จะส่งเนื้อหาต้นฉบับไปยัง Hyperlocalise ซึ่งทีมงานจะตรวจทานคำแปล
4. GitHub ดึงไฟล์ที่ผ่านการตรวจสอบแล้ว และเผยแพร่รีลีสหนึ่งรายการพร้อมบันทึกภาษาอังกฤษ ฝรั่งเศส และเยอรมัน

ผลลัพธ์คือกระบวนการที่ผสานเข้ากับ repository โดยตรง วิศวกรทำงานใน pull request ต่อไป ผู้ตรวจทานภาษาทำงานโดยมีบริบทใน Hyperlocalise และการเผยแพร่จะใช้เฉพาะคำแปลที่ส่งกลับไปยัง Git แล้วเท่านั้น

หากต้องการดูรูปแบบผลิตภัณฑ์ในภาพรวมก่อนรายละเอียดการนำไปใช้ โปรดดู[กรณีศึกษาการปรับผลิตภัณฑ์ GitHub ให้เข้ากับท้องถิ่น](/use-cases/product-localisation).

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

ภาษาอังกฤษเป็นภาษาในต้นทาง ส่วนภาษาฝรั่งเศสและภาษาเยอรมันเป็นภาษาเป้าหมาย ไฟล์ JSON ใช้เก็บข้อความของผลิตภัณฑ์ ส่วนไฟล์ Markdown ใช้เก็บบันทึกการเผยแพร่ Hyperlocalise ถือว่าทั้งสองอย่างเป็นเนื้อหาที่แปลได้ ดังนั้นการทบทวนรอบเดียวกันจึงครอบคลุมทั้งส่วนติดต่อผู้ใช้และประกาศด้วยค่ะ

สิ่งที่คุณต้องมี:

- โปรเจกต์ Hyperlocalise ที่มี `en-US` เป็นภาษาแหล่งที่มา และ `fr-FR` กับ `de-DE` เป็นภาษาเป้าหมาย;
- ข้อมูลลับ GitHub Actions `HYPERLOCALISE_API_KEY` รายการหนึ่ง;
- ข้อมูลลับของ GitHub Actions รายการหนึ่ง `HYPERLOCALISE_PROJECT_ID`; และ
- สิทธิ์ในการเพิ่มเวิร์กโฟลว์และความลับของรีโพซิทอรี.

ใช้สภาพแวดล้อม GitHub เช่น `localisation` สำหรับข้อมูลประจำตัวสำหรับการใช้งานจริง หากองค์กรของคุณกำหนดให้ต้องได้รับอนุมัติก่อนนำไปใช้งาน

## ขั้นตอนที่ 1: จับคู่ไฟล์ต้นฉบับและไฟล์เป้าหมาย

สร้าง `i18n.yml` ที่รูทของ repository:

```yaml
version: hyperlocalise@1.13.6

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

บัคเก็ตทั้งสองระบุความเป็นเจ้าของอย่างชัดเจน `product` จับคู่แค็ตตาล็อกต้นทางหนึ่งรายการกับแค็ตตาล็อกหนึ่งรายการต่อ locale เป้าหมาย `release-notes` จับคู่ไฟล์ Markdown ภาษาอังกฤษทุกไฟล์กับไดเรกทอรี locale ที่ตรงกัน โดยคงชื่อไฟล์เดิมไว้

การระบุเวอร์ชัน CLI ในการกำหนดค่ายังช่วยให้การรันในเครื่องและบน CI ใช้เวอร์ชันเดียวกัน อัปเดตเวอร์ชันตัวอย่างให้เป็นรีลีสที่ทีมของคุณทดสอบแล้ว หากคุณไม่ระบุ `version` ให้ระบุเวอร์ชันของอินพุต `version` ในแอ็กชันติดตั้งแทน

โปรไฟล์ LLM จะถูกใช้เมื่อโปรเจ็กต์ของคุณสร้างคำแปลด้วยผู้ให้บริการรายนั้น ให้จัดเก็บข้อมูลรับรองของผู้ให้บริการไว้ใน Hyperlocalise แทนการเพิ่มข้อมูลดังกล่าวลงในเวิร์กโฟลว์ GitHub runner ต้องใช้ข้อมูลรับรองสำหรับโปรเจ็กต์ Hyperlocalise เท่านั้น

## ขั้นตอนที่ 2: ปรับเปลี่ยนผลิตภัณฑ์หนึ่งอย่าง

สมมติว่าเวอร์ชัน 1.8.0 เพิ่มตัวกรองที่บันทึกไว้ Pull request เปลี่ยน `locales/en-US.json`:

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

คอมมิตเนื้อหาต้นฉบับไปพร้อมกับฟีเจอร์ เพื่อให้ผู้ตรวจสอบเห็นการเปลี่ยนแปลงโค้ด ข้อความใน UI และคำอธิบายสำหรับลูกค้าได้ในคำขอรวมโค้ดเดียว นอกจากนี้ยังทำให้ประวัติ Git ระบุได้ว่ามีการเผยแพร่ข้อความใดไปพร้อมกับรุ่นนั้น ๆ

อย่าคัดลอกข้อความภาษาอังกฤษไปใส่ใน `fr-FR.json` หรือ `de-DE.json` ด้วยตนเองเพื่อใช้เป็นข้อความแทน ข้อความต้นฉบับที่คัดลอกมาอาจดูเหมือนครบถ้วนเมื่อตรวจสอบจำนวนคีย์แบบง่าย ๆ ทั้งที่ยังไม่มีการแปลเป็นภาษาท้องถิ่นเลย

## ขั้นตอนที่ 3: ตรวจสอบสตริงที่เปลี่ยนแปลงใน pull request

เพิ่ม `.github/workflows/localise.yml` งานแรกจะทำงานเมื่อมี pull request และจำกัดผลการค้นพบของ Hyperlocalise ให้อยู่ในขอบเขต diff ของ GitHub:

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

เมื่อใช้ `github-diff: true` แอ็กชันจะดึงแพตช์ของ pull request แล้วส่งต่อให้ `hyperlocalise check --diff-stdin` สำหรับแค็ตตาล็อกแบบมีโครงสร้างที่รองรับ คำอธิบายประกอบจะเน้นที่คีย์ซึ่ง pull request นี้เปลี่ยนแปลง แทนที่จะให้ผู้เขียนต้องจัดการงานค้างอื่น ๆ ที่ไม่เกี่ยวข้อง

การดำเนินการนี้ยังอัปโหลดรายงาน JSON และสรุปข้อความด้วย โปรดเก็บไฟล์เหล่านี้ไว้เมื่อการตรวจสอบไม่ผ่าน เพราะไฟล์เหล่านี้ช่วยแยกข้อผิดพลาดด้านโครงสร้าง คำแปลที่ขาดหาย และข้อค้นพบด้านเนื้อหา ออกจากปัญหาการติดตั้งหรือการกำหนดค่าได้

การตรวจสอบนี้เป็นด่านตรวจทานแรก ไม่ใช่การตรวจทานด้านภาษา โดยช่วยตรวจพบปัญหาใน repository ได้ตั้งแต่เนิ่น ๆ ขณะที่ผู้ตรวจทานยังคงเป็นผู้ตัดสินว่าคำแปลแต่ละรายการถูกต้อง สอดคล้องกัน และเหมาะสมกับผลิตภัณฑ์หรือไม่

## ขั้นตอนที่ 4: ส่งเนื้อหาต้นฉบับที่ผสานแล้วไปยัง Hyperlocalise

เพิ่มงานที่สองลงในเวิร์กโฟลว์เดียวกัน `localise.yml`:

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

นี่คือขอบเขตของการ push หลังจากรวม pull request ของฟีเจอร์เข้ากับ `main` แล้ว `hl sync push` จะอ่านบัคเก็ตใน `i18n.yml` และส่งไฟล์ต้นฉบับ JSON และ Markdown ภาษาอังกฤษไปยังโปรเจ็กต์ Hyperlocalise ที่ลิงก์ไว้

งานนี้มีสิทธิ์เข้าถึง repository แบบอ่านอย่างเดียว เนื่องจากมีการส่งเนื้อหาออกไปแต่ไม่ได้แก้ไข Git ข้อมูลรับรองจะอยู่เฉพาะในขั้นตอนที่จำเป็นต้องใช้เท่านั้น ตัวกรอง `paths` จะป้องกันไม่ให้การผสานที่ไม่เกี่ยวข้องทำให้เกิดการซิงค์โดยไม่จำเป็น

คุณสามารถเรียกใช้การดำเนินการเดียวกันก่อนคอมมิตได้:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

ใช้ `--dry-run` เมื่อต้องการเปลี่ยนการแมปบักเก็ต ซึ่งช่วยให้คุณตรวจสอบแผนได้ก่อนอัปเดตโปรเจ็กต์ระยะไกล

## ขั้นตอนที่ 5: ตรวจทานข้อความผลิตภัณฑ์และบันทึกประจำรุ่นร่วมกัน

เมื่อการซิงค์แหล่งข้อมูลเสร็จสมบูรณ์แล้ว ให้ตรวจสอบเนื้อหาใหม่ใน Hyperlocalise สตริง UI และบันทึกประจำรุ่นยังคงอยู่ในหมวดหมู่แยกกัน แต่ใช้คำศัพท์ คำแนะนำ และภาษาเป้าหมายของโปรเจกต์ร่วมกัน เครดิตฟรี

สำหรับตัวอย่างนี้ ผู้ตรวจทานควรตรวจสอบมากกว่าความถูกต้องตามตัวอักษร:

| เนื้อหา         | คำถามสำหรับการตรวจทาน                                          |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | นี่เป็นการดำเนินการอย่างชัดเจน ไม่ใช่สถานะที่บันทึกไว้ใช่หรือไม่?    |
| `filters.saved` | คำนี้สอดคล้องกับข้อความในส่วนการนำทางและการตั้งค่าหรือไม่?        |
| คำอธิบาย     | เหมาะกับ UI และคงคำว่า “workspace” ไว้หรือไม่? |
| ชื่อรุ่น   | ใช้ชื่อเดียวกับฟีเจอร์ของผลิตภัณฑ์หรือไม่?        |
| หัวข้อย่อยของรุ่น | คำสั่ง ชื่อเมนู และผลลัพธ์ที่ผู้ใช้ได้รับสอดคล้องกันหรือไม่?  |

แนบบริบทของผลิตภัณฑ์หรือภาพหน้าจอเมื่อข้อความสั้น ๆ มีความกำกวม นักแปลที่เห็นเพียง “บันทึกตัวกรอง” ย่อมไม่รู้ว่าข้อความนี้ใช้เป็นปุ่ม ข้อความแจ้งเตือน หรือหัวข้อหน้า บริบทนี้คือสิ่งที่แพลตฟอร์มเข้ามาเติมเต็มให้ CLI: Git ใช้ย้ายไฟล์ ส่วน Hyperlocalise ช่วยส่งต่อความรู้ที่จำเป็นต่อการตัดสินใจด้านภาษาอย่างเหมาะสม

จัดการความคิดเห็นจากการตรวจทานให้เรียบร้อยและอนุมัติคำแปลตามขั้นตอนการทำงานของโปรเจกต์ก่อนดึงกลับมา ให้ถือว่าการอนุมัติเป็นเงื่อนไขก่อนเผยแพร่ ไม่ใช่ขั้นตอนทางธุรการสล็อตออนไลน์

## ขั้นตอนที่ 6: ดึงคำแปลที่ผ่านการตรวจทานแล้วเข้า GitHub

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

เรียกใช้งานจ็อบนี้จากแท็บ **Actions** หลังจากตรวจทานแล้ว `hl sync pull` จะเขียนเนื้อหาภาษาปลายทางลงในพาธที่ระบุใน `i18n.yml` และสร้างไฟล์ต่าง ๆ เช่น:

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

เวิร์กโฟลว์จะเปิด pull request แทนการ commit โดยตรงไปยัง `main` ซึ่งช่วยรักษาการป้องกันสาขา เปิดโอกาสให้วิศวกรทดสอบแอปพลิเคชันในแต่ละภาษา และบันทึกคำแปลที่แน่นอนซึ่งรวมอยู่ในรุ่นเผยแพร่ไว้ด้วย

สำหรับการใช้งานจริง ให้ตรึงแอ็กชันจากบุคคลที่สามไว้กับ SHA ของคอมมิตแบบเต็มตามนโยบายการจัดการ dependency ของคุณ แท็กเวอร์ชันหลักที่เปลี่ยนแปลงได้ช่วยให้บทแนะนำนี้อ่านเข้าใจง่าย แต่การอ้างอิงที่เปลี่ยนแปลงไม่ได้จะช่วยลดความเสี่ยงด้านห่วงโซ่อุปทานได้

## ขั้นตอนที่ 7: ทดสอบ pull request ที่แปลแล้ว

การตรวจสอบอัตโนมัติจะทำงานอีกครั้ง เนื่องจากคำขอดึงการแปลเปลี่ยนแปลง `locales/**` และ `release-notes/**` เพิ่มการทดสอบของแอปพลิเคชันของคุณเองลงในการตรวจสอบที่จำเป็นด้วยเช่นกัน

อย่างน้อยที่สุด ให้ตรวจสอบ:

- แค็ตตาล็อกเป้าหมายทุกรายการมีคีย์ใหม่;
- ตัวยึดตำแหน่งและอาร์กิวเมนต์ ICU ตรงกับต้นฉบับ;
- ปุ่มที่แปลแล้วพอดีกับขนาดวิวพอร์ตที่รองรับ;
- หัวข้อ รายการ ลิงก์ และช่วงโค้ดใน Markdown ยังคงแสดงผลได้อย่างถูกต้อง;
- ผลิตภัณฑ์และบันทึกประจำรุ่นใช้ชื่อฟีเจอร์เดียวกัน; และ
- สตริงต้นฉบับไม่ได้รั่วไหลไปยังไฟล์เป้าหมาย

ผู้ตรวจทานควรเปิดดูผลิตภัณฑ์ที่แสดงผลแล้วด้วย การตรวจทานระดับไฟล์ช่วยตรวจพบข้อผิดพลาดด้านคำศัพท์ แต่ไม่สามารถแสดงให้เห็นได้ว่าปุ่มถูกตัดหรือมีการขึ้นบรรทัดใหม่จนบดบังข้อความสำคัญหรือไม่

รวม pull request สำหรับการแปลเมื่อการตรวจสอบเหล่านั้นผ่านเท่านั้น ตอนนี้ Git มีสถานะภาษาที่ได้รับอนุมัติสำหรับรุ่นนี้แล้ว

## ขั้นตอนที่ 8: เผยแพร่บันทึกประจำรุ่นหลายภาษา

GitHub Releases มีเนื้อหาของรีลีสได้เพียงชุดเดียว ดังนั้นให้รวมแต่ละภาษาเป็นเอกสาร Markdown เดียว เพิ่ม `.github/workflows/release.yml`:

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

สร้างแท็กหลังจากรวม pull request ของฟีเจอร์และการแปลแล้วเท่านั้น:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

งานเผยแพร่จะล้มเหลวหากไม่มีบันทึกประจำภาษาสำหรับภาษาใดภาษาหนึ่ง หรือบันทึกนั้นว่างเปล่า ซึ่งเป็นความตั้งใจ การใช้เนื้อหาสำรองโดยไม่แจ้งให้ทราบจะทำให้การเผยแพร่ที่ไม่สมบูรณ์ถูกระบุว่าเป็นหลายภาษา ส่วนงานที่ล้มเหลวจะช่วยแจ้งให้ทีมทราบอย่างชัดเจนว่าต้องส่งไฟล์ใดกลับไปตรวจทานอีกครั้ง

แท็กเดียวกันสามารถใช้ขับเคลื่อนงานบิลด์และงานปรับใช้ของคุณได้ กำหนดให้งานรีลีสขึ้นอยู่กับงานเหล่านั้น หากต้องมีไบนารีก่อนที่ประกาศจะเผยแพร่จริง

## ลักษณะการทำงานของโฟลว์ทั้งหมด

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

การเปลี่ยนผ่านแต่ละครั้งมีหน้าที่อย่างเดียว Pull request ใช้ตรวจทานการเปลี่ยนแปลงใน repository ส่วน Hyperlocalise ใช้ตรวจทานการตัดสินใจด้านภาษา แท็กใช้เผยแพร่สถานะที่ผ่านการตรวจทานแล้วและไม่สามารถเปลี่ยนแปลงได้

## รูปแบบความล้มเหลวที่พบบ่อย

### การตรวจสอบ PR รายงานคำแปลที่ไม่เกี่ยวข้อง

ยืนยันว่า action ทำงานเมื่อเกิดเหตุการณ์ `pull_request` และกำหนดค่า `github-diff: true` action นี้ต้องใช้ `pull-requests: read` เพื่อดึงแพตช์ การตรวจสอบเฉพาะ diff ใช้ได้กับไฟล์แปลภาษาที่มีโครงสร้างซึ่งรองรับ หากต้องการเห็นรายการงานค้างด้วย ให้แยกการตรวจสอบทั้งโปรเจ็กต์ไปไว้ในงานตามกำหนดเวลาอีกงานหนึ่ง

### Source push ไม่สามารถยืนยันตัวตนได้

ตรวจสอบว่า `HYPERLOCALISE_API_KEY` และ `HYPERLOCALISE_PROJECT_ID` มีอยู่ในสภาพแวดล้อม GitHub ที่เลือกหรือไม่ ข้อมูลลับของสภาพแวดล้อมจะไม่พร้อมใช้งาน เว้นแต่งานจะประกาศใช้สภาพแวดล้อมนั้น และสภาพแวดล้อมที่มีการป้องกันอาจต้องรอการอนุมัติ

### ดึงคำแปลแล้วไม่มี Git diff

ก่อนอื่นยืนยันว่าการแปลเสร็จสิ้นแล้วในโปรเจ็กต์เดียวกันที่มีชื่อว่า `HYPERLOCALISE_PROJECT_ID` จากนั้นตรวจสอบพาธปลายทางใน `i18n.yml` เรียกใช้ `hl sync pull --dry-run` ในเครื่องเพื่อดูรายการดาวน์โหลดที่วางแผนไว้ โดยไม่เขียนทับไฟล์เดิม

### รุ่นเผยแพร่นี้ไม่สามารถค้นหาบันทึกประจำรุ่นได้

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### คำแปลจะพร้อมหลังจากผลิตภัณฑ์เปิดตัวแล้ว

อย่าทำให้การซิงค์คำแปลกลายเป็นงานหลังการเผยแพร่ที่ไม่มีการติดตาม กำหนดให้ต้องมี pull request สำหรับการแปลก่อนสร้างแท็ก หรือกำหนดให้การแปลเป็นภาษาท้องถิ่นเป็นการตรวจสอบ release candidate อย่างชัดเจนในเวิร์กโฟลว์การปรับใช้ของคุณ

## รายการตรวจสอบก่อนเผยแพร่

ก่อนแท็กเวอร์ชันหลายภาษา โปรดยืนยันว่า:

- [ ] รวมสตริงต้นฉบับและบันทึกประจำรุ่นภาษาอังกฤษเข้าด้วยกัน;
- [ ] การตรวจสอบการแปลภาษาของ pull request ผ่านแล้ว;
- [ ] `hl sync push` เสร็จสมบูรณ์หลังจากผสาน;
- [ ] ภาษาปลายทางได้รับการตรวจทานและอนุมัติใน Hyperlocalise;
- [ ] `hl sync pull` ได้เปิด pull request สำหรับการแปลแล้ว;
- [ ] ผ่านการตรวจสอบอัตโนมัติ การตรวจสอบทางภาษา และการตรวจสอบด้วยภาพแล้ว;
- [ ] pull request สำหรับการแปลถูกรวมแล้ว; และ
- [ ] locale ของบันทึกการเผยแพร่ทุกภาษามีไฟล์ที่ไม่ว่างซึ่งตรงกับแท็ก

## ดำเนินการโลคัลไลเซชันภายในกระบวนการเผยแพร่

สิ่งสำคัญของการปรับ GitHub ให้เข้ากับท้องถิ่นไม่ใช่ YAML แต่คือขั้นตอนการส่งต่องานที่มีผู้รับผิดชอบในแต่ละช่วง

CLI `hyperlocalise` เชื่อมไฟล์ใน repository เข้ากับแพลตฟอร์ม GitHub Action ช่วยให้วิศวกรได้รับข้อเสนอแนะเกี่ยวกับสตริงที่เปลี่ยนแปลงได้อย่างรวดเร็ว Hyperlocalise ช่วยให้ผู้ตรวจทานภาษาเห็นบริบทและใช้เวิร์กโฟลว์การอนุมัติ ซึ่ง Git เพียงอย่างเดียวไม่สามารถมอบให้ได้ แท็กสุดท้ายจะเผยแพร่สิ่งที่ทีมตรวจทานอย่างถูกต้องตรงตามนั้น

นั่นเปลี่ยนการแปลให้เข้ากับท้องถิ่นจากงานที่ทำหลังการพัฒนา ให้กลายเป็นส่วนหนึ่งของการเผยแพร่เองเลย

[สำรวจ Hyperlocalise สำหรับการปรับผลิตภัณฑ์ให้เข้ากับท้องถิ่น](/use-cases/product-localisation) เพื่อเชื่อมต่อคลังโค้ด เวิร์กโฟลว์การตรวจสอบ และการเผยแพร่หลายภาษาของคุณ.
