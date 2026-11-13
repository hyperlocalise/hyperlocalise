package main

type researchMarket struct {
	ID, Location, Language, Label string
	LocationCode                  int
}

var researchMarkets = map[string]researchMarket{
	"france-fr":         {"france-fr", "France", "fr", "French (France)", 2250},
	"germany-de":        {"germany-de", "Germany", "de", "German (Germany)", 2276},
	"japan-ja":          {"japan-ja", "Japan", "ja", "Japanese (Japan)", 2392},
	"vietnam-vi":        {"vietnam-vi", "Vietnam", "vi", "Vietnamese (Vietnam)", 2704},
	"united-states-en":  {"united-states-en", "United States", "en", "English (United States)", 2840},
	"united-kingdom-en": {"united-kingdom-en", "United Kingdom", "en", "English (United Kingdom)", 2826},
	"australia-en":      {"australia-en", "Australia", "en", "English (Australia)", 2036},
	"india-en":          {"india-en", "India", "en", "English (India)", 2356},
	"spain-es":          {"spain-es", "Spain", "es", "Spanish (Spain)", 2724},
	"mexico-es":         {"mexico-es", "Mexico", "es", "Spanish (Mexico)", 2484},
	"canada-fr":         {"canada-fr", "Canada", "fr", "French (Canada)", 2124},
	"italy-it":          {"italy-it", "Italy", "it", "Italian (Italy)", 2380},
	"brazil-pt":         {"brazil-pt", "Brazil", "pt", "Portuguese (Brazil)", 2076},
	"portugal-pt":       {"portugal-pt", "Portugal", "pt", "Portuguese (Portugal)", 2620},
	"netherlands-nl":    {"netherlands-nl", "Netherlands", "nl", "Dutch (Netherlands)", 2528},
	"sweden-sv":         {"sweden-sv", "Sweden", "sv", "Swedish (Sweden)", 2752},
	"denmark-da":        {"denmark-da", "Denmark", "da", "Danish (Denmark)", 2208},
	"norway-nb":         {"norway-nb", "Norway", "nb", "Norwegian (Norway)", 2578},
	"finland-fi":        {"finland-fi", "Finland", "fi", "Finnish (Finland)", 2246},
	"poland-pl":         {"poland-pl", "Poland", "pl", "Polish (Poland)", 2616},
	"czechia-cs":        {"czechia-cs", "Czechia", "cs", "Czech (Czechia)", 2203},
	"hungary-hu":        {"hungary-hu", "Hungary", "hu", "Hungarian (Hungary)", 2348},
	"romania-ro":        {"romania-ro", "Romania", "ro", "Romanian (Romania)", 2642},
	"greece-el":         {"greece-el", "Greece", "el", "Greek (Greece)", 2300},
	"turkey-tr":         {"turkey-tr", "Türkiye", "tr", "Turkish (Türkiye)", 2792},
	"russia-ru":         {"russia-ru", "Russia", "ru", "Russian (Russia)", 2643},
	"ukraine-uk":        {"ukraine-uk", "Ukraine", "uk", "Ukrainian (Ukraine)", 2804},
	"saudi-arabia-ar":   {"saudi-arabia-ar", "Saudi Arabia", "ar", "Arabic (Saudi Arabia)", 2682},
	"israel-he":         {"israel-he", "Israel", "he", "Hebrew (Israel)", 2376},
	"iran-fa":           {"iran-fa", "Iran", "fa", "Persian (Iran)", 2364},
	"bangladesh-bn":     {"bangladesh-bn", "Bangladesh", "bn", "Bengali (Bangladesh)", 2050},
	"indonesia-id":      {"indonesia-id", "Indonesia", "id", "Indonesian (Indonesia)", 2360},
	"malaysia-ms":       {"malaysia-ms", "Malaysia", "ms", "Malay (Malaysia)", 2458},
	"thailand-th":       {"thailand-th", "Thailand", "th", "Thai (Thailand)", 2764},
	"philippines-fil":   {"philippines-fil", "Philippines", "fil", "Filipino (Philippines)", 2608},
	"china-zh":          {"china-zh", "China", "zh", "Chinese (China)", 2156},
	"taiwan-zh":         {"taiwan-zh", "Taiwan", "zh", "Chinese (Taiwan)", 2158},
	"hong-kong-zh":      {"hong-kong-zh", "Hong Kong", "zh", "Chinese (Hong Kong)", 2344},
	"south-korea-ko":    {"south-korea-ko", "South Korea", "ko", "Korean (South Korea)", 2410},
}

var defaultResearchMarketIDs = []string{"france-fr", "germany-de", "japan-ja", "vietnam-vi"}

func researchMarketByID(id string) (researchMarket, bool) {
	market, ok := researchMarkets[id]
	return market, ok
}
