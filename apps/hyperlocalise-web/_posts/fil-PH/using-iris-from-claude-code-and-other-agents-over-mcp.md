---
title: "Paggamit ng Iris mula sa Claude Code, Cursor, at iba pang agent sa pamamagitan ng MCP"
date: 2026-11-24T00:00:00.000Z
excerpt: Iniaalok ng Iris ang buong creative localization toolset nito sa pamamagitan ng MCP. Ikonekta ang Claude Code, Cursor, Codex o iba pang agent, at hilingin dito na i-localize ang mga larawan, magsalin at mag-dub ng mga video, at suriin ang bawat market ayon sa iyong glossary habang pinapanood mong ginagawa ang mga ito sa app.
category: Inhinyeriya
tags:
  - Iris
  - MCP
  - Model Context Protocol
  - Claude Code
  - Cursor
  - AI agents
  - creative localisation
  - video localisation
  - image localisation
  - localisation
  - localization
  - agentic workflows
---

Napakahusay na ng mga coding agent sa lokalisasyon ng produkto. Kinukuha nila ang mga string, ikinokonekta ang `react-intl`, nagbubukas ng mga pull request, at sinusuri ang mga anyo ng maramihan. Nagsulat na kami tungkol sa workflow na ito para sa [GitHub](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release) at para sa [React Intl at ICU](/blog/react-intl-icu-localisation-workflow-extract-sync-and-review).

Kailangan din ng release ng launch video, isang set ng mga social banner, at isang product demo sa anim na wika, pero hindi makakatulong ang agent. Nakabatay ang mga creative tool sa isang taong nagki-click sa timeline o canvas. Walang anumang puwedeng tawagin ng agent.

**[Iris](/iris)** ay gumagana sa ibang paraan. MCP tool din ang bawat kakayahan sa app. Ikonekta ang agent mo nang isang beses, at maaari na itong magbukas ng mga creative, basahin ang text sa isang larawan, i-localize ito para sa bawat market, lagyan ng subtitle at dubbing ang isang video, tingnan ang mga layout, at basahin ang glossary at translation memory mo. Ginagawa ang trabaho sa Iris app sa Mac mo, kaya masusubaybayan mo ito at makikialam anumang oras.

Ipinapaliwanag ng artikulong ito kung ano ang hitsura nito, paano kumonekta, at paano bigyan ang isang ahente ng malikhaing gawain sa lokalisasyon na kaya nitong tapusin.

## Bakit mahalaga ang access sa MCP para sa malikhaing gawain

Karamihan sa mga creative tool ay may button para mag-export, at ang ilan ay may API para sa iisang gawain gaya ng “isalin ang subtitle file na ito.” Pero hindi kayang patakbuhin ng alinman sa mga ito ang buong workflow ng isang agent.

Ang pag-localize ng isang creative ay sunod-sunod na pagpapasya: basahin ang kopya, tingnan ang mga aprubadong termino, isalin, muling iguhit o baguhin ang timing, suriin ang bawat market, ayusin ang mga nagkaproblema, at magpatulong sa isang tao na mag-apruba. Mapangangasiwaan lang ng isang agent ang buong proseso kung maaabot nito ang bawat hakbang.

Ginagawang available ni Iris ang lahat ng ito. Inililista ng server ang buong hanay ng mga tool nito para sa bawat nakakonektang agent, kasama ang paglalarawan sa mga input at output ng bawat tool gamit ang JSON Schema. Kasama rin dito ang parehong mga pahina ng kasanayan na ginagamit ng built-in na assistant ni Iris, na sumasaklaw sa localization, pag-edit ng video, motion graphics at terminolohiya, para matutuhan ng agent ang tamang workflow bago ito magsimula sa halip na manghula.

Ibig sabihin, maaari kang magtalaga ng resultang gusto mong makamit (“i-localize ang campaign na ito para sa France, Germany, at Japan”) sa halip na ilista ang bawat hakbang.

