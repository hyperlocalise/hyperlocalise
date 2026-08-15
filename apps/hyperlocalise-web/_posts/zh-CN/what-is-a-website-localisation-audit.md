---
title: 什么是网站本地化审计？
date: 2026-08-13T00:00:00.000Z
excerpt: 翻译网站只是开始。本地化审查会评估技术实现、语言质量、产品语境和视觉体验，并告诉你应该优先修复哪些问题。
category: 产品
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

翻译网站只是本地化的开始。

A site can have translated pages and still give international users a poor experience. A missing `hreflang` tag can hurt discoverability. An untranslated call to action can confuse visitors. A technically correct translation can still use the wrong product term. A longer German string can break a button on mobile.

本地化审计所回答的问题不是“翻译了多少个字符串？”，而是：

> **您的网站是否真正为该地区的用户量身打造？**

Hyperlocalise 本地化审计从技术、语言、语境和视觉四个维度检查网站，并给出满分 100 分的本地化评分，以及应优先修复的问题。

## 本地化审计涵盖的内容

本地化审核不是翻译检查器，也不是通用的网站审核。

性能、无障碍和 SEO 工具关注的是实现。翻译质量检查关注的是准确性、语法和流畅度。两者都无法完整呈现多语言网站的全貌。

本地化审查结合了双方的观点：

| 审计             | 权重  | 它回答的问题                                           |
| ---------------- | -----: | ----------------------------------------------------- |
| 技术审计  |    25% | 本地化是否正确实施？                |
| 语言审核 |    25% | 翻译是否准确、自然且一致？   |
| 上下文审核 |    25% | 本地化内容在您的产品语境中是否合理？ |
| 视觉审核     |    25% | 本地化 UI 的外观和行为是否正确？      |

您将获得总体评分、各项评分，以及包含严重程度、证据和置信度的可执行分析结果。

## 如何解读评分

总体评分是健康状况指标，不能替代详细的检查结果。请始终先查看严重程度最高的问题。

| 分数  | 评级              | 含义                                                                  |
| ------ | ----------------- | -------------------------------------------------------------------- |
| 90–100 | 优秀         | 本地化体验状态良好                          |
| 75–89  | 良好              | 网站总体本地化程度较高，但仍有一些问题需要改进 |
| 50–74  | 需要改进 | 用户可能会遇到明显的本地化问题                 |
| 25–49  | 较差              | 显著的本地化缺陷正在影响体验           |
| 0–24   | 严重          | 本地化体验存在应予解决的重大问题 |

一个网站的总体评分可能很高，但结账、路由或高流量页面上仍可能存在一个关键问题。评分告诉你应该查看哪里，检测结果则告诉你需要修复什么。

## 技术审查：本地化是否正确实施？

技术审计会检查多语言网站背后的基础设施：可发现性、路由、格式、无障碍，以及用户和搜索引擎能否访问正确的语言区域。

### 本地化检测与路由

Pages should declare their language and locale correctly, for example `<html lang="fr-FR">`. The audit looks for missing language declarations, incorrect language or region codes, locale/content mismatches, and inconsistent identifiers.

它还会检查本地化页面是否使用一致的 URL 结构：

```text
/en/pricing
/fr/pricing
/de/pricing
```

常见故障包括缺少本地化路由、区域设置 URL 损坏、重定向错误、意外回退到默认区域设置，以及区域设置持久化问题。

### Language switcher and `hreflang`

Visitors should be able to change locale without losing the page they are viewing. Switching from `/fr/pricing` should land on `/de/pricing`, not the German homepage.

The audit also checks the relationships between localised versions of a page: missing `hreflang`, incorrect language or region codes, invalid URLs, missing reciprocal or self-references, incorrect `x-default`, and conflicts with canonical URLs.

本地化页面通常应将自身设为规范页面。将法语定价页面规范化到英文版本，是常见的 SEO 错误：

```text
/fr/pricing
canonical → /en/pricing
```

### 元数据、站点地图和结构化数据

Important page metadata should be localised: titles, meta descriptions, Open Graph titles and descriptions, `og:locale`, and social sharing metadata.

审计还会检查本地化 URL 是否出现在网站地图中并能正确解析，并在适用的情况下，检查 Product、WebPage、Breadcrumbs、FAQ、Organization、Article 和 LocalBusiness 等结构化数据是否已本地化。

### 国际化格式与无障碍性

本地化敏感值应与区域设置匹配：

```text
US:  $1,234.56
DE:  1.234,56 €
FR:  1 234,56 €
```

