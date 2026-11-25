---
title: Comment localiser les publicités illustrées et les créations pour les réseaux sociaux sur chaque marché
date: 2026-11-24T00:00:00.000Z
excerpt: Traduire la légende est facile. C’est le texte intégré à la bannière qui ralentit les campagnes déployées sur plusieurs marchés. Ce guide explique comment localiser les publicités illustrées, les créations pour les réseaux sociaux et les photos de produits afin que chaque version destinée à un marché donné semble avoir été créée localement.
category: Produit
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

Votre campagne sera lancée sur huit marchés lundi. Les textes publicitaires ont été traduits, les légendes sont prêtes et les pages de destination sont en ligne.

Puis quelqu’un pose des questions sur les bannières.

Le titre, l’offre et l’appel à l’action font tous partie de l’image. Chaque marché a besoin de sa propre version : le graphiste rouvre le fichier source, colle les traductions, constate que le titre allemand ne tient pas, le réduit, découvre que la police japonaise manque, puis recommence pour chaque format et chaque marché. Quarante visuels plus tard, la campagne est lancée jeudi, et un marché affiche toujours le prix du trimestre dernier.

Ce guide explique comment localiser correctement les publicités illustrées et les créations pour les réseaux sociaux : ce qu’il faut décider avant de commencer, comment gérer le texte intégré à l’image et comment vérifier chaque marché avant leur diffusion. Pour les exemples pratiques, nous utiliserons **[Iris](/iris)**, l’app Mac Hyperlocalise conçue pour les ressources multilingues, mais cette liste de vérification s’applique quels que soient les outils que vous utilisez.

## Pourquoi les publicités avec image sont l’élément le plus difficile à localiser dans une campagne

Le texte d’un produit ou d’un site web se trouve dans des chaînes. Vous pouvez l’extraire, le traduire et le réintégrer. Le texte d’une image ne fonctionne pas de cette façon.

- **Le texte fait partie de l’image.** À moins que quelqu’un ait conservé un fichier source avec calques pour chaque taille, il n’y a rien à remplacer.
- **Chaque marché multiplie le travail.** Un concept × quatre formats × huit marchés, soit 32 contenus, et chaque modification du texte remet le compteur à zéro.
- **L’espace est fixe.** Un titre qui tient en anglais peut être 30 % plus long en allemand, et l’encadré ne s’agrandit pas.
- **Les systèmes d’écriture se comportent différemment.** Le japonais et le thaï passent à la ligne sans espaces entre les mots. L’arabe se lit de droite à gauche. De nombreuses polices de marque ne comportent aucun glyphe pour ces langues.
- **La publicité est soumise à des règles.** Les conditions des offres, les prix, les mentions légales et les allégations interdites varient selon les marchés. Une erreur dans une publicité payante est publique et coûteuse.

Le problème n’est donc pas vraiment la traduction. Il s’agit de recréer le contenu pour chaque marché tout en préservant le design, les termes de marque et les mentions légales.

## Étape 1 : choisissez les marchés, pas seulement les langues.

Commencez par une liste de marchés indiqués sous forme de codes régionaux : `fr-FR`, `de-DE`, `ja-JP`, `pt-BR`, `ar-AE`.

La langue seule ne suffit pas. L’espagnol d’Espagne et celui du Mexique diffèrent par le vocabulaire, le ton et le niveau de formalité. Le portugais du Brésil et celui du Portugal présentent des différences plus importantes que la plupart des équipes ne le pensent. Un prix affiché comme `€49` en France s’écrit `49 €`. Une offre « Black Friday » peut ne rien signifier, ou renvoyer aux mauvaises dates, sur certains marchés.

Pour chaque marché, notez :

- **Registre.** Adresse formelle ou informelle (`tu`/`vous`, `du`/`Sie`).
- **Offre et tarification.** Devise, format et applicabilité de l’offre.
- **Textes juridiques.** Avertissements, conditions et tout ce qu’exigent les autorités de réglementation.
- **Traduire ou réécrire.** Un jeu de mots ou une référence culturelle peut nécessiter une nouvelle formulation plutôt qu’une traduction. C’est de la [transcréation](/blog/hyperlocalisation-why-global-growth-needs-more-than-translation), et c’est une décision à prendre dès le départ, pas à découvrir lors de la relecture.

## Étape 2 : Définissez votre terminologie avant toute traduction

