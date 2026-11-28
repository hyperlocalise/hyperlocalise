---
title: How to Localise Image Ads and Social Creatives for Every Market
date: 2026-11-24T00:00:00.000Z
excerpt: Translating captions is easy; copy baked into banners is not. How to localise image ads, social creatives, and product shots so each market feels local.
category: Product
tags:
  - Iris
  - ad localisation
  - creative localisation
  - image localisation
  - social media localisation
  - marketing localisation
  - transcreation
  - localisation
  - localization
  - terminology consistency
  - visual QA
  - RTL
---

Your campaign launches in eight markets on Monday. The ad copy has been translated, the captions are ready and the landing pages are live.

Then someone asks about the banners.

The headline, the offer and the call to action are all part of the image. Each market needs its own version, so a designer reopens the source file, pastes in the translations, finds that the German headline doesn't fit, shrinks it, finds the Japanese font is missing, and repeats for every size and every market. Forty assets later, the campaign launches on Thursday, and one market still shows last quarter's price.

This guide covers how to localise image ads and social creatives properly: what to decide before you start, how to handle copy baked into the picture, and how to check every market before it ships. We'll use **[Iris](/iris)**, the Hyperlocalise Mac app for multilingual assets, for the hands-on parts, but the checklist applies whatever tools you use.

## Why image ads are the hardest part of a campaign to localise

Text in a product or a website lives in strings. You can extract it, translate it and push it back. Text in an image doesn't work that way.

- **The copy is part of the picture.** Unless someone kept a layered source file for every size, there's nothing to swap.
- **Every market multiplies the work.** One concept × four sizes × eight markets is 32 assets, and every copy change starts the count again.
- **Space is fixed.** A headline that fits in English may be 30% longer in German, and the box doesn't grow.
- **Scripts behave differently.** Japanese and Thai wrap lines without spaces between words. Arabic reads right to left. Many brand fonts have no glyphs for any of them.
- **Ads carry rules.** Offer terms, prices, disclaimers and banned claims vary by market, and a mistake in paid media is public and costly.

So the problem isn't really translation. It's rebuilding the asset in each market while keeping the design, the brand terms and the legal copy intact.

## Step 1: Decide the markets, not just the languages

Start with a list of markets written as locale codes: `fr-FR`, `de-DE`, `ja-JP`, `pt-BR`, `ar-AE`.

Language alone isn't enough. Spanish for Spain and Spanish for Mexico differ in vocabulary, tone and formality. Portuguese for Brazil and Portugal differ more than most teams expect. A price shown as `€49` in France is written `49 €`. A "Black Friday" offer may mean nothing, or the wrong dates, in some markets.

For each market, write down:

- **Register.** Formal or informal address (`tu`/`vous`, `du`/`Sie`).
- **Offer and pricing.** Currency, format, and whether the offer applies at all.
- **Legal copy.** Disclaimers, terms and anything regulators require.
- **Whether to translate or rewrite.** A pun or cultural reference may need new copy, not a translation. That's [transcreation](/blog/hyperlocalisation-why-global-growth-needs-more-than-translation), and it's a decision to make up front, not discover in review.

## Step 2: Get your terminology in place before anyone translates

Most ad localisation mistakes are terminology mistakes, not grammar mistakes: the product name translated when it should stay in English, a competitor's trademark used for a generic feature, a claim legal removed last quarter coming back in one market.

Before you localise anything, make sure your glossary covers:

- **Product and feature names**, and whether each one is translated.
- **Approved translations** for recurring campaign terms such as "free trial", "limited time" and "sign up".
- **Forbidden terms**, meaning words that must never appear in a given market.
- **Taglines**, with an approved version per market rather than a fresh translation every campaign.

In Hyperlocalise, Iris reads the same glossaries and translation memory as the web app. Approved translations are applied, and forbidden terms are blocked in on-screen copy and in image prompts. If your rules live in a brand book or compliance document, upload it as a [guideline](/product/guidelines) and check the copy against it. We go deeper on ownership and enforcement in [How to Keep Brand Voice and Terminology Consistent Across Markets](/blog/how-to-keep-brand-voice-and-terminology-consistent-across-markets).

## Step 3: Localise the copy inside the image

There are two starting points, and they need different approaches.

### You have a finished image

This is the common case. You have a flattened PNG or JPEG from an agency or a design tool, and the copy is baked in.

