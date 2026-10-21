---
title: Qu’est-ce qu’un audit de localisation de site web ?
date: 2026-08-13T00:00:00.000Z
excerpt: La traduction d’un site web n’est que le début. Un audit de localisation évalue la mise en œuvre technique, la qualité linguistique, le contexte produit et l’expérience visuelle — et vous indique quoi corriger en priorité.
category: Produit
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

Traduire un site web n’est que le début de la localisation.

Un site peut proposer des pages traduites tout en offrant une mauvaise expérience aux internautes internationaux. Une balise `hreflang` manquante peut nuire à la visibilité. Un appel à l’action non traduit peut désorienter les visiteurs. Une traduction techniquement correcte peut malgré tout employer le mauvais terme pour un produit. Une chaîne plus longue en allemand peut faire déborder un bouton sur mobile.

La question à laquelle répond un audit de localisation n’est pas « combien de chaînes sont traduites ? ». C’est :

> **Votre site web donne-t-il vraiment l’impression d’avoir été conçu pour les utilisateurs de cette région ?**

L’audit de localisation Hyperlocalise examine un site web selon quatre dimensions — technique, linguistique, contextuelle et visuelle — et attribue un score de localisation unique sur 100, ainsi que les problèmes à corriger en priorité.

## Ce que couvre un audit de localisation

Un audit de localisation n'est pas un outil de vérification des traductions, et ce n'est pas un audit générique de site web.

Les outils de performance, d’accessibilité et de SEO évaluent la mise en œuvre. L’assurance qualité des traductions porte sur l’exactitude, la grammaire et la fluidité. Aucun des deux ne donne une vision complète d’un site web multilingue.

Un audit de localisation combine les deux points de vue :

| Audit            | Poids | Ce à quoi cela répond                                      |
| ---------------- | -----: | ----------------------------------------------------- |
| Audit technique  |    25% | La localisation est-elle correctement mise en œuvre ?                |
| Audit linguistique |    25% | Les traductions sont-elles exactes, naturelles et cohérentes ?   |
| Audit contextuel |    25% | La localisation est-elle cohérente avec le contexte de votre produit ? |
| Audit visuel     |    25% | L’interface localisée s’affiche-t-elle et fonctionne-t-elle correctement ?      |

Vous obtenez un score global, un score pour chaque domaine et des constats exploitables indiquant leur gravité, les éléments probants et le niveau de confiance.

## Comment interpréter le score

Le score global est un indicateur de l’état de santé, et non un remplacement des conclusions détaillées. Examinez toujours en premier les problèmes les plus graves.

| Score  | Évaluation        | Ce que cela signifie                                                 |
| ------ | ----------------- | -------------------------------------------------------------------- |
| 90–100 | Excellent         | L’expérience localisée est en très bonne forme                          |
| 75–89  | Bon               | Le site web est généralement bien localisé, avec quelques problèmes à corriger |
| 50–74  | À améliorer | Les utilisateurs peuvent rencontrer des problèmes de localisation notables                 |
| 25–49  | Médiocre          | Des lacunes importantes en matière de localisation nuisent à l’expérience |
| 0–24   | Critique          | L’expérience localisée présente des problèmes majeurs qui devraient être corrigés |

Un site web peut avoir un bon score global tout en présentant un problème critique lors du paiement, dans le routage ou sur une page à fort trafic. Le score vous indique où chercher. Les constats vous indiquent quoi corriger.

## Audit technique : la localisation est-elle correctement mise en œuvre ?

L’audit technique examine l’infrastructure d’un site web multilingue : sa découvrabilité, son routage, son formatage, son accessibilité et la possibilité pour les utilisateurs et les moteurs de recherche d’accéder à la bonne version linguistique et régionale.

### Détection de la langue et routage

Les pages doivent déclarer correctement leur langue et leur locale, par exemple `<html lang="fr-FR">`. L’audit recherche les déclarations de langue manquantes, les codes de langue ou de région incorrects, les incohérences entre la locale et le contenu, ainsi que les identifiants incohérents.

Il vérifie également si les pages localisées utilisent une structure d’URL cohérente :

```text
/en/pricing
/fr/pricing
/de/pricing
```

Les problèmes courants incluent des routes localisées manquantes, des URL de locale défectueuses, des redirections incorrectes, un basculement inattendu vers la locale par défaut et des problèmes de persistance de la locale.

### Sélecteur de langue et `hreflang`

Les visiteurs doivent pouvoir changer de langue sans perdre la page qu’ils consultent. En passant de `/fr/pricing`, ils doivent arriver sur `/de/pricing`, et non sur la page d’accueil allemande.

