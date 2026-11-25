package main

import "encoding/json"

const sampleSourceLocale = "en-US"

type sampleLocaleProgress string

const (
	sampleProgressApproved     sampleLocaleProgress = "approved"
	sampleProgressInReview     sampleLocaleProgress = "in_review"
	sampleProgressPartial      sampleLocaleProgress = "partial"
	sampleProgressUntranslated sampleLocaleProgress = "untranslated"
)

type sampleString struct {
	key          string
	text         string
	context      string
	maxLength    int
	translations map[string]string
}

type sampleFile struct {
	sourcePath string
	strings    []sampleString
}

type sampleTarget struct {
	locale   string
	progress sampleLocaleProgress
}

type sampleComment struct {
	key    string
	locale string
	text   string
}

type sampleProject struct {
	name               string
	description        string
	translationContext string
	targetLocales      []sampleTarget
	files              []sampleFile
	comments           []sampleComment
}

type sampleGlossaryConcept struct {
	primaryTerm  string
	definition   string
	translatable bool
	note         string
	terms        map[string]string
	forbidden    map[string]string
}

type sampleMemoryEntry struct {
	sourceText   string
	translations map[string]string
}

var sampleMobileAppFiles = []sampleFile{
	{
		sourcePath: "locales/en-US/common.json",
		strings: []sampleString{
			{
				key: "nav.home", text: "Home", context: "Bottom tab bar label", maxLength: 12,
				translations: map[string]string{"fr-FR": "Accueil", "de-DE": "Start", "ja-JP": "ホーム"},
			},
			{
				key: "nav.activity", text: "Activity", context: "Bottom tab bar label for the transaction history", maxLength: 12,
				translations: map[string]string{"fr-FR": "Activité", "de-DE": "Aktivität", "ja-JP": "アクティビティ"},
			},
			{
				key: "nav.account", text: "Account", context: "Bottom tab bar label", maxLength: 12,
				translations: map[string]string{"fr-FR": "Compte", "de-DE": "Konto", "ja-JP": "アカウント"},
			},
			{
				key: "actions.continue", text: "Continue", context: "Primary button", maxLength: 20,
				translations: map[string]string{"fr-FR": "Continuer", "de-DE": "Weiter", "ja-JP": "続ける"},
			},
			{
				key: "actions.cancel", text: "Cancel", maxLength: 20,
				translations: map[string]string{"fr-FR": "Annuler", "de-DE": "Abbrechen", "ja-JP": "キャンセル"},
			},
			{
				key: "errors.network", text: "We couldn't connect. Check your internet connection and try again.",
				context: "Toast shown when a request fails",
				translations: map[string]string{
					"fr-FR": "Connexion impossible. Vérifiez votre connexion Internet et réessayez.",
					"de-DE": "Wir konnten keine Verbindung herstellen. Prüfe deine Internetverbindung und versuche es erneut.",
					"ja-JP": "接続できませんでした。インターネット接続を確認して、もう一度お試しください。",
				},
			},
			{
				key: "greeting.morning", text: "Good morning, {name}",
				context: "Home screen header. {name} is the user's first name.",
				translations: map[string]string{
					"fr-FR": "Bonjour, {name}",
					"de-DE": "Guten Morgen, {name}",
					"ja-JP": "おはようございます、{name}さん",
				},
			},
		},
	},
	{
		sourcePath: "locales/en-US/onboarding.json",
		strings: []sampleString{
			{
				key: "welcome.title", text: "Welcome to Acme Wallet", context: "First onboarding screen headline", maxLength: 40,
				translations: map[string]string{
					"fr-FR": "Bienvenue sur Acme Wallet",
					"de-DE": "Willkommen bei Acme Wallet",
					"ja-JP": "Acme Wallet へようこそ",
				},
			},
			{
				key: "welcome.body", text: "Send money, split bills and track your spending in one place.",
				translations: map[string]string{
					"fr-FR": "Envoyez de l'argent, partagez les dépenses et suivez votre budget au même endroit.",
					"de-DE": "Sende Geld, teile Rechnungen und behalte deine Ausgaben an einem Ort im Blick.",
					"ja-JP": "送金、割り勘、支出管理をひとつのアプリで。",
				},
			},
			{
				key: "verify.title", text: "Verify your identity", maxLength: 40,
				translations: map[string]string{
					"fr-FR": "Vérifiez votre identité",
					"de-DE": "Bestätige deine Identität",
					"ja-JP": "本人確認",
				},
			},
			{
				key: "verify.body", text: "We need a photo of your ID to keep your account secure. It only takes a minute.",
				translations: map[string]string{
					"fr-FR": "Nous avons besoin d'une photo de votre pièce d'identité pour sécuriser votre compte. Cela ne prend qu'une minute.",
					"de-DE": "Wir brauchen ein Foto deines Ausweises, um dein Konto zu schützen. Das dauert nur eine Minute.",
					"ja-JP": "アカウントを安全に保つため、本人確認書類の写真が必要です。1分ほどで完了します。",
				},
			},
			{
				key: "notifications.prompt", text: "Turn on notifications so you never miss a payment.",
				translations: map[string]string{
					"fr-FR": "Activez les notifications pour ne manquer aucun paiement.",
					"de-DE": "Aktiviere Benachrichtigungen, damit du keine Zahlung verpasst.",
				},
			},
			{
				key: "notifications.allow", text: "Allow notifications", context: "Button", maxLength: 24,
				translations: map[string]string{
					"fr-FR": "Autoriser les notifications",
					"de-DE": "Benachrichtigungen erlauben",
				},
			},
		},
	},
	{
		sourcePath: "locales/en-US/checkout.json",
		strings: []sampleString{
			{
				key: "cart.title", text: "Your cart", maxLength: 24,
				translations: map[string]string{"fr-FR": "Votre panier", "de-DE": "Dein Warenkorb", "ja-JP": "カート"},
			},
			{
				key: "cart.itemCount", text: "{count, plural, one {# item} other {# items}}",
				context: "ICU plural. Shown under the cart title.",
				translations: map[string]string{
					"fr-FR": "{count, plural, one {# article} other {# articles}}",
					"de-DE": "{count, plural, one {# Artikel} other {# Artikel}}",
					"ja-JP": "{count, plural, other {#点}}",
				},
			},
			{
				key: "cart.empty", text: "Your cart is empty. Browse the store to add something.",
				translations: map[string]string{
					"fr-FR": "Votre panier est vide. Parcourez la boutique pour ajouter un article.",
					"de-DE": "Dein Warenkorb ist leer. Stöbere im Shop, um etwas hinzuzufügen.",
				},
			},
			{
				key: "checkout.payNow", text: "Pay now with AcmePay",
				context:   "Primary checkout button. AcmePay is a product name and is not translated.",
				maxLength: 28,
				translations: map[string]string{
					"fr-FR": "Payer avec AcmePay",
					"de-DE": "Jetzt mit AcmePay bezahlen",
					"ja-JP": "AcmePay で今すぐ支払う",
				},
			},
			{
				key: "checkout.shipping", text: "Free shipping on orders over {amount}",
				context: "{amount} is a formatted currency value",
				translations: map[string]string{
					"fr-FR": "Livraison gratuite dès {amount} d'achat",
					"de-DE": "Kostenloser Versand ab {amount} Bestellwert",
				},
			},
			{
				key: "checkout.success", text: "Payment complete! Your order is on its way.",
				translations: map[string]string{
					"fr-FR": "Paiement effectué ! Votre commande est en route.",
					"de-DE": "Zahlung abgeschlossen! Deine Bestellung ist unterwegs.",
				},
			},
		},
	},
}

