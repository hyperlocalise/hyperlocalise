/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */

/**
 * Static content for the sample workspace: a fictional brand ("Acme Wallet") with projects,
 * source files, translations, a glossary, a translation memory, a spellcheck dictionary and
 * guideline documents. Everything here is made up so trial workspaces can explore the product
 * before adding their own content.
 */

export const SAMPLE_SOURCE_LOCALE = "en-US";

export type SampleTargetLocale = "fr-FR" | "de-DE" | "ja-JP" | "es-ES";

export type SampleString = {
  key: string;
  text: string;
  context?: string;
  maxLength?: number;
  translations: Partial<Record<SampleTargetLocale, string>>;
};

export type SampleFile = {
  sourcePath: string;
  strings: SampleString[];
};

/** How far each target locale has progressed, so the project shows a realistic mix of states. */
export type SampleLocaleProgress = "approved" | "in_review" | "partial" | "untranslated";

export type SampleProject = {
  slug: string;
  name: string;
  description: string;
  translationContext: string;
  targetLocales: { locale: SampleTargetLocale; progress: SampleLocaleProgress }[];
  files: SampleFile[];
  comments: { key: string; locale: SampleTargetLocale; text: string }[];
};

export type SampleGlossaryConcept = {
  primaryTerm: string;
  definition: string;
  translatable: boolean;
  note?: string;
  terms: Partial<Record<SampleTargetLocale, string>>;
  forbidden?: Partial<Record<SampleTargetLocale, string>>;
};

export type SampleMemoryEntry = {
  sourceText: string;
  translations: Partial<Record<SampleTargetLocale, string>>;
};

export type SampleGuidelineDocument = {
  filename: string;
  title: string;
  content: string;
};

