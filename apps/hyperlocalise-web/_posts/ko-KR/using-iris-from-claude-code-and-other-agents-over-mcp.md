---
title: "MCP를 통해 Claude Code, Cursor 및 기타 에이전트에서 Iris 사용하기"
date: 2026-11-24T00:00:00.000Z
excerpt: Iris는 MCP를 통해 크리에이티브 현지화 도구 전체를 제공합니다. Claude Code, Cursor, Codex 또는 다른 에이전트를 연결해 이미지 현지화, 동영상 자막 및 더빙 작업을 맡기고, 앱에서 작업이 진행되는 모습을 확인하면서 각 시장의 콘텐츠가 용어집을 준수하는지 점검해 보세요.
category: 엔지니어링
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

코딩 에이전트는 제품 현지화를 매우 잘하게 되었습니다. 문자열을 추출하고, `react-intl`를 연동하고, 풀 리퀘스트를 열고, 복수형을 확인합니다. 저희는 [GitHub](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)용 및 [React Intl 및 ICU](/blog/react-intl-icu-localisation-workflow-extract-sync-and-review)용 워크플로에 대해 글을 썼습니다.

그러면 출시를 위해서는 출시 영상, 소셜 배너 세트, 6개 언어로 된 제품 데모가 필요한데, 에이전트는 이를 도울 수 없습니다. 크리에이티브 도구는 사람이 타임라인이나 캔버스를 클릭하며 작업하는 방식으로 만들어졌습니다. 에이전트가 호출할 수 있는 기능은 없습니다.

**[Iris](/iris)**는 작동 방식이 다릅니다. 앱의 모든 기능은 MCP 도구이기도 합니다. 에이전트를 한 번 연결하면 광고 소재를 열고, 이미지 안의 문구를 읽고, 각 시장에 맞게 현지화하고, 동영상에 자막과 더빙을 추가하고, 레이아웃을 확인하고, 용어집과 번역 메모리를 읽을 수 있습니다. 작업은 Mac의 Iris 앱에서 진행되므로, 과정을 지켜보다가 언제든 개입할 수 있습니다.

이 글에서는 실제로 어떤 모습인지, 연결하는 방법, 그리고 에이전트가 끝까지 해낼 수 있는 창의적인 현지화 작업을 맡기는 방법을 다룹니다.

## 창작 작업에서 MCP 접근이 중요한 이유

대부분의 창작 도구에는 내보내기 버튼이 있고, 일부는 "이 자막 파일을 번역해 줘"와 같은 단일 작업을 위한 API를 제공합니다. 하지만 어느 쪽도 에이전트가 전체 워크플로를 실행할 수 있게 해 주지는 않습니다.

광고 소재 하나를 현지화하는 일은 일련의 결정으로 이루어집니다. 문구를 읽고, 승인된 용어를 찾아보고, 번역하고, 다시 그리거나 타이밍을 조정하고, 각 시장을 확인하고, 문제가 생긴 부분을 수정한 뒤, 담당자에게 승인을 요청해야 합니다. 에이전트가 이 모든 과정을 책임지려면 각 단계에 모두 접근할 수 있어야 합니다.

Iris는 이 모든 것을 사용할 수 있게 합니다. 서버는 연결된 에이전트라면 누구나 전체 도구 모음을 사용할 수 있도록 제공하며, 각 도구의 입력과 출력은 JSON Schema로 설명합니다. 또한 Iris에 내장된 어시스턴트가 사용하는 것과 동일한 스킬 페이지를 제공하며, 여기에는 현지화, 동영상 편집, 모션 그래픽, 용어 관련 내용이 포함되어 있어 에이전트가 추측하는 대신 작업을 시작하기 전에 올바른 워크플로를 익힐 수 있습니다.

즉, 모든 단계를 일일이 나열하는 대신 원하는 결과물(“이 캠페인을 프랑스, 독일, 일본에 맞게 현지화해 주세요”)을 맡길 수 있습니다.

## 에이전트가 Iris를 통해 할 수 있는 일

| 영역 | 에이전트가 할 수 있는 작업 |
| --- | --- |
| **이미지** | 배너나 소셜 광고에 포함된 문구를 읽고 번역한 다음, 각 시장에 맞게 승인된 문구를 다시 디자인합니다 |
| **동영상** | 완성된 동영상의 화면 텍스트를 재구성하고 번역한 다음, 원본과 동일한 타이밍으로 자막을 생성합니다 |
| **음성** | 화자 본인의 목소리로 대사를 더빙하고, 시장별로 새로운 보이스오버를 생성하며, 입 모양을 동기화합니다 |
| **용어** | 모든 문구에 적용할 용어집 용어, 승인된 번역과 금지된 번역, 번역 메모리를 확인하세요 |
| **가이드라인** | 업로드한 브랜드 및 규정 준수 문서를 기준으로 문구를 검토하고, 근거 출처를 명시한 결과를 확인하세요 |
| **품질** | 각 시장에서 텍스트가 넘치거나, 캡션이 화면 밖으로 벗어나거나, 문자가 누락되는지 확인하고 텍스트가 가장 많은 프레임을 미리 봅니다 |
| **작업 공간** | Hyperlocalise 작업 공간의 현지화 프로젝트, 작업, QA 보고서 및 자동화를 읽습니다 |

에이전트는 작업 공간의 다른 모든 사용자와 동일한 용어집과 번역 메모리를 사용합니다. 배너를 현지화할 때도 앱을 사용하는 사람이 번역할 때와 마찬가지로 승인된 용어는 적용되고 금지된 용어는 차단됩니다.

## 에이전트 연결하기

Iris는 앱이 열려 있는 동안 MCP 서버를 로컬에서 실행합니다. 이 서버는 고정 주소를 통해 현재 컴퓨터에서만 접근할 수 있습니다:

