---
title: "Utiliser Iris depuis Claude Code, Cursor et d’autres agents via MCP"
date: 2026-11-24T00:00:00.000Z
excerpt: Iris met l’ensemble de ses outils de localisation créative à disposition via MCP. Connectez Claude Code, Cursor, Codex ou un autre agent, puis demandez-lui de localiser des images, de sous-titrer et de doubler des vidéos, et de vérifier chaque marché par rapport à votre glossaire, tout en suivant le travail dans l’application.
category: Ingénierie
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

Les agents de programmation sont devenus très efficaces pour la localisation des produits. Ils extraient les chaînes, configurent `react-intl`, ouvrent des pull requests et vérifient les pluriels. Nous avons déjà décrit ce processus pour [GitHub](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release) et pour [React Intl et ICU](/blog/react-intl-icu-localisation-workflow-extract-sync-and-review).

Ensuite, le lancement nécessite une vidéo, une série de bannières pour les réseaux sociaux et une démo du produit en six langues, mais l’agent ne peut pas aider. Les outils de création sont conçus autour d’une personne qui clique dans une timeline ou sur un canevas. L’agent n’a rien à appeler.

**[Iris](/iris)** fonctionne différemment. Chaque fonctionnalité de l’application est également un outil MCP. Connectez votre agent une seule fois et il pourra ouvrir des créations, lire le texte dans une image, l’adapter à chaque marché, sous-titrer et doubler une vidéo, vérifier les mises en page et consulter votre glossaire et votre mémoire de traduction. Le travail s’effectue dans l’application Iris sur votre Mac, vous pouvez donc le suivre et intervenir à tout moment.

Cet article explique à quoi cela ressemble, comment se connecter et comment confier à un agent une tâche de localisation créative qu’il peut réellement mener à bien.

## Pourquoi l’accès à MCP est important pour le travail créatif

La plupart des outils de création proposent un bouton d’exportation, et certains offrent une API pour une tâche précise, comme « traduire ce fichier de sous-titres ». Ni l’un ni l’autre ne permet à un agent d’exécuter l’ensemble du flux de travail.

L’adaptation locale d’une création est une chaîne de décisions : lire le texte, consulter les termes approuvés, traduire, refaire le visuel ou ajuster le timing, vérifier chaque marché, corriger ce qui ne va pas et demander à une personne de valider. Un agent ne peut prendre en charge toute cette chaîne que s’il peut accéder à chacun de ses maillons.

Iris met tout cela à disposition. Le serveur présente l’ensemble de ses outils à tout agent connecté, en décrivant leurs entrées et sorties au format JSON Schema. Il inclut également les mêmes pages de compétences que celles utilisées par l’assistant intégré d’Iris, couvrant la localisation, le montage vidéo, le motion design et la terminologie, afin que l’agent apprenne le bon processus de travail avant de commencer, au lieu de deviner.

Cela signifie que vous pouvez confier un résultat (« localiser cette campagne pour la France, l’Allemagne et le Japon ») au lieu d’énumérer chaque étape.

## Ce qu’un agent peut faire via Iris

| Domaine | Ce que l’agent peut faire |
| --- | --- |
| **Images** | Lisez le texte intégré à une bannière ou à une publicité sur les réseaux sociaux, traduisez-le et recréez le texte approuvé pour chaque marché |
| **Vidéo** | Recréez le texte affiché à l’écran d’une vidéo terminée, traduisez-le et générez des sous-titres synchronisés avec l’original |
| **Voix** | Doubler les paroles avec les voix des intervenants, générer de nouvelles voix off pour chaque marché et synchroniser les mouvements des lèvres |
| **Terminologie** | Consultez le glossaire pour trouver les termes, les traductions approuvées et interdites, ainsi que la mémoire de traduction pour tout contenu |
| **Consignes** | Vérifiez les contenus au regard des documents de marque et de conformité que vous avez importés, et fournissez des conclusions qui citent leurs sources |
| **Qualité** | Vérifiez chaque marché pour repérer les textes qui débordent, les légendes qui sortent de l’écran et les caractères manquants, puis prévisualisez les images contenant le plus de texte |
| **Espace de travail** | Consultez les projets de localisation, les tâches, les rapports d’assurance qualité et les automatisations dans votre espace de travail Hyperlocalise |

L’agent utilise les mêmes glossaires et la même mémoire de traduction que tous les autres membres de votre espace de travail. Lorsqu’il localise une bannière, les termes approuvés sont appliqués et les termes interdits sont bloqués, comme ce serait le cas pour une personne utilisant l’application.

## Connectez votre agent

Iris exécute son serveur MCP localement lorsque l’application est ouverte. Il est accessible uniquement depuis votre propre machine, à une adresse fixe :

```text
http://127.0.0.1:4747/mcp
```

### La méthode rapide