In Iris, the flow is:

1. **Open the image** as a creative.
2. **Read the text in the image.** Iris finds each piece of copy and records where it sits, so you get the headline, offer, call to action and small print as separate items.
3. **Translate and review those items** against your glossary and translation memory. You review the copy, not the picture, which is faster and easier to share with reviewers in each market.
4. **Localise the image for each market.** Iris redraws the approved copy in the same position and style, keeping the photography, product and layout as they were.

Each result is saved as that market's version of the creative and shown next to the original, so you can compare markets side by side. No layered file or clean background plate is needed.

### You're designing it fresh

If the creative doesn't exist yet, generate the original in Iris from a brief. Include your brand colours, the type you use, the layout, the exact copy in quotes, and your logo and product shots as references. Then localise it the same way.

Write the source copy with localisation in mind:

- **Keep the headline short.** Every word you cut in English saves more in German.
- **Don't join copy fragments together.** "Save" + "20%" + "today" breaks in languages with different word order. Write the full sentence.
- **Leave room.** Plan for roughly a third more space than the English needs.

If the creative will run in many markets and change often, consider making the copy live text layers instead of part of the picture. Live text stays editable and is translated like any other message.

## Step 4: Check the layout in every market

This is the step teams skip, and it's the one customers notice.

Translations change length. German, Finnish and French often run 20–35% longer than English. Chinese and Japanese run shorter, which can leave awkward empty space. Arabic and Hebrew read right to left, so left-aligned layouts look wrong. Thai, Japanese and Chinese wrap lines without spaces, so line breaks fall in unexpected places.

For every market, check:

| Check | What to look for |
| --- | --- |
| **Overflow** | Text cut off, running past the edge or colliding with the product |
| **Line breaks** | Single words left alone on the last line, or breaks that split a brand name or a price |
| **Direction** | Right-to-left copy aligned right or centred, with the layout still balanced |
| **Fonts** | Missing characters (empty boxes) or a fallback font that doesn't match the brand |
| **Numbers** | Prices, percentages and dates written the way that market writes them |
| **Fit** | Copy that is still short enough to read in the second or so a social ad gets |

Iris checks for these problems, and you can preview each market at full size before approving it. For long-running campaigns, run the same checks you'd use in a [website localisation audit](/blog/what-is-a-website-localisation-audit), since it's the same idea applied to creative assets.

## Step 5: Review with people who know the market

AI gets you to a strong first draft in every market. A person who knows the market should still approve anything you pay to put in front of customers.

Make review fast:

- **Send reviewers the copy and the rendered image**, not a spreadsheet of strings out of context.
- **Ask specific questions.** Does the headline sound natural? Is the offer clear? Is anything off-brand or risky?
- **Fix problems at the source.** If a term is wrong, fix it in the glossary rather than in one image, so every later asset gets it right.
- **Save approvals.** When a market signs off, the workspace remembers the approved copy, so the next campaign starts from it instead of from scratch.

## Step 6: Export and measure per market

Export only the markets that have been approved. Name files by concept, size and locale so media buyers don't upload the French banner to the German ad set.

Then treat localisation as something you can measure. Compare click-through and conversion by market against a translated-only control, or against last campaign's results. If one market underperforms, the creative copy is a variable you can now change in minutes instead of days. That's where [market experimentation](/use-cases/market-experimentation) gets practical.

## A checklist for your next campaign

- [ ] Markets listed as locale codes, with register, offer and legal copy for each
- [ ] Translate-or-rewrite decided for headlines and taglines
- [ ] Glossary covers product names, recurring campaign terms and forbidden terms
- [ ] Source copy written short, as full sentences, with room to grow
- [ ] Image copy read, translated and reviewed against the glossary
- [ ] Every market previewed for overflow, line breaks, direction, fonts and numbers
- [ ] Approved by a reviewer who knows each market
- [ ] Approvals saved so the next campaign starts from them
- [ ] Files named by concept, size and locale; results tracked per market

## Try it on one asset

You don't need to change your whole campaign process to see the difference. Take one banner you're shipping this month and one market you've been putting off. Localise it in Iris, check the layout, and compare the result and the time it took with your current process.

Iris is free to download for Mac, and generation uses AI credit included in paid plans from $20 a month. Read the [Iris launch post](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets) for the full picture, or **[download Iris](/iris)** and start with your next campaign.