const mobileAppFiles: SampleFile[] = [
  {
    sourcePath: "locales/en-US/common.json",
    strings: [
      {
        key: "nav.home",
        text: "Home",
        context: "Bottom tab bar label",
        maxLength: 12,
        translations: { "fr-FR": "Accueil", "de-DE": "Start", "ja-JP": "ホーム" },
      },
      {
        key: "nav.activity",
        text: "Activity",
        context: "Bottom tab bar label for the transaction history",
        maxLength: 12,
        translations: { "fr-FR": "Activité", "de-DE": "Aktivität", "ja-JP": "アクティビティ" },
      },
      {
        key: "nav.account",
        text: "Account",
        context: "Bottom tab bar label",
        maxLength: 12,
        translations: { "fr-FR": "Compte", "de-DE": "Konto", "ja-JP": "アカウント" },
      },
      {
        key: "actions.continue",
        text: "Continue",
        context: "Primary button",
        maxLength: 20,
        translations: { "fr-FR": "Continuer", "de-DE": "Weiter", "ja-JP": "続ける" },
      },
      {
        key: "actions.cancel",
        text: "Cancel",
        maxLength: 20,
        translations: { "fr-FR": "Annuler", "de-DE": "Abbrechen", "ja-JP": "キャンセル" },
      },
      {
        key: "errors.network",
        text: "We couldn't connect. Check your internet connection and try again.",
        context: "Toast shown when a request fails",
        translations: {
          "fr-FR": "Connexion impossible. Vérifiez votre connexion Internet et réessayez.",
          "de-DE":
            "Wir konnten keine Verbindung herstellen. Prüfe deine Internetverbindung und versuche es erneut.",
          "ja-JP": "接続できませんでした。インターネット接続を確認して、もう一度お試しください。",
        },
      },
      {
        key: "greeting.morning",
        text: "Good morning, {name}",
        context: "Home screen header. {name} is the user's first name.",
        translations: {
          "fr-FR": "Bonjour, {name}",
          "de-DE": "Guten Morgen, {name}",
          "ja-JP": "おはようございます、{name}さん",
        },
      },
    ],
  },
  {
    sourcePath: "locales/en-US/onboarding.json",
    strings: [
      {
        key: "welcome.title",
        text: "Welcome to Acme Wallet",
        context: "First onboarding screen headline",
        maxLength: 40,
        translations: {
          "fr-FR": "Bienvenue sur Acme Wallet",
          "de-DE": "Willkommen bei Acme Wallet",
          "ja-JP": "Acme Wallet へようこそ",
        },
      },
      {
        key: "welcome.body",
        text: "Send money, split bills and track your spending in one place.",
        translations: {
          "fr-FR":
            "Envoyez de l'argent, partagez les dépenses et suivez votre budget au même endroit.",
          "de-DE": "Sende Geld, teile Rechnungen und behalte deine Ausgaben an einem Ort im Blick.",
          "ja-JP": "送金、割り勘、支出管理をひとつのアプリで。",
        },
      },
      {
        key: "verify.title",
        text: "Verify your identity",
        maxLength: 40,
        translations: {
          "fr-FR": "Vérifiez votre identité",
          "de-DE": "Bestätige deine Identität",
          "ja-JP": "本人確認",
        },
      },
      {
        key: "verify.body",
        text: "We need a photo of your ID to keep your account secure. It only takes a minute.",
        translations: {
          "fr-FR":
            "Nous avons besoin d'une photo de votre pièce d'identité pour sécuriser votre compte. Cela ne prend qu'une minute.",
          "de-DE":
            "Wir brauchen ein Foto deines Ausweises, um dein Konto zu schützen. Das dauert nur eine Minute.",
          "ja-JP":
            "アカウントを安全に保つため、本人確認書類の写真が必要です。1分ほどで完了します。",
        },
      },
      {
        key: "notifications.prompt",
        text: "Turn on notifications so you never miss a payment.",
        translations: {
          "fr-FR": "Activez les notifications pour ne manquer aucun paiement.",
          "de-DE": "Aktiviere Benachrichtigungen, damit du keine Zahlung verpasst.",
        },
      },
      {
        key: "notifications.allow",
        text: "Allow notifications",
        context: "Button",
        maxLength: 24,
        translations: {
          "fr-FR": "Autoriser les notifications",
          "de-DE": "Benachrichtigungen erlauben",
        },
      },
    ],
  },
  {
    sourcePath: "locales/en-US/checkout.json",
    strings: [
      {
        key: "cart.title",
        text: "Your cart",
        maxLength: 24,
        translations: { "fr-FR": "Votre panier", "de-DE": "Dein Warenkorb", "ja-JP": "カート" },
      },
      {
        key: "cart.itemCount",
        text: "{count, plural, one {# item} other {# items}}",
        context: "ICU plural. Shown under the cart title.",
        translations: {
          "fr-FR": "{count, plural, one {# article} other {# articles}}",
          "de-DE": "{count, plural, one {# Artikel} other {# Artikel}}",
          "ja-JP": "{count, plural, other {#点}}",
        },
      },
      {
        key: "cart.empty",
        text: "Your cart is empty. Browse the store to add something.",
        translations: {
          "fr-FR": "Votre panier est vide. Parcourez la boutique pour ajouter un article.",
          "de-DE": "Dein Warenkorb ist leer. Stöbere im Shop, um etwas hinzuzufügen.",
        },
      },
      {
        key: "checkout.payNow",
        text: "Pay now with AcmePay",
        context: "Primary checkout button. AcmePay is a product name and is not translated.",
        maxLength: 28,
        translations: {
          "fr-FR": "Payer avec AcmePay",
          "de-DE": "Jetzt mit AcmePay bezahlen",
          "ja-JP": "AcmePay で今すぐ支払う",
        },
      },
      {
        key: "checkout.shipping",
        text: "Free shipping on orders over {amount}",
        context: "{amount} is a formatted currency value",
        translations: {
          "fr-FR": "Livraison gratuite dès {amount} d'achat",
          "de-DE": "Kostenloser Versand ab {amount} Bestellwert",
        },
      },
      {
        key: "checkout.success",
        text: "Payment complete! Your order is on its way.",
        translations: {
          "fr-FR": "Paiement effectué ! Votre commande est en route.",
          "de-DE": "Zahlung abgeschlossen! Deine Bestellung ist unterwegs.",
        },
      },
    ],
  },
];