La plupart des erreurs de localisation des publicités sont des erreurs de terminologie, et non de grammaire : le nom du produit est traduit alors qu’il devrait rester en anglais, la marque déposée d’un concurrent est utilisée pour désigner une fonctionnalité générique, ou une allégation supprimée par le service juridique au trimestre dernier réapparaît sur un marché.

Avant de localiser quoi que ce soit, vérifiez que votre glossaire couvre :

- **Noms des produits et des fonctionnalités**, et si chacun est traduit.
- **Traductions approuvées** pour les termes de campagne récurrents tels que « essai gratuit », « pour une durée limitée » et « s’inscrire ».
- **Termes interdits**, c’est-à-dire les mots qui ne doivent jamais apparaître sur un marché donné.
- **Slogans**, avec une version approuvée par marché plutôt qu’une nouvelle traduction à chaque campagne.

Dans Hyperlocalise, Iris utilise les mêmes glossaires et la même mémoire de traduction que l’application web. Les traductions approuvées sont appliquées, et les termes interdits sont bloqués dans les textes affichés à l’écran et les prompts d’image. Si vos règles figurent dans un guide de marque ou un document de conformité, importez-le en tant que [guide](/product/guidelines) et vérifiez les textes à l’aide de celui-ci. Nous approfondissons les questions de responsabilité et d’application des règles dans [Comment préserver la cohérence de la voix de marque et de la terminologie d’un marché à l’autre](/blog/how-to-keep-brand-voice-and-terminology-consistent-across-markets).

## Étape 3 : Localisez le contenu dans l’image

Il existe deux points de départ, qui nécessitent des approches différentes.

### Vous avez une image terminée.

C’est le cas le plus courant. Vous disposez d’un PNG ou JPEG aplati provenant d’une agence ou d’un outil de conception, et le texte est intégré à l’image.

Dans Iris, le parcours est le suivant :

1. **Ouvrez l’image en tant que création**.
2. **Lisez le texte de l’image.** Iris repère chaque élément de texte et indique où il se trouve, afin que vous obteniez le titre, l’offre, l’appel à l’action et les mentions en petits caractères sous forme d’éléments distincts.
3. **Traduisez et révisez ces éléments** à l’aide de votre glossaire et de votre mémoire de traduction. Vous révisez le texte, pas l’image, ce qui est plus rapide et plus facile à partager avec les réviseurs de chaque marché.
4. **Localisez l’image pour chaque marché.** Iris redessine le texte approuvé à la même position et dans le même style, en conservant la photographie, le produit et la mise en page tels quels.

Chaque résultat est enregistré comme version de la création pour le marché correspondant et affiché à côté de l’original, afin que vous puissiez comparer les marchés côte à côte. Aucun fichier avec calques ni fond vierge n’est nécessaire.

### Vous le concevez à partir de zéro.

Si la création n’existe pas encore, générez l’original dans Iris à partir d’un brief. Ajoutez les couleurs de votre marque, les polices utilisées, la mise en page, le texte exact entre guillemets, ainsi que votre logo et des visuels de vos produits comme références. Puis localisez-la de la même manière.

Rédigez le texte source en tenant compte de la localisation :

- **Gardez le titre court.** Chaque mot supprimé en anglais vous en fait économiser davantage en allemand.
- **Ne regroupez pas les fragments de texte.** « Économisez » + « 20 % » + « aujourd’hui » ne fonctionne pas dans les langues où l’ordre des mots est différent. Rédigez la phrase complète.
- **Prévoyez de la place.** Prévoyez environ un tiers d’espace en plus par rapport à ce dont l’anglais a besoin.

Si le visuel est destiné à de nombreux marchés et qu’il est souvent modifié, pensez à utiliser des calques de texte modifiables plutôt qu’à intégrer le texte à l’image. Le texte modifiable reste éditable et se traduit comme n’importe quel autre message.

## Étape 4 : Vérifiez la mise en page sur chaque marché

C’est l’étape que les équipes sautent, et c’est celle que les clients remarquent.

Les traductions varient en longueur. L’allemand, le finnois et le français sont souvent 20 à 35 % plus longs que l’anglais. Le chinois et le japonais sont plus courts, ce qui peut laisser des espaces vides peu esthétiques. L’arabe et l’hébreu se lisent de droite à gauche ; les mises en page alignées à gauche ne conviennent donc pas. Le thaï, le japonais et le chinois passent à la ligne sans espaces, ce qui rend les retours à la ligne imprévisibles.