L’audit vérifie également les relations entre les versions localisées d’une page : les `hreflang` manquants, les codes de langue ou de région incorrects, les URL invalides, les références réciproques ou autoréférences manquantes, les `x-default` incorrects et les conflits avec les URL canoniques.

Les pages localisées devraient généralement avoir une URL canonique pointant vers elles-mêmes. Une page de tarifs en français dont l’URL canonique pointe vers la version anglaise est une erreur SEO courante :

```text
/fr/pricing
canonical → /en/pricing
```

### Métadonnées, plans de site et données structurées

Les métadonnées importantes de la page doivent être localisées : les titres, les méta-descriptions, les titres et descriptions Open Graph, `og:locale` et les métadonnées de partage sur les réseaux sociaux.

L’audit vérifie également si les URL localisées figurent dans le plan du site et fonctionnent correctement et, le cas échéant, si les données structurées telles que Product, WebPage, Breadcrumbs, FAQ, Organization, Article et LocalBusiness sont localisées.

### Formatage international et accessibilité

Les valeurs sensibles à la langue doivent correspondre à la langue :

```text
US:  $1,234.56
DE:  1.234,56 €
FR:  1 234,56 €
```

Cela inclut les dates, les heures, les nombres, les devises, les unités de mesure et les fuseaux horaires.

La localisation en matière d’accessibilité couvre `lang`, `aria-label`, les noms accessibles, les libellés de formulaire, les messages de validation et le texte `alt` des images.

## Audit linguistique : la langue est-elle correcte, naturelle et cohérente ?

L’audit linguistique évalue la langue utilisée sur la page. Il ne se limite pas à vérifier si le texte a été traduit. Il vérifie si la traduction transmet le sens voulu et paraît naturelle aux utilisateurs de la langue cible.

### Exhaustivité et précision

Le contenu non traduit est signalé, tandis que les noms de marque, les noms de produits, les URL, les adresses e-mail, le code, les noms propres et la terminologie anglaise utilisée intentionnellement sont considérés comme des exceptions attendues.

Une page en français qui dit :

```text
Bienvenue sur notre site.

Start your free trial
```

serait signalé pour l’appel à l’action non traduit.

Les vérifications d’exactitude recherchent les omissions ou les ajouts de sens, les interprétations erronées, les nombres incorrects, les actions incorrectes du produit et la terminologie incorrecte.

### Fluidité, terminologie et voix de marque

Une traduction peut être techniquement correcte tout en sonnant peu naturelle. L’audit recherche les formulations maladroites, les tournures peu naturelles, les problèmes de grammaire et d’orthographe, les artefacts de traduction automatique et le non-respect des conventions rédactionnelles propres à la région.

Il identifie également les concepts traduits différemment sur l’ensemble du site :

```text
Workspace

Page 1 → Espace de travail
Page 2 → Workspace
Page 3 → Espace Workspace
```

Espace de travail

La voix de marque est évaluée au regard du ton recherché — professionnel, convivial, concis, technique, conversationnel, haut de gamme ou ludique — ainsi que de la grammaire et du style propres à la région, notamment les majuscules, la ponctuation, le niveau de langue et les accords.

## Audit contextuel : la traduction est-elle correcte pour ce produit ?

Le contexte est l’un des aspects de la localisation les plus faciles à négliger.

Une traduction peut être grammaticalement parfaite et néanmoins ne pas convenir à l’endroit où elle apparaît. Le mot « Annuler » peut signifier fermer une boîte de dialogue, résilier un abonnement, annuler une commande ou interrompre une opération. La bonne traduction dépend du contexte du produit.

L’audit contextuel utilise le contexte de la page, de l’interface utilisateur, de la terminologie et du produit pour évaluer si les traductions sont pertinentes dans leur contexte d’utilisation.

### Interface utilisateur, produit et intention de l’appel à l’action

L’audit tient compte de l’emplacement d’une chaîne — bouton, navigation, formulaire, fenêtre modale, infobulle, titre, message d’erreur, notification, menu ou paiement — et évalue le langage en fonction des concepts du produit présents sur la page : noms de fonctionnalités, offres, paramètres, notions liées au compte, actions du workflow et terminologie du produit.

Les appels à l’action méritent une attention particulière. « Commencer l’essai gratuit », « Réserver maintenant », « Enregistrer les modifications », « Supprimer le compte » et « Mettre à niveau » doivent exprimer l’action souhaitée dans la langue cible, et non une formulation générique.

### Glossaire, mémoire de traduction et culture

Si un glossaire ou une terminologie approuvée est disponible, les traductions peuvent être vérifiées par rapport aux termes privilégiés et interdits, aux noms de produits et à la terminologie de marque.

Lorsque des traductions approuvées précédemment existent, l’audit peut identifier les écarts par rapport à la mémoire de traduction.