const marketingSiteFiles: SampleFile[] = [
  {
    sourcePath: "content/en-US/home.json",
    strings: [
      {
        key: "hero.title",
        text: "The wallet that travels with you",
        context: "Homepage hero headline",
        maxLength: 48,
        translations: {
          "fr-FR": "Le portefeuille qui voyage avec vous",
          "de-DE": "Die Wallet, die mit dir reist",
        },
      },
      {
        key: "hero.subtitle",
        text: "Pay like a local in more than 40 countries, with no hidden fees.",
        translations: {
          "fr-FR": "Payez comme un local dans plus de 40 pays, sans frais cachés.",
          "de-DE": "Bezahle wie ein Einheimischer in über 40 Ländern – ohne versteckte Gebühren.",
        },
      },
      {
        key: "hero.cta",
        text: "Get Acme Wallet",
        context: "Primary call to action",
        maxLength: 24,
        translations: { "fr-FR": "Obtenir Acme Wallet", "de-DE": "Acme Wallet holen" },
      },
      {
        key: "features.security.title",
        text: "Bank-grade security",
        translations: { "fr-FR": "Une sécurité de niveau bancaire" },
      },
      {
        key: "features.security.body",
        text: "Every payment is protected with biometric sign-in and real-time fraud alerts.",
        translations: {},
      },
    ],
  },
  {
    sourcePath: "content/en-US/pricing.json",
    strings: [
      {
        key: "plans.free.name",
        text: "Free",
        maxLength: 16,
        translations: { "fr-FR": "Gratuit", "de-DE": "Kostenlos" },
      },
      {
        key: "plans.plus.name",
        text: "Plus",
        maxLength: 16,
        translations: { "fr-FR": "Plus", "de-DE": "Plus" },
      },
      {
        key: "plans.plus.price",
        text: "{price} per month",
        context: "{price} is a formatted currency value",
        translations: { "fr-FR": "{price} par mois" },
      },
      {
        key: "plans.cta",
        text: "Start your free trial",
        maxLength: 28,
        translations: {},
      },
    ],
  },
];

export const SAMPLE_PROJECTS: SampleProject[] = [
  {
    slug: "mobile-app",
    name: "Acme Wallet mobile app (sample)",
    description: "Sample project: in-app strings for the Acme Wallet iOS and Android apps.",
    translationContext:
      "Acme Wallet is a consumer payments app. Keep UI copy short, friendly and direct. " +
      "Use informal address where the language allows it (tu/du). Never translate the product " +
      "names Acme Wallet or AcmePay.",
    targetLocales: [
      { locale: "fr-FR", progress: "approved" },
      { locale: "de-DE", progress: "in_review" },
      { locale: "ja-JP", progress: "partial" },
      { locale: "es-ES", progress: "untranslated" },
    ],
    files: mobileAppFiles,
    comments: [
      {
        key: "nav.activity",
        locale: "de-DE",
        text: 'Should this be "Umsätze" to match the banking wording on the website?',
      },
    ],
  },
  {
    slug: "marketing-site",
    name: "Acme Wallet website (sample)",
    description: "Sample project: homepage and pricing copy for the Acme Wallet marketing site.",
    translationContext:
      "Marketing copy for acmewallet.example. Adapt headlines for each market rather than " +
      "translating them word for word, and keep calls to action short.",
    targetLocales: [
      { locale: "fr-FR", progress: "in_review" },
      { locale: "de-DE", progress: "partial" },
    ],
    files: marketingSiteFiles,
    comments: [],
  },
];

export const SAMPLE_GLOSSARY = {
  name: "Acme Wallet terminology (sample)",
  description: "Sample glossary: product names and payment terms for Acme Wallet.",
  concepts: [
    {
      primaryTerm: "Acme Wallet",
      definition: "The product name. Never translate.",
      translatable: false,
      terms: { "fr-FR": "Acme Wallet", "de-DE": "Acme Wallet", "ja-JP": "Acme Wallet" },
    },
    {
      primaryTerm: "AcmePay",
      definition: "The one-tap payment method inside Acme Wallet. Never translate.",
      translatable: false,
      terms: { "fr-FR": "AcmePay", "de-DE": "AcmePay", "ja-JP": "AcmePay" },
    },
    {
      primaryTerm: "cart",
      definition: "The list of items a customer is about to buy.",
      translatable: true,
      note: "Use Warenkorb in German, not Einkaufswagen.",
      terms: { "fr-FR": "panier", "de-DE": "Warenkorb", "ja-JP": "カート" },
      forbidden: { "de-DE": "Einkaufswagen" },
    },
    {
      primaryTerm: "account",
      definition: "A customer's Acme Wallet profile and balance.",
      translatable: true,
      terms: { "fr-FR": "compte", "de-DE": "Konto", "ja-JP": "アカウント" },
    },
    {
      primaryTerm: "payment",
      definition: "Money sent from a customer to a merchant or another person.",
      translatable: true,
      terms: { "fr-FR": "paiement", "de-DE": "Zahlung", "ja-JP": "支払い" },
    },
    {
      primaryTerm: "fee",
      definition: "A charge added on top of a payment.",
      translatable: true,
      terms: { "fr-FR": "frais", "de-DE": "Gebühr", "ja-JP": "手数料" },
    },
  ] satisfies SampleGlossaryConcept[],
};