请提供要翻译的文本。

Accessibility localisation covers `lang`, `aria-label`, accessible names, form labels, validation messages, and image `alt` text.

## 语言审查：语言是否准确、自然且一致？

语言审查会评估页面上的语言。它不仅检查文本是否已翻译，还会考察译文是否传达了正确的含义，以及对目标区域的用户来说是否自然。

### 完整性和准确性

未翻译的内容会被标记，而品牌名称、产品名称、URL、电子邮件地址、代码、专有名词和有意保留的英文术语则视为预期例外。

一个法语页面，内容如下：

```text
Bienvenue sur notre site.

Start your free trial
```

会因号召性用语未翻译而被标记。

准确性检查会检查是否遗漏或增加含义、解释错误、数字错误、产品操作错误以及术语不正确。

### 流畅性、术语和品牌语调

翻译在技术上可能是正确的，但读起来仍然不自然。审核会检查措辞是否生硬、句子结构是否不自然、语法和拼写问题、机器翻译痕迹以及符合地区习惯的写作规范。

它还会识别网站中翻译不一致的概念：

```text
Workspace

Page 1 → Espace de travail
Page 2 → Workspace
Page 3 → Espace Workspace
```

请提供要翻译的源文本。

品牌语调会根据预期的风格进行评估，包括专业、友好、简洁、技术性、对话式、高端或活泼，同时也会考量符合特定地区的语法和风格，例如大小写、标点符号、正式程度和一致性。

## 上下文审核：该翻译是否适用于此产品？

上下文是本地化中最容易被忽略的部分之一。

翻译在语法上可能完美无误，但如果不符合其出现位置的语境，仍然可能是错误的。“Cancel”可能表示关闭对话框、取消订阅、取消订单或停止操作。正确的翻译取决于产品语境。

上下文审核会利用页面、UI、术语和产品上下文，评估翻译在其使用场景中是否合理。

### UI、产品和 CTA 意图

审核会考虑字符串出现的位置——按钮、导航、表单、模态框、工具提示、标题、错误消息、通知、菜单或结账页面——并根据页面上的产品概念评估语言：功能名称、套餐、设置、账户概念、工作流操作和产品术语。

行动号召尤其需要注意。“开始免费试用”、“立即预订”、“保存更改”、“删除账户”和“升级”必须在目标语言环境中传达预期的操作，而不是使用泛泛的对应表达。

### 术语表、翻译记忆库和文化

未提供待翻译的源文本。

如果之前有已批准的翻译，审核可以识别出与翻译记忆的偏差。

文化适配会关注货币、日期、度量衡、地址、电话号码、支付惯例、本地示例、文化引用和习语。并非每一项差异都是错误。在适当情况下，文化相关问题会以建议或待审核事项的形式呈现。

受众背景同样很重要。适合面向消费者的旅游产品的语言，可能并不适用于企业级开发者工具、金融产品或医疗保健产品。

## 视觉审查：本地化网站实际运行正常吗？

语言会改变内容的大小、形状和布局。视觉审查会评估渲染后的页面，以发现仅凭源字符串无法检测到的问题。

### 溢出、布局和文本扩展

英语“开始免费试用”变为德语“Kostenlose Testversion starten”。如果德语版本不再适合按钮，审核会将其标记出来。

其他视觉问题包括文本被裁剪或截断、意外出现省略号、导航和表格溢出、元素重叠、网格布局损坏、内容错位、模态框溢出、意外换行以及间距不正确。

本地化页面在移动端、平板端和桌面端宽度下也可能表现不同。审计可以评估这些断点下的关键布局。

### RTL、字体和本地化资源

对于阿拉伯语和希伯来语等 RTL 语言区域设置，审核会检查文本方向、布局镜像、导航、对齐方式、图标、表单、侧边栏和模态框。

排版必须支持目标文字体系，包括阿拉伯文、中文、日文、韩文、泰文、越南文和西里尔文。缺失字形、意外的备用字体、不一致的排版、错误的行高以及渲染问题都会被标记。

特定语言的视觉资源同样重要。法语页面中如果包含英文 UI 的屏幕截图，即使页面上的每个字符串都已翻译，仍然属于本地化缺口。

审查还会检查本地化是否改变了视觉层次：标题变得过长、行动号召换行、重要文本失去强调、卡片高度不一致，以及导航变得难以快速浏览。

## 调查结果如何排序

并非所有问题的影响都相同。每项发现都会被分配一个严重程度，以便团队优先修复最重要的问题。