var sampleMarketingSiteFiles = []sampleFile{
	{
		sourcePath: "content/en-US/home.json",
		strings: []sampleString{
			{
				key: "hero.title", text: "The wallet that travels with you", context: "Homepage hero headline", maxLength: 48,
				translations: map[string]string{
					"fr-FR": "Le portefeuille qui voyage avec vous",
					"de-DE": "Die Wallet, die mit dir reist",
				},
			},
			{
				key: "hero.subtitle", text: "Pay like a local in more than 40 countries, with no hidden fees.",
				translations: map[string]string{
					"fr-FR": "Payez comme un local dans plus de 40 pays, sans frais cachés.",
					"de-DE": "Bezahle wie ein Einheimischer in über 40 Ländern – ohne versteckte Gebühren.",
				},
			},
			{
				key: "hero.cta", text: "Get Acme Wallet", context: "Primary call to action", maxLength: 24,
				translations: map[string]string{"fr-FR": "Obtenir Acme Wallet", "de-DE": "Acme Wallet holen"},
			},
			{
				key: "features.security.title", text: "Bank-grade security",
				translations: map[string]string{"fr-FR": "Une sécurité de niveau bancaire"},
			},
			{
				key: "features.security.body", text: "Every payment is protected with biometric sign-in and real-time fraud alerts.",
				translations: map[string]string{},
			},
		},
	},
	{
		sourcePath: "content/en-US/pricing.json",
		strings: []sampleString{
			{
				key: "plans.free.name", text: "Free", maxLength: 16,
				translations: map[string]string{"fr-FR": "Gratuit", "de-DE": "Kostenlos"},
			},
			{
				key: "plans.plus.name", text: "Plus", maxLength: 16,
				translations: map[string]string{"fr-FR": "Plus", "de-DE": "Plus"},
			},
			{
				key: "plans.plus.price", text: "{price} per month", context: "{price} is a formatted currency value",
				translations: map[string]string{"fr-FR": "{price} par mois"},
			},
			{
				key: "plans.cta", text: "Start your free trial", maxLength: 28,
				translations: map[string]string{},
			},
		},
	},
}

