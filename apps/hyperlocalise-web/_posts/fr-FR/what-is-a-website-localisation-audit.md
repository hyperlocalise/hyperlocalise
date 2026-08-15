---
title: What Is a Website Localisation Audit?
date: 2026-08-13T00:00:00.000Z
excerpt: Translating a website is only the beginning. A localisation audit scores technical implementation, language quality, product context, and visual experience — and tells you what to fix first.
category: Product
tags:
  - localisation audit
  - website localisation
  - localisation
  - localization
  - hreflang
  - translation quality
  - visual QA
  - product localisation
  - AI translation
  - SEO
  - terminology consistency
  - RTL
---

Translating a website is only the beginning of localisation.

A site can have translated pages and still give international users a poor experience. A missing `hreflang` tag can hurt discoverability. An untranslated call to action can confuse visitors. A technically correct translation can still use the wrong product term. A longer German string can break a button on mobile.

The question a localisation audit answers is not "how many strings are translated?" It is:

> **Does your website feel like it was actually built for users in this locale?**

The Hyperlocalise Localisation Audit checks a website across four dimensions — technical, linguistic, contextual, and visual — and returns a single Localisation Score out of 100, plus the issues to fix first.

## What a localisation audit covers

A localisation audit is not a translation checker, and it is not a generic website audit.

Performance, accessibility, and SEO tools look at implementation. Translation QA looks at accuracy, grammar, and fluency. Neither gives a complete picture of a multilingual website.

A localisation audit combines both perspectives:

| Audit            | Weight | What it answers                                       |
| ---------------- | -----: | ----------------------------------------------------- |
| Technical Audit  |    25% | Is localisation implemented correctly?                |
| Linguistic Audit |    25% | Are translations accurate, natural, and consistent?   |
| Contextual Audit |    25% | Does localisation make sense in your product context? |
| Visual Audit     |    25% | Does the localised UI look and behave correctly?      |

You get an overall score, a score for each area, and actionable findings with severity, evidence, and confidence.

## How to interpret the score

The overall score is a health indicator, not a replacement for the detailed findings. Always review the highest-severity issues first.

| Score  | Rating            | What it means                                                        |
| ------ | ----------------- | -------------------------------------------------------------------- |
| 90–100 | Excellent         | The localised experience is in strong shape                          |
| 75–89  | Good              | The website is generally well localised, with some issues to improve |
| 50–74  | Needs improvement | Users may encounter noticeable localisation problems                 |
| 25–49  | Poor              | Significant localisation gaps are affecting the experience           |
| 0–24   | Critical          | The localised experience has major problems that should be addressed |

A website can have a good overall score and still have one critical issue on checkout, routing, or a high-traffic page. The score tells you where to look. The findings tell you what to fix.

## Technical audit: is localisation implemented correctly?

The Technical Audit checks the infrastructure behind a multilingual website: discoverability, routing, formatting, accessibility, and whether users and search engines can reach the correct locale.

### Locale detection and routing

Pages should declare their language and locale correctly, for example `<html lang="fr-FR">`. The audit looks for missing language declarations, incorrect language or region codes, locale/content mismatches, and inconsistent identifiers.

It also checks whether localised pages use a consistent URL structure:

```text
/en/pricing
/fr/pricing
/de/pricing
```

Common failures include missing localised routes, broken locale URLs, incorrect redirects, unexpected fallback to the default locale, and locale persistence problems.

### Language switcher and `hreflang`

Visitors should be able to change locale without losing the page they are viewing. Switching from `/fr/pricing` should land on `/de/pricing`, not the German homepage.

The audit also checks the relationships between localised versions of a page: missing `hreflang`, incorrect language or region codes, invalid URLs, missing reciprocal or self-references, incorrect `x-default`, and conflicts with canonical URLs.

Localised pages should generally canonicalise to themselves. A French pricing page that canonicalises to the English version is a common SEO error:

```text
/fr/pricing
canonical → /en/pricing
```

### Metadata, sitemaps, and structured data

Important page metadata should be localised: titles, meta descriptions, Open Graph titles and descriptions, `og:locale`, and social sharing metadata.

The audit also checks whether localised URLs appear in the sitemap and resolve correctly, and, where applicable, whether structured data such as Product, WebPage, Breadcrumbs, FAQ, Organization, Article, and LocalBusiness is localised.