Pour chaque marché, vérifiez :

| Vérification | Éléments à vérifier |
| --- | --- |
| **Débordement** | Texte tronqué, dépassant du bord ou chevauchant le produit |
| **Sauts de ligne** | Mots isolés sur la dernière ligne, ou sauts qui séparent un nom de marque ou un prix |
| **Sens** | Texte de droite à gauche aligné à droite ou centré, tout en préservant l’équilibre de la mise en page |
| **Polices** | Caractères manquants (cases vides) ou police de substitution qui ne correspond pas à la marque |
| **Nombres** | Prix, pourcentages et dates écrits selon les conventions de ce marché |
| **Adaptation** | Texte assez court pour être lu dans la seconde environ dont dispose une publicité sur les réseaux sociaux |

Iris détecte ces problèmes, et vous pouvez prévisualiser chaque marché en taille réelle avant de l’approuver. Pour les campagnes de longue durée, effectuez les mêmes vérifications que lors d’un [audit de localisation de site web](/blog/what-is-a-website-localisation-audit), car il s’agit de la même idée appliquée aux créations.

## Étape 5 : Échangez avec des personnes qui connaissent le marché

L’IA vous permet d’obtenir une première version solide pour chaque marché. Une personne qui connaît le marché devrait tout de même approuver tout ce que vous payez pour présenter aux clients.

Accélérez la vérification :

- **Envoyez aux réviseurs le texte et l’image rendue**, pas un tableur de chaînes sans contexte.
- **Posez des questions précises.** Le titre sonne-t-il naturel ? L’offre est-elle claire ? Y a-t-il quelque chose qui ne correspond pas à la marque ou qui présente un risque ?
- **Corrigez les problèmes à la source.** Si un terme est incorrect, corrigez-le dans le glossaire plutôt que dans une seule image, afin que chaque ressource créée par la suite soit correcte.
- **Conservez les approbations.** Lorsqu’un marché valide un contenu, l’espace de travail mémorise la version approuvée, afin que la prochaine campagne puisse repartir de celle-ci plutôt que de zéro.

## Étape 6 : Exporter et mesurer par marché

Exportez uniquement les marchés approuvés. Nommez les fichiers selon le concept, le format et la langue afin que les acheteurs média ne téléversent pas la bannière française dans le groupe d’annonces allemand.

Ensuite, considérez la localisation comme quelque chose que vous pouvez mesurer. Comparez le taux de clics et les conversions par marché à ceux d’un groupe témoin ayant uniquement reçu une traduction, ou aux résultats de la dernière campagne. Si un marché affiche des résultats en baisse, vous pouvez désormais modifier le texte de la création en quelques minutes plutôt qu’en quelques jours. C’est là que [l’expérimentation par marché](/use-cases/market-experimentation) devient concrète.

## Une liste de contrôle pour votre prochaine campagne

- [ ] Marchés indiqués par leur code de locale, avec le registre de langue, l’offre et les mentions légales pour chacun.
- [ ] Décision prise : traduire ou reformuler les titres et slogans
- [ ] Le glossaire couvre les noms de produits, les termes récurrents des campagnes et les termes interdits.
- [ ] Texte source rédigé de façon concise, en phrases complètes et avec de la marge pour évoluer.
- [ ] Le texte de l’image a été lu, traduit et vérifié à l’aide du glossaire.
- [ ] Chaque marché est prévisualisé pour vérifier le débordement, les sauts de ligne, le sens de lecture, les polices et les nombres.
- [ ] Approuvé par une personne qui connaît chaque marché
- [ ] Approbations enregistrées pour servir de base à la prochaine campagne
- [ ] Fichiers nommés selon le concept, la taille et la langue ; résultats suivis par marché

## Essayez-le sur un actif

Vous n’avez pas besoin de changer tout votre processus de campagne pour voir la différence. Prenez une bannière que vous devez diffuser ce mois-ci et un marché que vous repoussez depuis un moment. Localisez-la dans Iris, vérifiez la mise en page, puis comparez le résultat et le temps nécessaire à votre processus actuel.

Iris est téléchargeable gratuitement sur Mac, et la génération utilise les crédits IA inclus dans les offres payantes à partir de 20 $ par mois. Consultez l’article de lancement d’[Iris](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets) pour tout savoir, ou **[téléchargez Iris](/iris)** et lancez-vous avec votre prochaine campagne.
