/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */

/** Default title applied when the template fills an untitled guideline. */
export const GUIDELINE_TEMPLATE_TITLE = "Brand Style and Content Guide";

/**
 * Starter markdown for the "Use template" action in the new-guideline
 * dialog. Uses only constructs the shared MarkdownEditor (TipTap StarterKit)
 * can parse and round-trip: headings, paragraphs, bold, lists, and inline code.
 * Teams customize each section to match their brand, then save.
 */
export const GUIDELINE_TEMPLATE_CONTENT = `# Brand Style and Content Guide

## 1. Brand Foundations

Consistency in audience and identity builds a recognizable personality.

- **Core Audience:** Global customers across web and mobile. They value clear, accurate communication in their own language.
- **Knowledge Level:** Assume no prior familiarity with our product; explain domain terms on first use.
- **Core Values:** Clarity and consistency. Focus on direct explanations and honest communication.
- **Brand Persona:** A knowledgeable guide — direct, friendly, and precise, never condescending.

## 2. Voice, Tone, and Content Principles

Our **Voice** is our personality; our **Tone** adjusts to the user's current situation.

- **Primary Voice:** Clear, confident, and human.

### Tone Matrix

- **UI and Layout** — Action-oriented. Use verbs. **Do:** Save Project. **Don't:** Project Saving.
- **Error Messages** — Blame-free. Help the user recover. **Do:** Invalid email format. **Don't:** You entered a wrong email.
- **Marketing and Docs** — Authoritative. Use active voice ("The team fixed...") vs passive ("The bug was fixed").

### Writing Principles

- **Brevity:** Maximum 20 words per sentence. Paragraphs should not exceed 3 sentences.
- **Clarity:** Use plain language. Explain all acronyms upon first use.

## 3. Mechanics and Localization

Standardizing formatting prevents layout breakage and improves global readability.

- **Capitalization:** Use Sentence case for headlines and Title Case for buttons.
- **Punctuation:** Always use the Oxford comma. Bullet points start with capitals and end without periods.
- **Formats:**
  - **Dates/Time:** YYYY-MM-DD / 24-hour clock.
  - **Numbers/Currency:** Dots for decimals (1.5). Currency symbols before numbers ($10).
  - **Measurement System:** Use Metric system (meters, kg) by default. Convert to Imperial for the US market only.
- **Translation Constraints:**
  - **Text Expansion:** Translated text should not exceed the original source length by more than 20% to prevent UI layout breakage.
  - **Variables:** Never translate or change the order of variables like \`{userName}\`.

## 4. Inclusivity and Compliance

Ensuring all users feel respected while mitigating legal and brand risk.

- **Inclusive Language:** Default to gender-neutral terms. Use "you" (direct address). In gendered languages, prefer plural forms or rephrasing to neuter nouns.
- **Risk Mitigation:** Avoid forbidden words like "Guaranteed" and "100% Secure". Use "Protected" and "Verified" instead.
`;
