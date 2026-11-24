---
title: "MCP経由でClaude Code、Cursor、その他のエージェントからIrisを利用する方法"
date: 2026-11-24T00:00:00.000Z
excerpt: Irisでは、クリエイティブのローカライズに必要なすべてのツールをMCP経由で利用できます。Claude Code、Cursor、Codexなどのエージェントを接続して、画像のローカライズ、動画の字幕・吹き替え、各市場向けの用語集との照合を依頼できます。作業の進行状況はアプリ内で確認できます。
category: エンジニアリング
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

コーディングエージェントは、プロダクトのローカライズをとても得意になりました。文字列を抽出し、`react-intl`を組み込み、プルリクエストを作成して、複数形を確認します。私たちは、[GitHub](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)向け、および[React Intl and ICU](/blog/react-intl-icu-localisation-workflow-extract-sync-and-review)向けのワークフローについて書いてきました。

そしてそのリリースには、ローンチ動画、SNSバナー一式、6言語での製品デモが必要ですが、エージェントには対応できません。クリエイティブツールは、人がタイムラインやキャンバスをクリックして操作することを前提に作られています。エージェントが呼び出せるものは何もありません。

**[Iris](/iris)**は、これまでとは違う仕組みです。アプリのすべての機能がMCPツールとしても使えます。エージェントを一度接続すれば、クリエイティブを開く、画像内のコピーを読み取る、各市場向けにローカライズする、動画に字幕や吹き替えを追加する、レイアウトを確認する、用語集や翻訳メモリを参照するといった作業を任せられます。作業はMac上のIrisアプリで行われるので、進行状況を確認しながら、いつでも介入できます。

この記事では、それがどのようなものか、接続方法、そしてエージェントに最後まで完了できるクリエイティブなローカライズ作業を依頼する方法を紹介します。

## クリエイティブな作業でMCPアクセスが重要な理由

ほとんどのクリエイティブツールにはエクスポートボタンがあり、「この字幕ファイルを翻訳する」といった単一の作業向けにAPIを提供しているものもあります。しかし、どちらもエージェントにワークフロー全体を実行させることはできません。

1つの広告クリエイティブをローカライズするには、一連の判断が必要です。コピーを読み、承認済み用語を調べ、翻訳し、デザインをやり直すかタイミングを調整し、各市場で確認し、問題を修正して、人に承認を依頼します。エージェントがこの一連の作業を担えるのは、そのすべての工程にアクセスできる場合に限られます。

Irisはそのすべてを利用できるようにします。サーバーは、接続されたエージェントにすべてのツールを公開し、各ツールの入力と出力をJSON Schemaで記述します。また、Irisの組み込みアシスタントが使用するのと同じスキルページも提供します。そこでは、ローカライズ、動画編集、モーショングラフィックス、用語について解説されているため、エージェントは推測に頼らず、作業を始める前に適切なワークフローを学べます。

つまり、すべての手順を列挙する代わりに、成果を任せることができます（「このキャンペーンをフランス、ドイツ、日本向けにローカライズして」）。

## Irisを通じてエージェントができること

| 項目 | エージェントにできること |
| --- | --- |
| **画像** | バナーやSNS広告に埋め込まれたテキストを読み取り、翻訳して、各市場向けに承認済みのテキストを反映した画像を作成する |
| **動画** | 完成した動画内のテキストを再現して翻訳し、元の動画に合わせたタイミングで字幕を生成します |
| **音声** | 話者本人の声で吹き替え、各市場向けに新しい音声を生成し、口の動きを同期 |
| **用語** | 文言に関する用語集、承認済みおよび禁止されている訳語、翻訳メモリを確認する |
| **ガイドライン** | アップロードしたブランドおよびコンプライアンス文書に照らしてコピーを確認し、出典を明記した結果を提示します |
| **品質** | 各市場で、テキストのはみ出し、画面からはみ出す字幕、文字の欠落がないか確認し、テキスト量が最も多いフレームをプレビューする |
| **ワークスペース** | Hyperlocalise ワークスペース内のローカライズプロジェクト、ジョブ、QAレポート、自動化を閲覧できます |

エージェントは、ワークスペース内のほかのユーザーと同じ用語集と翻訳メモリを使用します。バナーをローカライズする際は、アプリを使うユーザーの場合と同様に、承認済みの用語が適用され、使用禁止の用語はブロックされます。

## エージェントを接続する

Iris はアプリを開いている間、MCP サーバーをローカルで実行します。固定アドレスで、自分のマシンからのみアクセスできます：

```text
http://127.0.0.1:4747/mcp
```

### 手早くできる方法