## Mga magagawa ng isang ahente sa pamamagitan ng Iris

| Lugar | Ano ang magagawa ng ahente |
| --- | --- |
| **Mga larawan** | Basahin ang tekstong nakalagay na sa banner o social ad, isalin ito, at muling ilagay sa disenyo ang aprubadong teksto para sa bawat merkado |
| **Video** | Muling buuin ang tekstong nasa screen ng natapos na video, isalin ito, at gumawa ng mga subtitle na nakaayon ang timing sa orihinal |
| **Boses** | I-dub ang pagsasalita gamit ang sariling boses ng mga speaker, gumawa ng mga bagong voiceover para sa bawat market, at i-sync ang galaw ng labi |
| **Mga terminolohiya** | Hanapin sa talahuluganan ang mga termino, aprubado at ipinagbabawal na salin, at memorya ng pagsasalin para sa anumang teksto |
| **Mga Alituntunin** | Suriin ang nilalaman batay sa mga dokumento tungkol sa brand at compliance na na-upload mo, at tukuyin ang mga natuklasan kasama ang mga sangguniang pinagmulan |
| **Kalidad** | Suriin ang bawat market kung may tekstong lumalampas, mga caption na lumalabas sa screen, at nawawalang character, at i-preview ang mga frame na may pinakamaraming teksto |
| **Workspace** | Basahin ang mga proyekto sa lokalisasyon, gawain, ulat ng QA, at automation sa iyong Hyperlocalise workspace |

Gumagamit ang ahente ng parehong mga glossary at translation memory gaya ng iba sa workspace mo. Kapag naglo-localize ito ng banner, ginagamit ang mga aprubadong termino at hinaharang ang mga ipinagbabawal na termino, gaya rin ng ginagawa para sa taong gumagamit ng app.

## Ikonekta ang iyong agent

Pinapatakbo ni Iris ang MCP server nito nang lokal habang bukas ang app. Maa-access lang ito mula sa sarili mong computer, sa nakapirming address na:

```text
http://127.0.0.1:4747/mcp
```

### Ang mabilis na paraan

Sa Iris, buksan ang **Ikonekta ang mga agent gamit ang MCP**. Nakikita ng Iris ang mga agent na naka-install sa Mac mo at isinusulat ang server sa configuration ng bawat isa kapag pinili mo ang **Ikonekta**. Sinusuportahan nito ang Claude Code, Claude Desktop, Cursor, VS Code (Copilot), GitHub Copilot CLI, Codex, Gemini CLI, Windsurf, Cline, Roo Code, Amp, OpenCode at iba pa.

### Manu-mano

Kung mas gusto mong ikaw mismo ang magdagdag nito, magrehistro ng HTTP MCP server na pinangalanang `hyperlocalise-iris`. Para sa Claude Code:

```bash
claude mcp add --scope user -t http hyperlocalise-iris http://127.0.0.1:4747/mcp
```

Para sa Cursor, idagdag ito sa `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "hyperlocalise-iris": {
      "url": "http://127.0.0.1:4747/mcp"
    }
  }
}
```

Maaaring ma-access ng mga client na maaari lamang maglunsad ng mga lokal na command-line server ang URL sa pamamagitan ng isang generic na bridge tulad ng `mcp-remote`.

### Tingnan ang koneksyon

Habang bukas ang Iris, itanong sa iyong agent:

```text
What screen do I have open in Hyperlocalise? Don't change anything.
```

Dapat nitong ilarawan kung ano ang nasa screen sa app. Kung wala ang mga tool, tiyaking tumatakbo si Iris. Umiiral lang ang server habang bukas ang app.

> **Iba ang MCP server ni Iris sa [naka-host na MCP server ng Hyperlocalise](/use-cases/localisation-for-ai-coding-agents).** Binibigyan ng naka-host na server sa `hyperlocalise.com/mcp` ang mga agent ng access sa mga proyekto, source file, at translation key mo saanman. Nagdaragdag naman ang lokal na server ni Iris ng creative work (mga larawan, video, at boses) sa Mac mo. Maraming team ang kumokonekta sa pareho.