L’adaptation culturelle porte sur les devises, les dates, les unités de mesure, les adresses, les numéros de téléphone, les modes de paiement, les exemples locaux, les références culturelles et les expressions idiomatiques. Toute différence n’est pas nécessairement une erreur. Le cas échéant, les constats culturels sont présentés sous forme de recommandations ou de points à examiner.

Le contexte du public est également important. Un langage adapté à un produit de voyage grand public peut ne pas convenir à un outil de développement d’entreprise, à un produit financier ou au secteur de la santé.

## Audit visuel : le site web localisé fonctionne-t-il vraiment ?

Les langues modifient la taille, la forme et la mise en page du contenu. L’audit visuel évalue les pages rendues afin de repérer les problèmes qui ne peuvent pas être détectés à partir des chaînes source seules.

### Débordement, mise en page et expansion du texte

En anglais, « Start free trial » devient en allemand « Kostenlose Testversion starten ». Si la version allemande ne tient plus sur le bouton, l’audit le signale.

Parmi les autres problèmes visuels figurent le texte coupé ou tronqué, les points de suspension inattendus, les débordements de la navigation et des tableaux, les éléments qui se chevauchent, les grilles déformées, le contenu mal aligné, les débordements des fenêtres modales, les retours à la ligne inattendus et les espacements incorrects.

Les pages localisées peuvent également se comporter différemment selon les largeurs d’écran mobiles, tablettes et ordinateurs. L’audit peut évaluer les mises en page clés à chacun de ces points de rupture.

### RTL, polices et ressources localisées

Pour les langues s’écrivant de droite à gauche, comme l’arabe et l’hébreu, l’audit vérifie le sens du texte, l’inversion de la mise en page, la navigation, l’alignement, les icônes, les formulaires, les barres latérales et les fenêtres modales.

La typographie doit prendre en charge les systèmes d’écriture cibles, notamment l’arabe, le chinois, le japonais, le coréen, le thaï, le vietnamien et le cyrillique. Les glyphes manquants, les polices de remplacement inattendues, les incohérences typographiques, une hauteur de ligne incorrecte et les problèmes de rendu sont signalés.

Les ressources visuelles propres à chaque langue comptent aussi. Une page en français qui contient une capture d’écran d’une interface en anglais présente une lacune de localisation, même si tous les textes de la page sont traduits.

L’audit vérifie également si la localisation modifie la hiérarchie visuelle : titres trop longs, appels à l’action qui passent à la ligne, texte important qui perd de son emphase, cartes de hauteurs incohérentes et navigation difficile à parcourir d’un coup d’œil.

## Comment les résultats sont hiérarchisés

Tous les problèmes n’ont pas le même impact. Chaque constat se voit attribuer un niveau de gravité afin que les équipes puissent corriger les problèmes prioritaires en premier.

Les problèmes **critiques** peuvent gravement nuire à l’expérience localisée : une locale indisponible, une page entièrement non traduite, la mauvaise locale proposée, une devise incorrecte au paiement, un problème majeur de mise en page RTL ou une route localisée inaccessible.

**Élevés** : les problèmes affectent l’ergonomie, le SEO ou la qualité de la traduction : absence de `hreflang`, appel à l’action principal non traduit, erreur de traduction majeure, navigation défectueuse, texte important tronqué ou terminologie produit incorrecte.

Les problèmes **modérés** sont perceptibles et doivent être corrigés : incohérences terminologiques, métadonnées non localisées, contenu secondaire non traduit, léger débordement visuel ou texte alternatif manquant.

Les problèmes de niveau **faible** sont des améliorations de qualité : une formulation légèrement peu naturelle, une petite incohérence de style, des problèmes mineurs de mise en forme ou des améliorations facultatives des métadonnées.

Les éléments **Info** sont des recommandations ou des opportunités qui ne constituent pas nécessairement des erreurs.

Les résultats générés par l’IA incluent également un niveau de confiance, le cas échéant. Les résultats présentant un niveau de confiance élevé sont plus susceptibles d’être objectifs ou déterministes — par exemple, l’absence de `hreflang`. Les résultats présentant un niveau de confiance plus faible, comme un éventuel problème d’adaptation culturelle, doivent être considérés comme des recommandations à examiner plutôt que comme des erreurs avérées.

## Comment fonctionne l’audit

L’audit commence à partir de l’URL d’un site web, détecte les langues disponibles, explore les pages localisées, extrait le contenu et les métadonnées, effectue le rendu des pages, puis exécute les quatre moteurs d’analyse avant de calculer les scores et de générer un rapport.

La détection des langues s’appuie sur des signaux tels que la structure des URL, `hreflang`, les plans de site, les sélecteurs de langue, les métadonnées HTML et les domaines ou sous-domaines.

