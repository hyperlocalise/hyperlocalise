---
title: "通过 MCP 在 Claude Code、Cursor 和其他智能体中使用 Iris"
date: 2026-11-24T00:00:00.000Z
excerpt: Iris 通过 MCP 提供完整的创意本地化工具集。连接 Claude Code、Cursor、Codex 或其他智能体，让它为图片进行本地化、为视频添加字幕和配音，并根据术语表检查每个市场的内容，同时在应用中实时查看工作进度。
category: 工程
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

编码智能体已经非常擅长产品本地化。它们可以提取字符串、接入 `react-intl`、发起拉取请求并检查复数形式。我们写过关于这一工作流程的文章，介绍如何用于 [GitHub](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)，以及如何用于 [React Intl 和 ICU](/blog/react-intl-icu-localisation-workflow-extract-sync-and-review)。

接下来，产品发布还需要一段上线视频、一组社交媒体横幅，以及六种语言的产品演示，而智能体却无能为力。创意工具都是围绕着由人来点击操作时间线或画布而设计的。智能体没有任何可调用的工具。

**[Iris](/iris)** 的工作方式有所不同。应用中的每项功能也都是一个 MCP 工具。只需连接一次你的智能体，它就能打开创意素材、读取图片中的文案、为各个市场进行本地化、为视频添加字幕和配音、检查版面，并读取你的术语表和翻译记忆库。所有操作都在 Mac 上的 Iris 应用中进行，你可以全程查看，并随时介入。

本文将介绍具体是什么样、如何连接，以及如何为智能体布置一个它确实能够完成的创意本地化任务。

## 为什么 MCP 访问对创意工作很重要

大多数创作工具都提供导出按钮，有些还提供用于单项任务（例如“翻译这个字幕文件”）的 API。但它们都无法让智能体运行整个工作流程。

本地化一份创意素材需要一连串决策：阅读文案、查找已批准的术语、翻译、重新绘制或调整时间、检查每个市场、修复出问题的部分，并请人审批。只有能够触达每个环节，智能体才能负责整个流程。

Iris 会向任何已连接的智能体开放所有这些内容。服务器会向智能体列出完整的工具集，并以 JSON Schema 描述每种工具的输入和输出。服务器还会提供 Iris 内置助手使用的相同技能页面，涵盖本地化、视频剪辑、动态图形和术语，让智能体在开始前就掌握正确的工作流程，而不是靠猜。

这意味着你可以直接交付一个目标（“将此营销活动本地化到法国、德国和日本”），而不必列出每个步骤。

## 代理人可以通过 Iris 做什么

| 区域 | 代理可以执行的操作 |
| --- | --- |
| **图片** | 读取横幅或社交广告图片中的文案，将其翻译，并为每个市场重新绘制已批准的文案 |
| **视频** | 重建已完成视频中的屏幕文字，对其进行翻译，并生成与原视频时间同步的字幕 |
| **声音** | 用说话者本人的声音进行配音，为不同市场生成新的配音，并同步口型 |
| **术语** | 查阅术语表中的术语、已批准和禁用的译法，以及任何文案的翻译记忆 |
| **指南** | 根据您上传的品牌和合规文件检查文案，并注明发现所依据的来源 |
| **质量** | 检查各市场是否存在文本溢出、字幕超出屏幕以及字符缺失，并预览文案最多的帧 |
| **工作区** | 查看您 Hyperlocalise 工作区中的本地化项目、任务、QA 报告和自动化流程 |

该代理使用与你工作区中其他人相同的术语表和翻译记忆库。它本地化横幅时，会应用已批准的术语并屏蔽禁用术语，就像使用该应用的用户一样。

## 连接您的代理五月婷婷

Iris 会在应用打开时于本地运行 MCP 服务器。它只能通过固定地址从你自己的设备访问：

```text
http://127.0.0.1:4747/mcp
```

### 快捷方式