export const SAMPLE_MEMORY = {
  name: "Acme Wallet translation memory (sample)",
  description: "Sample translation memory with approved Acme Wallet translations.",
  entries: [
    {
      sourceText: "Sign in",
      translations: { "fr-FR": "Se connecter", "de-DE": "Anmelden", "ja-JP": "ログイン" },
    },
    {
      sourceText: "Sign out",
      translations: { "fr-FR": "Se déconnecter", "de-DE": "Abmelden", "ja-JP": "ログアウト" },
    },
    {
      sourceText: "Try again",
      translations: { "fr-FR": "Réessayer", "de-DE": "Erneut versuchen", "ja-JP": "再試行" },
    },
    {
      sourceText: "Your cart is empty.",
      translations: {
        "fr-FR": "Votre panier est vide.",
        "de-DE": "Dein Warenkorb ist leer.",
        "ja-JP": "カートは空です。",
      },
    },
    {
      sourceText: "Pay with AcmePay",
      translations: {
        "fr-FR": "Payer avec AcmePay",
        "de-DE": "Mit AcmePay bezahlen",
        "ja-JP": "AcmePay で支払う",
      },
    },
    {
      sourceText: "Turn on notifications",
      translations: {
        "fr-FR": "Activer les notifications",
        "de-DE": "Benachrichtigungen aktivieren",
        "ja-JP": "通知をオンにする",
      },
    },
    {
      sourceText: "No hidden fees",
      translations: {
        "fr-FR": "Aucuns frais cachés",
        "de-DE": "Keine versteckten Gebühren",
        "ja-JP": "隠れた手数料なし",
      },
    },
    {
      sourceText: "Start your free trial",
      translations: {
        "fr-FR": "Commencez votre essai gratuit",
        "de-DE": "Starte deine kostenlose Testphase",
        "ja-JP": "無料トライアルを開始",
      },
    },
  ] satisfies SampleMemoryEntry[],
};

export const SAMPLE_DICTIONARY = {
  name: "Acme Wallet brand words (sample)",
  description: "Sample spellcheck dictionary: brand and product names that spellcheck accepts.",
  words: ["Acme", "AcmePay", "acmewallet"],
  locales: [SAMPLE_SOURCE_LOCALE, "fr-FR", "de-DE", "ja-JP", "es-ES"],
};

/**
 * Uploaded from the browser through the go-svc guidelines API, which owns guideline ingest.
 * Filenames are distinctive so removing the sample workspace can find them again.
 */
export const SAMPLE_GUIDELINE_DOCUMENTS: SampleGuidelineDocument[] = [
  {
    filename: "acme-wallet-sample-voice-and-tone.md",
    title: "Acme Wallet voice and tone (sample)",
    content: [
      "# Acme Wallet voice and tone",
      "",
      "Acme Wallet sounds like a helpful friend who is good with money.",
      "",
      "## Principles",
      "",
      "- **Clear over clever.** Say what happens, in as few words as possible.",
      "- **Reassuring.** Money is stressful. Explain what went wrong and what to do next.",
      "- **Inclusive.** Avoid idioms, slang and jokes that do not travel.",
      "",
      "## Words we use",
      "",
      "- Say *send money*, not *transfer funds*.",
      "- Say *fee*, not *charge* or *commission*.",
      "- Product names **Acme Wallet** and **AcmePay** are never translated.",
    ].join("\n"),
  },
  {
    filename: "acme-wallet-sample-style-guide.md",
    title: "Acme Wallet localisation style guide (sample)",
    content: [
      "# Acme Wallet localisation style guide",
      "",
      "## All languages",
      "",
      "- Keep placeholders such as `{name}`, `{amount}` and ICU plurals unchanged.",
      "- Respect the maximum length on buttons and tab labels.",
      "- Format numbers, dates and currencies for the target market.",
      "",
      "## French",
      "",
      "- Use *vous*. Put a non-breaking space before `!`, `?`, `:` and `;`.",
      "",
      "## German",
      "",
      "- Use *du* and sentence case for buttons.",
      "- Use *Warenkorb* for cart.",
      "",
      "## Japanese",
      "",
      "- Use polite form (です/ます) and full-width punctuation.",
    ].join("\n"),
  },
];

export const SAMPLE_GUIDELINE_FILENAMES = new Set(
  SAMPLE_GUIDELINE_DOCUMENTS.map((document) => document.filename),
);