```text
http://127.0.0.1:4747/mcp
```

### 빠른 방법

Iris에서 **MCP를 통해 에이전트 연결**을 엽니다. Iris는 Mac에 설치된 에이전트를 감지하고 **연결**을 사용해 각 에이전트의 구성 파일에 서버를 기록합니다. Claude Code, Claude Desktop, Cursor, VS Code (Copilot), GitHub Copilot CLI, Codex, Gemini CLI, Windsurf, Cline, Roo Code, Amp, OpenCode 등을 지원합니다.

### 수동으로

직접 추가하려면 HTTP MCP 서버를 `hyperlocalise-iris`(으)로 등록하세요. Claude Code의 경우:

```bash
claude mcp add --scope user -t http hyperlocalise-iris http://127.0.0.1:4747/mcp
```

Cursor의 경우 `~/.cursor/mcp.json`에 추가하세요:

```json
{
  "mcpServers": {
    "hyperlocalise-iris": {
      "url": "http://127.0.0.1:4747/mcp"
    }
  }
}
```

로컬 명령줄 서버만 실행할 수 있는 클라이언트는 `mcp-remote`와 같은 범용 브리지를 통해 URL에 접근할 수 있습니다.

### 연결을 확인하세요

Iris를 연 상태에서 에이전트에게 물어보세요:

```text
What screen do I have open in Hyperlocalise? Don't change anything.
```

앱 화면에 표시된 내용을 설명해야 합니다. 도구가 없으면 Iris가 실행 중인지 확인하세요. 서버는 앱이 열려 있는 동안에만 존재합니다.

> **Iris의 MCP 서버는 호스팅된 [Hyperlocalise MCP 서버](/use-cases/localisation-for-ai-coding-agents)와 다릅니다.** `hyperlocalise.com/mcp`의 호스팅 서버를 사용하면 어디서든 에이전트가 프로젝트, 소스 파일, 번역 키에 접근할 수 있습니다. Iris의 로컬 서버는 Mac에서 이미지, 동영상, 음성 같은 창작 작업을 추가로 지원합니다. 많은 팀이 두 서버를 모두 연결합니다.

## 에이전트가 완료할 수 있는 작업을 맡기세요.

에이전트는 명확한 결과와 정의된 범위가 있고 사람이 결과를 확인하는 시점이 정해져 있을 때 최선을 다합니다. 효과적인 프롬프트의 예:

**배너 현지화하기**

```text
Open the summer-sale banner in Iris and localise it for fr-FR, de-DE and ja-JP.
Use our glossary and keep "Pro plan" in English. Check each market for overflow and
show me the results side by side. Don't export.
```

제품 영상에 자막 추가

```text
Subtitle the onboarding video for es-MX and pt-BR. Split cues at natural pauses,
keep product names together, and flag any cue that overflows the caption area.
```

출시 전 문구 확인하기

```text
Look up the glossary terms in this ad copy for de-DE, then check the German
translation against our brand guidelines. List anything that breaks a rule,
with the guideline it breaks.
```

**릴리스를 출시 콘텐츠로 전환**

```text
Read the release notes in this PR, write a 15-second launch video script, and build it
in Iris. Then localise the on-screen copy for our five launch markets and show me
a preview of each.
```

바로 마지막 부분에서 흥미로워집니다. 기능을 출시한 바로 그 에이전트가 제품에서 사용하는 것과 동일한 용어로 모든 시장의 출시 자료를 만들 수 있습니다.

## 사람이 계속 관여하도록 하세요

Iris는 에이전트가 작업을 수행하고 사람이 승인하도록 설계되었습니다.

- **작업 과정을 확인할 수 있습니다.** 에이전트는 Mac의 Iris 앱에서 작업하므로, 작업이 진행되면서 크리에이티브가 어떻게 바뀌는지 확인하고 언제든 개입할 수 있습니다.
- **내보내기 전에 미리 보기.** 에이전트는 미리 보기 프레임을 보여주고, 요청할 때까지 최종 내보내기를 보류하도록 안내됩니다.
- **용어집 변경에는 합의가 필요합니다.** 에이전트는 용어집을 조용히 변경하는 대신 새 용어를 추가하기 전에 사용자에게 확인하도록 안내됩니다.
- **승인을 통해 워크스페이스가 학습합니다.** 시장을 승인하면 승인된 번역문이 워크스페이스 메모리에 저장되어 다음 에이전트 실행의 출발점이 됩니다.

모든 Hyperlocalise 워크플로의 바탕에도 같은 원리가 있습니다. 이 내용은 [직접 로컬라이제이션 에이전트를 구축해야 할까요?](/blog/should-you-build-your-own-localisation-agent)에서 다뤘습니다. 어려운 점은 결과물을 생성하는 것이 아니라 맥락을 유지하고, 품질을 지키며, 사람의 피드백을 통해 학습하는 것입니다.

## 시작하기

1. **[Mac용 Iris 다운로드](/iris)**. 무료이며, 생성에는 월 $20부터 시작하는 유료 플랜에 포함된 AI 크레딧이 사용됩니다.
2. **MCP를 통해 에이전트 연결**을 열고 사용하는 에이전트를 연결하세요.
3. 이번 달에 출시할 에셋 하나를 현지화해 달라고 에이전트에게 요청하세요.

Iris를 처음 사용하시나요? [출시 게시물](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets)부터 시작하거나, 에이전트가 따를 워크플로를 알아보려면 [모든 시장에 맞게 이미지 광고와 소셜 콘텐츠를 현지화하는 방법](/blog/how-to-localise-image-ads-and-social-creatives-for-every-market)을 읽어보세요.