## Bigyan ang ahente ng gawaing kaya nitong tapusin.

Pinakamahusay ang trabaho ng mga agent kapag malinaw ang inaasahang resulta, tiyak ang saklaw, at may puntong sinusuri ng tao ang resulta. Ilan sa mga prompt na mahusay gumana:

**I-localize ang banner**

```text
Open the summer-sale banner in Iris and localise it for fr-FR, de-DE and ja-JP.
Use our glossary and keep "Pro plan" in English. Check each market for overflow and
show me the results side by side. Don't export.
```

**Lagyan ng subtitle ang video ng produkto**

```text
Subtitle the onboarding video for es-MX and pt-BR. Split cues at natural pauses,
keep product names together, and flag any cue that overflows the caption area.
```

**Suriin ang kopya bago ito ilabas**

```text
Look up the glossary terms in this ad copy for de-DE, then check the German
translation against our brand guidelines. List anything that breaks a rule,
with the guideline it breaks.
```

**Gawing mga materyal sa paglulunsad ang release**

```text
Read the release notes in this PR, write a 15-second launch video script, and build it
in Iris. Then localise the on-screen copy for our five launch markets and show me
a preview of each.
```

Dito nagiging interesante ang huling bahagi. Ang mismong agent na naglabas ng feature ang makakagawa ng mga materyal para sa paglulunsad sa bawat merkado, gamit ang mga terminong ginagamit mismo ng produkto.

## Panatilihing may taong nakaaalam sa mga nangyayari.

Binuo ang Iris para ang agent ang gumawa ng trabaho, at isang tao ang mag-apruba nito.

- **Nakikita mo ang ginagawa.** Gumagana ang agent sa Iris app sa Mac mo, kaya makikita mong nagbabago ang mga creative habang ginagawa nito ang trabaho at maaari kang makialam anumang oras.
- **Mga preview bago mag-export.** Ginagabayan ang mga ahente na magpakita ng mga preview frame at ipagpaliban ang panghuling export hanggang sa hilingin mo ito.
- **Dapat mapagkasunduan ang mga pagbabago sa glossary.** Ginagabayan ang mga ahente na kumpirmahin muna sa iyo ang bagong termino sa glossary bago ito idagdag, sa halip na palihim na baguhin ang iyong termbase.
- **Tinuturuan ng mga pag-apruba ang workspace.** Kapag inaprubahan mo ang isang market, mapupunta sa memorya ng workspace ang aprubadong kopya, kaya dito magsisimula ang susunod na pagtakbo ng agent.

Iyan din ang prinsipyong pinagbabatayan ng bawat workflow ng Hyperlocalise, na tinalakay namin sa [Dapat Ka Bang Bumuo ng Sarili Mong Ahente sa Lokalisasyon?](/blog/should-you-build-your-own-localisation-agent): hindi ang pagbuo ng output ang mahirap, kundi ang pagpapanatili ng konteksto, pagtiyak sa kalidad at pagkatuto mula sa feedback ng tao.

## Magsimula

1. **[I-download ang Iris](/iris)** para sa Mac. Libre ito; gumagamit ng AI credit ang pagbuo, na kasama sa mga bayad na plan mula $20 kada buwan.
2. Buksan ang **Ikonekta ang mga ahente gamit ang MCP** at ikonekta ang mga ahenteng ginagamit mo.
3. Ipa-localize sa iyong ahente ang isang asset na ilalabas mo ngayong buwan.

Bago ka lang ba sa Iris? Magsimula sa [post ng paglulunsad](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets), o basahin ang [Paano i-localize ang mga image ad at social creative para sa bawat market](/blog/how-to-localise-image-ads-and-social-creatives-for-every-market) para malaman ang workflow na susundin ng iyong ahente.
