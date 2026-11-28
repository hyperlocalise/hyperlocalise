---
title: "Keeping Your Glossary and Brand Voice Consistent in Images and Video"
date: 2026-11-24T00:00:00.000Z
excerpt: Brand terms drift in banners, subtitles, and voiceovers. Apply the same glossary, translation memory, and guidelines to every image and video asset.
category: Product
tags:
  - Iris
  - brand voice
  - terminology consistency
  - glossary
  - translation memory
  - creative localisation
  - video localisation
  - AI dubbing
  - subtitles
  - marketing localisation
  - localisation
  - localization
---

Most teams that care about terminology have done the hard part. There's a glossary. Product names have rules. Legal has a list of claims that must never appear in certain markets. The product UI, help centre and website follow it, because they go through a localisation workflow that checks.

Then the campaign assets go out.

The German banner uses a translation of the product name you decided to keep in English. The Japanese subtitles use an informal register the brand dropped two years ago. The Spanish voiceover mispronounces the company name, and so does every voiceover after it, because each one was recorded separately. The French social ad brings back "the best" claim that legal removed last quarter.

None of these are translation failures. Each translation is fluent. They're **consistency failures**, and they happen because creative assets are localised outside the system that holds the rules.

We covered how to set up terminology governance in [How to Keep Brand Voice and Terminology Consistent Across Markets](/blog/how-to-keep-brand-voice-and-terminology-consistent-across-markets). This post covers the next step: applying the same rules to images, video and voice.

## Why creative assets drift

Text content drifts slowly. Creative assets drift fast, for three reasons.

- **They're made outside the localisation workflow.** A designer types translated copy into a banner. An editor pastes subtitles into a timeline. A voice actor reads a script from an email. None of these steps checks the glossary.
- **Every asset is a one-off.** A string in your product is translated once and reused. A headline in a banner is retyped for every size, every market and every campaign, so every copy is another chance to get it wrong.
- **Sound has no spellcheck.** A mispronounced brand name in a voiceover passes every text review, because the script was right. Nobody catches it until a customer does.

The fix isn't more review. It's making creative localisation use the same source of truth as everything else.

## One workspace, one set of rules

**[Iris](/iris)**, the Hyperlocalise app for localising images, video and voice, doesn't keep its own terminology. It reads the same workspace as the web app:

| Resource | What it controls in creative assets |
| --- | --- |
| **Glossaries** | Approved translations are applied, and forbidden terms are blocked in on-screen copy, voiceover scripts and image prompts |
| **Translation memory** | Copy you've already approved, such as taglines, CTAs and offer terms, is reused instead of re-translated |
| **Guidelines** | Copy is checked against your uploaded brand and compliance documents, with findings that cite the rule |
| **Pronunciation** | Glossary entries can say how a term sounds, so every voiceover pronounces it the same way |
| **Workspace memory** | Approved markets feed back into memory, so the next campaign starts from them |

Change a term in the glossary once and it applies to the next banner, subtitle and voiceover as well as to your product and website. There's no second list to keep in sync.

## Images: the copy inside the picture

When Iris localises an image, it reads the copy baked into it, such as the headline, offer, CTA and small print, and looks up each piece against your glossary before translating. Approved terms are used as written. Forbidden terms are blocked. Copy that's in translation memory is reused.

This matters most for the things that repeat across every campaign:

- **Product and plan names.** If "Pro plan" stays in English in your glossary, it stays in English in every banner.
- **Recurring CTAs.** "Start your free trial" gets the same approved translation in every market and every size, not five slightly different ones.
- **Taglines.** An approved tagline per market is reused rather than re-translated each campaign.
- **Claims.** A forbidden claim is blocked in the copy and in the prompt used to generate an image, so it can't return through a generated visual.

For the full image workflow, see [How to Localise Image Ads and Social Creatives for Every Market](/blog/how-to-localise-image-ads-and-social-creatives-for-every-market).