在 Iris 中，打开 **通过 MCP 连接智能体**。Iris 会检测 Mac 上已安装的智能体，并通过 **连接** 将服务器写入每个智能体的配置中。支持 Claude Code、Claude Desktop、Cursor、VS Code（Copilot）、GitHub Copilot CLI、Codex、Gemini CLI、Windsurf、Cline、Roo Code、Amp、OpenCode 等。

### 手动

如果你更愿意自行添加，请注册一个名为 `hyperlocalise-iris` 的 HTTP MCP 服务器。对于 Claude Code：

```bash
claude mcp add --scope user -t http hyperlocalise-iris http://127.0.0.1:4747/mcp
```

对于 Cursor，将其添加到 `~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "hyperlocalise-iris": {
      "url": "http://127.0.0.1:4747/mcp"
    }
  }
}
```

只能启动本地命令行服务器的客户端，可以通过通用桥接器（例如 `mcp-remote`）访问该 URL。

### 检查连接

打开 Iris 后，询问你的智能体：

```text
What screen do I have open in Hyperlocalise? Don't change anything.
```

它应描述应用屏幕上显示的内容。如果缺少工具，请确保 Iris 正在运行。服务器仅在应用打开时才会运行。

> **Iris 的 MCP 服务器与托管的 [Hyperlocalise MCP 服务器](/use-cases/localisation-for-ai-coding-agents)不同。** 托管服务器 `hyperlocalise.com/mcp`可让智能体随时随地访问您的项目、源文件和翻译键。Iris 的本地服务器则能在您的 Mac 上处理创意内容（图像、视频和语音）。许多团队会同时连接这两种服务器。

## 给智能体安排一项它能完成的任务

智能体在目标明确、范围清晰，并且有人检查结果的情况下，能发挥最佳水平。以下是一些效果不错的提示词：

**本地化横幅**

```text
Open the summer-sale banner in Iris and localise it for fr-FR, de-DE and ja-JP.
Use our glossary and keep "Pro plan" in English. Check each market for overflow and
show me the results side by side. Don't export.
```

为产品视频添加字幕

```text
Subtitle the onboarding video for es-MX and pt-BR. Split cues at natural pauses,
keep product names together, and flag any cue that overflows the caption area.
```

**发布前检查文案**

```text
Look up the glossary terms in this ad copy for de-DE, then check the German
translation against our brand guidelines. List anything that breaks a rule,
with the guideline it breaks.
```

**将一次发布转化为上线素材**

```text
Read the release notes in this PR, write a 15-second launch video script, and build it
in Iris. Then localise the on-screen copy for our five launch markets and show me
a preview of each.
```

有意思的地方就在于最后这一点。交付该功能的同一个智能体可以为每个市场制作发布素材，并使用与产品一致的术语。

## 让真人参与其中

Iris 的设计理念是由代理完成工作，再由人来批准。

- **工作过程清晰可见。**代理会在 Mac 上的 Iris 应用中工作，你可以实时查看创意内容的变化，并随时介入。
- **导出前先预览。** 智能体会先展示预览帧，并等你提出要求后再进行最终导出。
- **术语表变更需要先达成一致。** 智能体应在添加新术语前先与您确认，而不是擅自更改您的术语库。
- **审批会让工作区不断学习。** 当你批准某个市场后，获批文案会存入工作区记忆，让代理下次运行时以此为起点。

这正是每个 Hyperlocalise 工作流背后的原则，我们在[你应该构建自己的本地化代理吗？](/blog/should-you-build-your-own-localisation-agent)一文中讨论过：难点不在于生成内容，而在于保持上下文、保障质量并从人工反馈中学习。

## 开始使用

1. **[下载 Iris](/iris)** 适用于 Mac。免费下载；生成内容会使用 AI 积分，这些积分包含在每月 20 美元起的付费计划中。
2. 打开 **通过 MCP 连接智能体**，并连接你使用的智能体。
3. 请让您的代理为您本月要发布的一项资产进行本地化。

刚接触 Iris？请从[发布公告](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets)开始，或阅读[如何为各个市场本地化图片广告和社交媒体创意](/blog/how-to-localise-image-ads-and-social-creatives-for-every-market)，了解您的智能体将遵循的工作流程。