### International formatting and accessibility

Locale-sensitive values should match the locale:

```text
US:  $1,234.56
DE:  1.234,56 €
FR:  1 234,56 €
```

That includes dates, times, numbers, currency, measurement units, and timezones.

Accessibility localisation covers `lang`, `aria-label`, accessible names, form labels, validation messages, and image `alt` text.

## Linguistic audit: is the language accurate, natural, and consistent?

The Linguistic Audit evaluates the language on the page. It goes beyond checking whether text has been translated. It asks whether the translation communicates the right meaning and sounds natural to users of the target locale.

### Completeness and accuracy

Untranslated content is flagged, while brand names, product names, URLs, email addresses, code, proper nouns, and intentional English terminology are treated as expected exceptions.

A French page that reads:

```text
Bienvenue sur notre site.

Start your free trial
```

would be flagged for the untranslated call to action.

Accuracy checks look for missing or added meaning, incorrect interpretation, wrong numbers, wrong product actions, and incorrect terminology.

### Fluency, terminology, and brand voice

A translation can be technically correct and still sound unnatural. The audit looks for awkward phrasing, unnatural sentence structure, grammar and spelling problems, machine-translation artifacts, and locale-specific writing conventions.

It also identifies concepts translated differently across the site:

```text
Workspace

Page 1 → Espace de travail
Page 2 → Workspace
Page 3 → Espace Workspace
```

If the project has an approved glossary, glossary terminology takes precedence.

Brand voice is evaluated against the intended tone — professional, friendly, concise, technical, conversational, premium, or playful — along with locale-specific grammar and style such as capitalisation, punctuation, formality, and agreement.

## Contextual audit: is the translation correct for this product?

Context is one of the easiest parts of localisation to miss.

A translation may be grammatically perfect and still be wrong for the place where it appears. The word "Cancel" could mean closing a dialog, cancelling a subscription, cancelling an order, or stopping an operation. The right translation depends on the product context.

The Contextual Audit uses page, UI, terminology, and product context to evaluate whether translations make sense where they are used.

### UI, product, and CTA intent

The audit considers where a string appears — button, navigation, form, modal, tooltip, heading, error message, notification, menu, or checkout — and evaluates language against the product concepts on the page: feature names, plans, settings, account concepts, workflow actions, and product terminology.

Calls to action deserve particular attention. "Start free trial", "Book now", "Save changes", "Delete account", and "Upgrade" must communicate the intended action in the target locale, not a generic equivalent.

### Glossary, translation memory, and culture

If a glossary or approved terminology is available, translations can be checked against preferred and forbidden terms, product names, and brand terminology.

Where previous approved translations exist, the audit can identify drift from translation memory.

Cultural adaptation looks at currency, dates, measurements, addresses, phone numbers, payment conventions, local examples, cultural references, and idioms. Not every difference is an error. Cultural findings are presented as recommendations or issues for review when appropriate.

Audience context also matters. Language that fits a consumer travel product may be wrong for an enterprise developer tool, a finance product, or healthcare.

## Visual audit: does the localised website actually work?

Languages change the size, shape, and layout of content. The Visual Audit evaluates rendered pages to find problems that cannot be detected from source strings alone.

### Overflow, layout, and text expansion

English "Start free trial" becomes German "Kostenlose Testversion starten". If the German version no longer fits the button, the audit flags it.

Other visual issues include clipped or truncated text, unexpected ellipsis, navigation and table overflow, overlapping elements, broken grids, misaligned content, modal overflow, unexpected wrapping, and incorrect spacing.

Localised pages can also behave differently at mobile, tablet, and desktop widths. The audit can evaluate key layouts across those breakpoints.

### RTL, fonts, and localised assets

For RTL locales such as Arabic and Hebrew, the audit checks text direction, layout mirroring, navigation, alignment, icons, forms, sidebars, and modals.

Typography must support the target scripts — including Arabic, Chinese, Japanese, Korean, Thai, Vietnamese, and Cyrillic. Missing glyphs, unexpected fallback fonts, inconsistent typography, incorrect line height, and rendering issues are flagged.

Language-specific visual assets also matter. A French page that contains a screenshot of English UI is a localisation gap, even if every string on the page is translated.

The audit also checks whether localisation changes visual hierarchy: headings that become too long, CTAs that wrap, important text that loses emphasis, cards of inconsistent height, and navigation that becomes hard to scan.