**严重**问题可能会严重损害本地化体验：语言区域不可用、页面完全未翻译、提供了错误的语言区域、结账货币不正确、RTL 布局出现重大问题，或本地化路由无法访问。

**High** issues affect usability, SEO, or translation quality: missing `hreflang`, an untranslated primary CTA, a major translation error, broken navigation, clipped important text, or incorrect product terminology.

**中等**问题较为明显，应予以处理：术语不一致、缺少本地化元数据、次要内容未翻译、轻微视觉溢出或缺少本地化替代文本。

**低级别**发现属于质量改进：措辞略显不自然、轻微的风格不一致、小的格式问题或可选的元数据改进。

**信息**项是建议或机会，不一定是错误。

AI-powered findings also include a confidence level where appropriate. High-confidence findings are more likely to be objective or deterministic — for example, missing `hreflang`. Lower-confidence findings, such as a potential cultural adaptation issue, should be treated as recommendations for review rather than definitive errors.

## 审计如何运作

审计从网站 URL 开始，发现可用的区域设置，抓取本地化页面，提取内容和元数据，渲染页面，然后运行四个分析引擎，最后计算分数并生成报告。

Locale discovery uses signals such as URL structure, `hreflang`, sitemaps, language selectors, HTML metadata, and domains or subdomains.

渲染实际页面很重要。翻译内容导致的视觉问题通常不会存在于 HTML 源代码中。报告包括总体本地化评分、四个模块评分、按严重程度分组的问题、受影响的页面、证据、置信度和建议采取的措施。

## 从发现到持续质量

审计不应止步于告诉你哪里出了问题。

当 Hyperlocalise 识别出问题后，该发现可以成为解决问题的起点：未翻译的内容可以进行翻译，术语不一致问题可以对照已批准的术语进行审核，术语表违规项可以更新，缺失的元数据可以进行本地化，视觉溢出问题则可以通过调整文案或布局来解决。

这就形成了一个持续的工作流程：审计、发现问题、修复问题、重新审计、监控并检测回归。

Localisation is not a one-time project. Every new feature, page, release, or translation can introduce new problems — new English strings, missing translations, glossary violations, broken `hreflang`, incorrect metadata, visual overflow, or routing regressions.

对于持续交付的团队来说，目标是从一次性的本地化审查转向持续的本地化质量监控。

This is the same shift we described in [What Is Translation Intelligence?](/blog/what-is-translation-intelligence): translation output is no longer the bottleneck. Judgement, context, and regression detection are.

## 常见问题

### 这是翻译检查工具吗？

不完全是。翻译检查器主要关注语言质量。Hyperlocalise 本地化审计会评估整个本地化网站，包括技术实施、SEO、产品上下文和视觉 UI。

### 翻译后的网站会自动获得高评分吗？

No. A website can have fully translated content and still have problems with `hreflang`, locale routing, currency, date formatting, terminology, product context, visual layout, and accessibility. The score evaluates the overall experience.

### 审核能检测出未翻译的内容吗？

是的。它会分析本地化页面，以识别似乎仍保留源语言的内容，同时考虑品牌名称、URL、产品名称以及其他可能有意保持不变的内容。

### 它能检测出糟糕的翻译吗？

审核可以识别涉及含义、流畅性、术语、语法和一致性的潜在问题。AI 驱动的发现结果包括置信度信息，帮助团队区分可靠的发现与可能需要人工审核的项目。

### 它能检测出视觉问题吗?

是的。Visual Audit 会评估本地化页面的渲染效果，并能识别文本溢出、布局错乱、响应式问题、RTL 问题以及本地化资源问题。

### 低评分是否意味着该网站无法使用？

不一定。评分是一个健康度指标。请始终查看各项具体发现及其严重程度。网站的总体评分可能不错，但仍可能存在影响重要页面或用户流程的严重问题。

## 在用户发现本地化问题之前，先找出它们

传统的网站审查会衡量性能、可访问性和 SEO。翻译质量检查会衡量准确性、语法和流畅度。本地化审查会同时提出四个问题：

- 本地化是否正确实现？
- 翻译是否正确、自然？
- 这是否适合该产品、受众和情境？
- 本地化体验对用户来说真的有效吗？

这些答案结合起来，能更全面地反映本地化的健康状况。

If you are building products for more than one market, that picture is worth having before customers find the gaps themselves. [Run a free localisation audit](/localisation-audit) or read more about [context-aware localisation](/blog/ai-translation-is-not-enough-context-aware-localisation).