Dans Iris, ouvrez **Connecter des agents via MCP**. Iris détecte les agents installés sur votre Mac et ajoute le serveur à la configuration de chacun en cliquant sur **Connecter**. Cette fonctionnalité prend en charge Claude Code, Claude Desktop, Cursor, VS Code (Copilot), GitHub Copilot CLI, Codex, Gemini CLI, Windsurf, Cline, Roo Code, Amp, OpenCode et plusieurs autres.

### À la main

Si vous préférez l’ajouter vous-même, enregistrez un serveur MCP HTTP nommé `hyperlocalise-iris`. Pour Claude Code :

```bash
claude mcp add --scope user -t http hyperlocalise-iris http://127.0.0.1:4747/mcp
```

Pour Cursor, ajoutez-le à `~/.cursor/mcp.json` :

```json
{
  "mcpServers": {
    "hyperlocalise-iris": {
      "url": "http://127.0.0.1:4747/mcp"
    }
  }
}
```

Les clients qui ne peuvent lancer que des serveurs en ligne de commande locaux peuvent accéder à l’URL via un pont générique tel que `mcp-remote`.

### Vérifiez la connexion

Une fois Iris ouvert, demandez à votre agent :

```text
What screen do I have open in Hyperlocalise? Don't change anything.
```

Cela devrait décrire ce qui s’affiche à l’écran dans l’application. Si les outils ne sont pas disponibles, assurez-vous qu’Iris est en cours d’exécution. Le serveur n’existe que lorsque l’application est ouverte.

> **Le serveur MCP d’Iris est différent du [serveur MCP Hyperlocalise hébergé](/use-cases/localisation-for-ai-coding-agents).** Le serveur hébergé à `hyperlocalise.com/mcp`permet aux agents d’accéder à vos projets, fichiers source et clés de traduction depuis n’importe où. Le serveur local d’Iris ajoute les contenus créatifs (images, vidéos et voix) sur votre Mac. De nombreuses équipes connectent les deux.

## Donnez à l’agent une tâche qu’il peut mener à bien.

Les agents donnent le meilleur d’eux-mêmes lorsqu’ils disposent d’un résultat clair, d’un périmètre défini et d’un point de contrôle humain du résultat. Voici quelques prompts efficaces :

**Localiser une bannière**

```text
Open the summer-sale banner in Iris and localise it for fr-FR, de-DE and ja-JP.
Use our glossary and keep "Pro plan" in English. Check each market for overflow and
show me the results side by side. Don't export.
```

**Sous-titrez une vidéo de produit**

```text
Subtitle the onboarding video for es-MX and pt-BR. Split cues at natural pauses,
keep product names together, and flag any cue that overflows the caption area.
```

**Vérifiez le texte avant sa publication**

```text
Look up the glossary terms in this ad copy for de-DE, then check the German
translation against our brand guidelines. List anything that breaks a rule,
with the guideline it breaks.
```

**Transformez une version en supports de lancement**

```text
Read the release notes in this PR, write a 15-second launch video script, and build it
in Iris. Then localise the on-screen copy for our five launch markets and show me
a preview of each.
```

C’est sur ce dernier point que ça devient intéressant. Le même agent qui a lancé la fonctionnalité peut produire les éléments de lancement pour chaque marché, en utilisant la même terminologie que le produit.

## Tenez une personne informée

Iris est conçu pour que l’agent fasse le travail et qu’une personne l’approuve.

- **Le travail est visible.** L’agent travaille dans l’app Iris sur votre Mac. Vous pouvez donc voir les créations évoluer au fur et à mesure et intervenir à tout moment.
- **Des aperçus avant les exports.** Les agents sont invités à afficher des images d’aperçu et à ne lancer l’export final que lorsque vous le demandez.
- **Toute modification du glossaire doit être approuvée.** Les agents sont invités à confirmer auprès de vous tout nouveau terme du glossaire avant de l’ajouter, plutôt que de modifier discrètement votre base terminologique.
- **Les approbations enrichissent la mémoire de l’espace de travail.** Quand vous approuvez un marché, le contenu approuvé est ajouté à la mémoire de l’espace de travail, afin que la prochaine exécution de l’agent parte de cette base.

C’est le même principe qui sous-tend chaque flux de travail Hyperlocalise, dont nous avons parlé dans [Devriez-vous créer votre propre agent de localisation ?](/blog/should-you-build-your-own-localisation-agent) : la partie difficile n’est pas de générer du contenu, mais de préserver le contexte, de garantir la qualité et de tirer des enseignements des retours des utilisateurs.

## Commencer

1. **[Télécharger Iris](/iris)** pour Mac. C’est gratuit ; la génération utilise le crédit IA inclus dans les forfaits payants à partir de 20 $ par mois.
2. Ouvrez **Connecter des agents via MCP** et connectez les agents que vous utilisez.
3. Demandez à votre agent de localiser une ressource que vous publierez ce mois-ci.

Vous découvrez Iris ? Commencez par l’[article de lancement](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets), ou lisez [Comment localiser les publicités illustrées et les créations pour les réseaux sociaux sur chaque marché](/blog/how-to-localise-image-ads-and-social-creatives-for-every-market) pour connaître le processus que votre agent suivra.