## How findings are prioritised

Not every issue has the same impact. Each finding is assigned a severity so teams can fix the right things first.

**Critical** problems can severely damage the localised experience: an unavailable locale, an entirely untranslated page, the wrong locale being served, incorrect checkout currency, a major RTL layout break, or an inaccessible localised route.

**High** issues affect usability, SEO, or translation quality: missing `hreflang`, an untranslated primary CTA, a major translation error, broken navigation, clipped important text, or incorrect product terminology.

**Medium** issues are noticeable and should be addressed: terminology inconsistency, missing localised metadata, secondary untranslated content, minor visual overflow, or missing localised alt text.

**Low** findings are quality improvements: slightly unnatural wording, minor style inconsistency, small formatting issues, or optional metadata improvements.

**Info** items are recommendations or opportunities that are not necessarily errors.

AI-powered findings also include a confidence level where appropriate. High-confidence findings are more likely to be objective or deterministic — for example, missing `hreflang`. Lower-confidence findings, such as a potential cultural adaptation issue, should be treated as recommendations for review rather than definitive errors.

## How the audit works

The audit starts from a website URL, discovers available locales, crawls localised pages, extracts content and metadata, renders pages, then runs the four analysis engines before calculating scores and generating a report.

Locale discovery uses signals such as URL structure, `hreflang`, sitemaps, language selectors, HTML metadata, and domains or subdomains.

Rendering the actual page matters. Visual issues caused by translated content often do not exist in the HTML source. The report includes the overall Localisation Score, four module scores, issues grouped by severity, affected pages, evidence, confidence, and recommended actions.

## From findings to continuous quality

An audit should not stop at telling you what is wrong.

When Hyperlocalise identifies an issue, the finding can become the starting point for fixing it: untranslated content can be translated, terminology inconsistencies can be reviewed against approved terms, glossary violations can be updated, missing metadata can be localised, and visual overflow can be addressed in copy or layout.

That creates a continuous workflow: audit, find issues, fix them, re-audit, monitor, and detect regressions.

Localisation is not a one-time project. Every new feature, page, release, or translation can introduce new problems — new English strings, missing translations, glossary violations, broken `hreflang`, incorrect metadata, visual overflow, or routing regressions.

For teams that ship continuously, the goal is to move from a one-time localisation audit to continuous localisation quality monitoring.

This is the same shift we described in [What Is Translation Intelligence?](/blog/what-is-translation-intelligence): translation output is no longer the bottleneck. Judgement, context, and regression detection are.

## Frequently asked questions

### Is this a translation checker?

Not exactly. A translation checker focuses primarily on language quality. The Hyperlocalise Localisation Audit evaluates the entire localised website, including technical implementation, SEO, product context, and visual UI.

### Does a translated website automatically get a good score?

No. A website can have fully translated content and still have problems with `hreflang`, locale routing, currency, date formatting, terminology, product context, visual layout, and accessibility. The score evaluates the overall experience.

### Can the audit detect untranslated content?

Yes. It analyses localised pages to identify content that appears to remain in the source language, while accounting for brand names, URLs, product names, and other content that may intentionally remain unchanged.

### Can it detect bad translations?

The audit can identify potential issues involving meaning, fluency, terminology, grammar, and consistency. AI-powered findings include confidence information so teams can distinguish strong findings from items that may require human review.

### Can it detect visual problems?

Yes. The Visual Audit evaluates rendered localised pages and can identify text overflow, broken layouts, responsive issues, RTL problems, and localised asset issues.

### Does a low score mean the website is unusable?

Not necessarily. The score is a health indicator. Always review the individual findings and their severity. A website may have a good overall score while still having one critical issue affecting an important page or user flow.

## Find localisation problems before your users do

Traditional website audits measure performance, accessibility, and SEO. Translation QA measures accuracy, grammar, and fluency. A localisation audit asks four questions together:

- Is localisation implemented correctly?
- Is the translation correct and natural?
- Is it appropriate for the product, audience, and situation?
- Does the localised experience actually work for users?

Together, those answers are a more complete picture of localisation health.

If you are building products for more than one market, that picture is worth having before customers find the gaps themselves. [Run a free localisation audit](/localisation-audit) or read more about [context-aware localisation](/blog/ai-translation-is-not-enough-context-aware-localisation).