## Video: on-screen copy and subtitles

In video, terminology shows up in two places: text on screen, such as titles, lower thirds and end cards, and subtitles.

**On-screen copy.** Iris treats every word on screen as a translatable message with a note for the translator, for example "End-card CTA, under 18 characters, imperative". That note travels with the copy, so the translation respects the brand's intent and the space available, and the glossary applies as it does anywhere else.

**Subtitles.** When Iris transcribes footage, it listens for your glossary terms, so product names come out spelled correctly rather than as the nearest common word. Translated subtitles then follow the same terminology. Iris also keeps names, numbers and units together on one line, so a product name never gets split across two subtitles.

**Register.** Formal or informal address (`tu`/`vous`, `du`/`Sie`) is a brand decision, not a translation detail. Set it in the brief and your guidelines, and check every market's copy for consistency before approval.

## Voice: pronunciation and brand voices

Voice is where consistency is hardest, and where Iris does something text tools can't.

### Pronunciation lives in the glossary

When a voiceover mispronounces your brand or product name, the usual fix is to respell it phonetically in that one script. The next script gets it wrong again.

In Iris, pronunciation is part of the glossary entry. A term can say how it sounds in the source language and in each target language, and supported voice models read it that way whenever they speak it. Fix a name once and every later voiceover, in every market, says it correctly.

### The same voice in every language

If your brand has its own voice, such as a founder, a regular narrator or a recognisable presenter, Iris can use it in every language. When dubbing existing footage, it keeps the speakers' own voices in each market.

For a new market voice, Iris can design one from a description, such as "a warm Mexican Spanish narrator in her 30s, unhurried". Once you pick one, it's saved to the workspace and reused for every read in that market. Your Mexican campaigns sound like the same brand from one quarter to the next, instead of a new voice each time.

## Check against your guidelines before you ship

Glossaries handle terms. Guidelines handle everything else: tone, claims, disclaimers and market-specific rules in your brand book or compliance documents.

Upload those documents as [guidelines](/product/guidelines) in Hyperlocalise. Iris can then check the copy in any creative against them and return findings that cite the specific rule broken. Mark a document as mandatory and it's always applied in full. Other documents contribute the most relevant passages to each check.

A sensible review step for any campaign:

1. Look up glossary terms in the source copy for each market.
2. Translate and localise the assets.
3. Check every market's copy against your guidelines.
4. Preview each market for layout and fit.
5. Have a reviewer who knows the market approve it.

## Make approvals count

Consistency compounds when approvals feed back into the system.

When a reviewer approves a market in Iris, the approved copy goes into workspace memory. The next campaign starts from copy your team has already signed off, not from a fresh translation that might drift.

When a reviewer finds a terminology problem, fix it in the glossary, not in the one asset. Then the correction applies everywhere: the next banner, the next subtitle file, the next voiceover and the product UI.

## A consistency checklist for creative assets

- [ ] Glossary covers product names, plan names, recurring CTAs, taglines and forbidden claims
- [ ] Pronunciations added for brand and product names that voiceovers might get wrong
- [ ] Register (formal or informal) decided per market and written into guidelines
- [ ] Brand and compliance documents uploaded as guidelines, with must-follow ones marked mandatory
- [ ] A saved brand voice, or a chosen voice per market, used for every read
- [ ] Every market checked against glossary and guidelines before approval
- [ ] Corrections made in the glossary, not in individual assets
- [ ] Approvals saved so the next campaign starts from them

## Get started

If you already use Hyperlocalise glossaries for your product or website, Iris uses them automatically: no import, no second termbase. **[Download Iris](/iris)** for Mac, open one campaign asset and localise it for a market you know well. Then check whether it uses the terms your team agreed.

New to Iris? Read the [launch post](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets). If you want your coding agent to run this workflow, see [Using Iris from Claude Code, Cursor and Other Agents over MCP](/blog/using-iris-from-claude-code-and-other-agents-over-mcp).