var sampleProjects = []sampleProject{
	{
		name:        "Acme Wallet mobile app (sample)",
		description: "Sample project: in-app strings for the Acme Wallet iOS and Android apps.",
		translationContext: "Acme Wallet is a consumer payments app. Keep UI copy short, friendly and direct. " +
			"Use informal address where the language allows it (tu/du). Never translate the product " +
			"names Acme Wallet or AcmePay.",
		targetLocales: []sampleTarget{
			{locale: "fr-FR", progress: sampleProgressApproved},
			{locale: "de-DE", progress: sampleProgressInReview},
			{locale: "ja-JP", progress: sampleProgressPartial},
			{locale: "es-ES", progress: sampleProgressUntranslated},
		},
		files: sampleMobileAppFiles,
		comments: []sampleComment{
			{key: "nav.activity", locale: "de-DE", text: `Should this be "Umsätze" to match the banking wording on the website?`},
		},
	},
	{
		name:        "Acme Wallet website (sample)",
		description: "Sample project: homepage and pricing copy for the Acme Wallet marketing site.",
		translationContext: "Marketing copy for acmewallet.example. Adapt headlines for each market rather than " +
			"translating them word for word, and keep calls to action short.",
		targetLocales: []sampleTarget{
			{locale: "fr-FR", progress: sampleProgressInReview},
			{locale: "de-DE", progress: sampleProgressPartial},
		},
		files:    sampleMarketingSiteFiles,
		comments: nil,
	},
}