Irisで **MCP経由でエージェントを接続** を開きます。IrisがMacにインストールされているエージェントを検出し、**接続** をクリックすると、それぞれの設定にサーバーを書き込みます。Claude Code、Claude Desktop、Cursor、VS Code（Copilot）、GitHub Copilot CLI、Codex、Gemini CLI、Windsurf、Cline、Roo Code、Amp、OpenCodeなどに対応しています。

### 手動で

自分で追加する場合は、HTTP MCP サーバー「`hyperlocalise-iris`」を登録してください。Claude Code の場合：

```bash
claude mcp add --scope user -t http hyperlocalise-iris http://127.0.0.1:4747/mcp
```

Cursor の場合は、`~/.cursor/mcp.json`に追加します：

```json
{
  "mcpServers": {
    "hyperlocalise-iris": {
      "url": "http://127.0.0.1:4747/mcp"
    }
  }
}
```

ローカルのコマンドラインサーバーしか起動できないクライアントは、`mcp-remote`のような汎用ブリッジ経由でURLにアクセスできます。

### 接続を確認してください

Irisを開いた状態で、エージェントに尋ねます：

```text
What screen do I have open in Hyperlocalise? Don't change anything.
```

アプリの画面に表示されている内容を説明してください。ツールが見つからない場合は、Irisが実行中であることを確認してください。サーバーはアプリが開いている間だけ存在します。

> **IrisのMCPサーバーは、ホスト型の[Hyperlocalise MCPサーバー](/use-cases/localisation-for-ai-coding-agents)とは異なります。** `hyperlocalise.com/mcp`にあるホスト型サーバーは、どこからでもエージェントにプロジェクト、ソースファイル、翻訳キーを提供します。Irisのローカルサーバーは、Mac上のクリエイティブ素材（画像、動画、音声）を追加します。多くのチームが両方を接続しています。

## エージェントが完了できるタスクを与える

エージェントは、明確なゴールと作業範囲があり、人が結果を確認するタイミングが決まっていると、最も力を発揮します。うまく機能するプロンプトの例：

バナーをローカライズする

```text
Open the summer-sale banner in Iris and localise it for fr-FR, de-DE and ja-JP.
Use our glossary and keep "Pro plan" in English. Check each market for overflow and
show me the results side by side. Don't export.
```

**製品紹介動画に字幕を付ける**

```text
Subtitle the onboarding video for es-MX and pt-BR. Split cues at natural pauses,
keep product names together, and flag any cue that overflows the caption area.
```

**公開前にコピーを確認**

```text
Look up the glossary terms in this ad copy for de-DE, then check the German
translation against our brand guidelines. List anything that breaks a rule,
with the guideline it breaks.
```

**リリースをローンチ素材に変える**

```text
Read the release notes in this PR, write a 15-second launch video script, and build it
in Iris. Then localise the on-screen copy for our five launch markets and show me
a preview of each.
```

ここからが面白いところです。この機能をリリースしたエージェントが、製品で使われている用語を使って、すべての市場向けのローンチ素材を作成できます。

## 人間が常に関与するようにする

Irisは、エージェントが作業を行い、人が承認するように設計されています。

- **作業の様子が見えます。** エージェントはMacのIrisアプリで作業するため、進行に合わせてクリエイティブが変わっていく様子を確認でき、いつでも介入できます。
- **書き出し前にプレビュー。** エージェントには、プレビュー画面を表示し、あなたから依頼があるまで最終版を書き出さないよう案内されています。
- **用語集の変更には合意が必要です。**エージェントは、用語ベースを黙って変更するのではなく、新しい用語を追加する前にあなたに確認するよう案内されています。
- **承認によってワークスペースが学習します。**市場を承認すると、承認済みの訳文がワークスペースのメモリに保存され、次回のエージェント実行時にその訳文が使われます。

これは、あらゆる Hyperlocalise ワークフローの根底にある同じ原則です。詳しくは[独自のローカライゼーションエージェントを構築すべきか？](/blog/should-you-build-your-own-localisation-agent)で説明しました。難しいのは出力を生成することではなく、コンテキストを維持し、品質を守り、人間からのフィードバックを学習に活かすことです。

## 始める

1. **[Irisをダウンロード](/iris)**（Mac用）。無料でご利用いただけます。生成には、月額20ドルからの有料プランに含まれるAIクレジットを使用します。
2. **MCP 経由でエージェントを接続**を開き、使用するエージェントを接続します。
3. 今月出荷するアセットを1つ、エージェントにローカライズしてもらいましょう。

Irisを初めてお使いですか？[ローンチ投稿](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets)から始めるか、[画像広告やソーシャルクリエイティブを各市場向けにローカライズする方法](/blog/how-to-localise-image-ads-and-social-creatives-for-every-market)を読んで、エージェントが従うワークフローをご確認ください。