Le rendu de la page réelle est important. Les problèmes visuels causés par le contenu traduit n’existent souvent pas dans le code source HTML. Le rapport comprend le score global de localisation, les scores de quatre modules, les problèmes regroupés par gravité, les pages concernées, les éléments probants, le niveau de confiance et les actions recommandées.

## Des constats à la qualité en continu

Un audit ne devrait pas se limiter à vous dire ce qui ne va pas.

Lorsqu’Hyperlocalise détecte un problème, le constat peut servir de point de départ pour le résoudre : le contenu non traduit peut être traduit, les incohérences terminologiques peuvent être comparées aux termes approuvés, les violations du glossaire peuvent être corrigées, les métadonnées manquantes peuvent être localisées et les problèmes de débordement visuel peuvent être résolus dans le texte ou la mise en page.

Cela crée un flux de travail continu : auditer, repérer les problèmes, les corriger, réauditer, surveiller et détecter les régressions.

La localisation n’est pas un projet ponctuel. Chaque nouvelle fonctionnalité, page, version ou traduction peut introduire de nouveaux problèmes : de nouvelles chaînes en anglais, des traductions manquantes, des violations du glossaire, des éléments `hreflang` défectueux, des métadonnées incorrectes, des débordements visuels ou des régressions de routage.

Pour les équipes qui livrent en continu, l’objectif est de passer d’un audit ponctuel de la localisation à une surveillance continue de sa qualité.

C’est le même changement que celui décrit dans [What Is Translation Intelligence?](/blog/what-is-translation-intelligence) : le résultat de la traduction n’est plus le goulot d’étranglement. Ce sont le discernement, le contexte et la détection des régressions.

## Foire aux questions

### Est-ce un outil de vérification des traductions ?

Pas exactement. Un vérificateur de traduction se concentre principalement sur la qualité linguistique. L’audit de localisation Hyperlocalise évalue l’ensemble du site web localisé, notamment sa mise en œuvre technique, son référencement, le contexte du produit et son interface visuelle.

### Un site traduit obtient-il automatiquement un bon score ?

Non. Un site web peut proposer un contenu entièrement traduit tout en présentant des problèmes liés à `hreflang`, au routage par locale, à la devise, au formatage des dates, à la terminologie, au contexte des produits, à la mise en page visuelle et à l’accessibilité. Le score évalue l’expérience dans son ensemble.

### L’audit peut-il détecter du contenu non traduit ?

Oui. Il analyse les pages localisées afin d’identifier le contenu qui semble être resté dans la langue source, tout en tenant compte des noms de marque, des URL, des noms de produits et d’autres contenus susceptibles de rester inchangés intentionnellement.

### Peut-il détecter les mauvaises traductions ?

L’audit peut identifier des problèmes potentiels liés au sens, à la fluidité, à la terminologie, à la grammaire et à la cohérence. Les problèmes détectés par l’IA sont accompagnés d’un niveau de confiance afin que les équipes puissent distinguer les constats fiables des éléments pouvant nécessiter une vérification humaine.

### Peut-il détecter des problèmes visuels ?

Oui. L’audit visuel évalue les pages localisées telles qu’elles sont rendues et peut identifier les débordements de texte, les mises en page cassées, les problèmes d’affichage adaptatif, les problèmes d’écriture de droite à gauche (RTL) et les problèmes liés aux ressources localisées.

### Un faible score signifie-t-il que le site Web est inutilisable ?

Pas nécessairement. Le score est un indicateur de santé. Examinez toujours les constats individuels et leur gravité. Un site Web peut avoir un bon score global tout en présentant un problème critique qui affecte une page importante ou un parcours utilisateur.

## Détectez les problèmes de localisation avant vos utilisateurs.

Les audits de sites web traditionnels évaluent les performances, l’accessibilité et le référencement naturel. Le contrôle qualité des traductions évalue l’exactitude, la grammaire et la fluidité. Un audit de localisation pose quatre questions à la fois :

- La localisation est-elle correctement mise en œuvre ?
- La traduction est-elle correcte et naturelle ?
- Est-ce approprié pour le produit, le public et la situation ?
- L’expérience localisée fonctionne-t-elle réellement pour les utilisateurs ?

Ensemble, ces réponses offrent une vision plus complète de la santé de la localisation.

Si vous développez des produits pour plusieurs marchés, mieux vaut avoir cette vision avant que les clients ne découvrent eux-mêmes les lacunes. [Demandez un audit de localisation gratuit](/localisation-audit) ou découvrez-en davantage sur la [localisation tenant compte du contexte](/blog/ai-translation-is-not-enough-context-aware-localisation).