var sampleGlossary = struct {
	name        string
	description string
	concepts    []sampleGlossaryConcept
}{
	name:        "Acme Wallet terminology (sample)",
	description: "Sample glossary: product names and payment terms for Acme Wallet.",
	concepts: []sampleGlossaryConcept{
		{
			primaryTerm: "Acme Wallet", definition: "The product name. Never translate.", translatable: false,
			terms: map[string]string{"fr-FR": "Acme Wallet", "de-DE": "Acme Wallet", "ja-JP": "Acme Wallet"},
		},
		{
			primaryTerm: "AcmePay", definition: "The one-tap payment method inside Acme Wallet. Never translate.", translatable: false,
			terms: map[string]string{"fr-FR": "AcmePay", "de-DE": "AcmePay", "ja-JP": "AcmePay"},
		},
		{
			primaryTerm: "cart", definition: "The list of items a customer is about to buy.", translatable: true,
			note:      "Use Warenkorb in German, not Einkaufswagen.",
			terms:     map[string]string{"fr-FR": "panier", "de-DE": "Warenkorb", "ja-JP": "カート"},
			forbidden: map[string]string{"de-DE": "Einkaufswagen"},
		},
		{
			primaryTerm: "account", definition: "A customer's Acme Wallet profile and balance.", translatable: true,
			terms: map[string]string{"fr-FR": "compte", "de-DE": "Konto", "ja-JP": "アカウント"},
		},
		{
			primaryTerm: "payment", definition: "Money sent from a customer to a merchant or another person.", translatable: true,
			terms: map[string]string{"fr-FR": "paiement", "de-DE": "Zahlung", "ja-JP": "支払い"},
		},
		{
			primaryTerm: "fee", definition: "A charge added on top of a payment.", translatable: true,
			terms: map[string]string{"fr-FR": "frais", "de-DE": "Gebühr", "ja-JP": "手数料"},
		},
	},
}

var sampleMemory = struct {
	name        string
	description string
	entries     []sampleMemoryEntry
}{
	name:        "Acme Wallet translation memory (sample)",
	description: "Sample translation memory with approved Acme Wallet translations.",
	entries: []sampleMemoryEntry{
		{sourceText: "Sign in", translations: map[string]string{"fr-FR": "Se connecter", "de-DE": "Anmelden", "ja-JP": "ログイン"}},
		{sourceText: "Sign out", translations: map[string]string{"fr-FR": "Se déconnecter", "de-DE": "Abmelden", "ja-JP": "ログアウト"}},
		{sourceText: "Try again", translations: map[string]string{"fr-FR": "Réessayer", "de-DE": "Erneut versuchen", "ja-JP": "再試行"}},
		{
			sourceText: "Your cart is empty.",
			translations: map[string]string{
				"fr-FR": "Votre panier est vide.",
				"de-DE": "Dein Warenkorb ist leer.",
				"ja-JP": "カートは空です。",
			},
		},
		{
			sourceText: "Pay with AcmePay",
			translations: map[string]string{
				"fr-FR": "Payer avec AcmePay",
				"de-DE": "Mit AcmePay bezahlen",
				"ja-JP": "AcmePay で支払う",
			},
		},
		{
			sourceText: "Turn on notifications",
			translations: map[string]string{
				"fr-FR": "Activer les notifications",
				"de-DE": "Benachrichtigungen aktivieren",
				"ja-JP": "通知をオンにする",
			},
		},
		{
			sourceText: "No hidden fees",
			translations: map[string]string{
				"fr-FR": "Aucuns frais cachés",
				"de-DE": "Keine versteckten Gebühren",
				"ja-JP": "隠れた手数料なし",
			},
		},
		{
			sourceText: "Start your free trial",
			translations: map[string]string{
				"fr-FR": "Commencez votre essai gratuit",
				"de-DE": "Starte deine kostenlose Testphase",
				"ja-JP": "無料トライアルを開始",
			},
		},
	},
}

var sampleDictionary = struct {
	name        string
	description string
	words       []string
	locales     []string
}{
	name:        "Acme Wallet brand words (sample)",
	description: "Sample spellcheck dictionary: brand and product names that spellcheck accepts.",
	words:       []string{"Acme", "AcmePay", "acmewallet"},
	locales:     []string{sampleSourceLocale, "fr-FR", "de-DE", "ja-JP", "es-ES"},
}

func sampleAllTargetLocales() []string {
	seen := map[string]struct{}{}
	var locales []string
	for _, project := range sampleProjects {
		for _, target := range project.targetLocales {
			if _, ok := seen[target.locale]; ok {
				continue
			}
			seen[target.locale] = struct{}{}
			locales = append(locales, target.locale)
		}
	}
	return locales
}

func sampleLocaleCoverageJSON() []byte {
	coverage := append([]string{sampleSourceLocale}, sampleAllTargetLocales()...)
	body, err := json.Marshal(coverage)
	if err != nil {
		return []byte(`["en-US"]`)
	}
	return body
}
