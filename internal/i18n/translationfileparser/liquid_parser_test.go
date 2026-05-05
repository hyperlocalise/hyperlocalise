package translationfileparser

import (
	"errors"
	"strings"
	"testing"
)

func TestLiquidParserImplementsParserInterfaces(t *testing.T) {
	requireLiquidParser(LiquidParser{})
	requireLiquidContextParser(LiquidParser{})
}

func TestLiquidParserParseExtractsHardcodedText(t *testing.T) {
	got, err := (LiquidParser{}).Parse([]byte(`Welcome to our store.`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	key, value := singleLiquidEntry(t, got)
	if !strings.HasPrefix(key, "liquid.") {
		t.Fatalf("expected liquid key, got %q", key)
	}
	if value != "Welcome to our store." {
		t.Fatalf("unexpected extracted value: %q", value)
	}
}

func TestLiquidParserParseExtractsHTMLShapedLiquid(t *testing.T) {
	got, err := (LiquidParser{}).Parse([]byte(`<section>
  <h1>Welcome back</h1>
  <p>Hello {{ customer.first_name }}.</p>
</section>`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("expected two entries, got %#v", got)
	}
	if !liquidValuesContain(got, "Welcome back") {
		t.Fatalf("expected heading text, got %#v", got)
	}
	paragraph := liquidValueContaining(t, got, "Hello ")
	if !strings.Contains(paragraph, "HLLQPH_") {
		t.Fatalf("expected liquid placeholder in paragraph, got %q", paragraph)
	}
	if strings.Contains(paragraph, "{{ customer.first_name }}") {
		t.Fatalf("expected source Liquid syntax to be masked before translation, got %q", paragraph)
	}
}

func TestLiquidParserParseKeepsControlTagsOutsideTranslationSegments(t *testing.T) {
	template := []byte(`{% if user %}
  Hello {{ user.name }}!
{% endif %}`)

	got, err := (LiquidParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	key, value := singleLiquidEntry(t, got)

	tokens := liquidSyntaxPlaceholderTokens(value)
	if len(tokens) != 1 {
		t.Fatalf("expected only the user object placeholder, got %q tokens=%v", value, tokens)
	}
	if want := "Hello " + tokens[0] + "!"; strings.TrimSpace(value) != want {
		t.Fatalf("expected clean visible text segment %q, got %q", want, value)
	}

	out, diags := MarshalLiquid(template, map[string]string{
		key: strings.Replace(value, "Hello", "Bonjour", 1),
	})
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallback keys: %#v", diags.SourceFallbackKeys)
	}
	rendered := string(out)
	if !strings.Contains(rendered, "{% if user %}") || !strings.Contains(rendered, "{% endif %}") {
		t.Fatalf("expected control tags preserved, got %q", rendered)
	}
	if !strings.Contains(rendered, "Bonjour {{ user.name }}!") {
		t.Fatalf("expected translated visible text with Liquid object restored, got %q", rendered)
	}
}

func TestLiquidParserParseSplitsConditionalBranches(t *testing.T) {
	got, err := (LiquidParser{}).Parse([]byte(`{% if product.available %}
  <span>Available today</span>
{% elsif product.coming_soon %}
  <span>Coming soon</span>
{% else %}
  <span>Sold out</span>
{% endif %}`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 3 {
		t.Fatalf("expected three branch entries, got %#v", got)
	}
	for _, want := range []string{"Available today", "Coming soon", "Sold out"} {
		if !liquidValueContainsText(got, want) {
			t.Fatalf("expected branch text %q in %#v", want, got)
		}
	}
	for _, value := range got {
		matches := 0
		for _, branchText := range []string{"Available today", "Coming soon", "Sold out"} {
			if strings.Contains(value, branchText) {
				matches++
			}
		}
		if matches != 1 {
			t.Fatalf("expected each branch to be a separate segment, got %q", value)
		}
	}
}

func TestLiquidParserParseCaptureTranslatesInnerVisibleText(t *testing.T) {
	template := []byte(`{% capture header_title %}
Featured products for {{ shop.name }}
{% endcapture %}
<h2>{{ header_title }}</h2>`)

	got, err := (LiquidParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	key, value := singleLiquidEntry(t, got)
	if !strings.Contains(value, "Featured products for ") {
		t.Fatalf("expected capture body text, got %q", value)
	}
	if tokens := liquidSyntaxPlaceholderTokens(value); len(tokens) != 1 {
		t.Fatalf("expected shop name placeholder only, got %q tokens=%v", value, tokens)
	}

	out, diags := MarshalLiquid(template, map[string]string{
		key: strings.Replace(value, "Featured products", "Produits vedettes", 1),
	})
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallback keys: %#v", diags.SourceFallbackKeys)
	}
	rendered := string(out)
	if !strings.Contains(rendered, "{% capture header_title %}") || !strings.Contains(rendered, "{% endcapture %}") {
		t.Fatalf("expected capture tags preserved, got %q", rendered)
	}
	if !strings.Contains(rendered, "Produits vedettes for {{ shop.name }}") {
		t.Fatalf("expected translated capture body with Liquid object restored, got %q", rendered)
	}
}

func TestMarshalLiquidRestoresLiquidTagsInsideHTMLAttributes(t *testing.T) {
	template := []byte(`<img {% if selected %}loading="lazy"{% endif %} alt="Hero image">`)
	got, err := (LiquidParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	key, value := singleLiquidEntry(t, got)
	if value != "Hero image" {
		t.Fatalf("unexpected alt entry: %q", value)
	}

	out, diags := MarshalLiquid(template, map[string]string{key: "Image hero"})
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallback keys: %#v", diags.SourceFallbackKeys)
	}
	rendered := string(out)
	if strings.ContainsAny(rendered, "\x1e\x1f") {
		t.Fatalf("rendered output leaked internal placeholders: %q", rendered)
	}
	if !strings.Contains(rendered, `{% if selected %}loading="lazy"{% endif %}`) {
		t.Fatalf("expected Liquid attribute tags preserved, got %q", rendered)
	}
	if !strings.Contains(rendered, `alt="Image hero"`) {
		t.Fatalf("expected translated alt text, got %q", rendered)
	}
}

func TestLiquidParserParseDoesNotExtractShopifyTranslationKeys(t *testing.T) {
	got, err := (LiquidParser{}).Parse([]byte(`{{ 'header.navigation.home' | t }}`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected no entry for locale-key call, got %#v", got)
	}
}

func TestLiquidParserParseSkipsUnsafeBlocks(t *testing.T) {
	got, err := (LiquidParser{}).Parse([]byte(`Intro text.
{% raw %}
Raw text should not translate.
{% endraw %}
{% schema %}
{ "name": "Schema name should not translate" }
{% endschema %}
Outro text.`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("expected visible text on either side of skipped blocks, got %#v", got)
	}
	if !liquidValuesContain(got, "Intro text.\n") {
		t.Fatalf("expected intro text, got %#v", got)
	}
	if !liquidValuesContain(got, "\nOutro text.") {
		t.Fatalf("expected outro text, got %#v", got)
	}
	for _, value := range got {
		if strings.Contains(value, "Raw text") || strings.Contains(value, "Schema name") || strings.Contains(value, "HLLQPH_") {
			t.Fatalf("expected skipped block bodies and placeholders outside extracted text, got %q", value)
		}
	}
}

func TestLiquidParserShopifyExampleShapes(t *testing.T) {
	tests := []struct {
		name      string
		source    string
		wantTexts []string
	}{
		{
			name: "price range",
			source: `{% if available %}
  {% if product.price_varies and template == 'collection' %}
    <p>From {{ product.price_min | money }} to {{ product.price_max | money }}</p>
  {% else %}
    <p>{{ product.price | money }}</p>
  {% endif %}
{% else %}
  <p>Sold out</p>
{% endif %}`,
			wantTexts: []string{"From ", "Sold out"},
		},
		{
			name: "announcement bar",
			source: `{%- if section.settings.show_announcement -%}
  <p>{{ section.settings.text | escape }}</p>
{%- endif -%}
{% schema %}
{ "name": "Announcement bar", "settings": [{ "label": "Announcement text", "default": "Announce something here" }] }
{% endschema %}`,
			wantTexts: nil,
		},
		{
			name: "product recommendations",
			source: `{%- if section.settings.show_product_recommendations -%}
  <div class="product-recommendations" data-product-id="{{ product.id }}" data-limit="4">
    {%- if recommendations.products_count > 0 -%}
      <h2>You may also like</h2>
      <ul>
        {%- for product in recommendations.products -%}
          <li><a href="{{ product.url }}">{{ product.title }}</a></li>
        {%- endfor -%}
      </ul>
    {%- endif -%}
  </div>
{%- endif -%}
{% schema %}{ "name": "Product recommendations" }{% endschema %}
{% javascript %}console.log("Do not translate this");{% endjavascript %}`,
			wantTexts: []string{"You may also like"},
		},
		{
			name: "product variant selector",
			source: `{%- unless product.has_only_default_variant -%}
  {%- for option in product.options_with_values -%}
    <input type="radio"
      {% if option.selected_value == value %} checked="checked"{% endif %}
      value="{{ value | escape }}"
      id="ProductSelect-option-{{ option.name | handleize }}-{{ value | escape }}">
    <label for="ProductSelect-option-{{ option.name | handleize }}-{{ value | escape }}">
      {{ value | escape }}
    </label>
  {%- endfor -%}
{%- endunless -%}`,
			wantTexts: nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := (LiquidParser{}).Parse([]byte(tc.source))
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			if len(got) != len(tc.wantTexts) {
				t.Fatalf("expected %d entries, got %#v", len(tc.wantTexts), got)
			}
			for _, want := range tc.wantTexts {
				if !liquidValueContainsText(got, want) {
					t.Fatalf("expected text %q in %#v", want, got)
				}
			}
		})
	}
}

func TestLiquidParserParseReturnsTypedErrorForUnclosedDelimiter(t *testing.T) {
	_, err := (LiquidParser{}).Parse([]byte(`Hello {{ customer.name`))
	if err == nil {
		t.Fatal("expected malformed Liquid delimiter to return an error")
	}

	var parseErr *LiquidParseError
	if !errors.As(err, &parseErr) {
		t.Fatalf("expected LiquidParseError, got %T: %v", err, err)
	}
	if parseErr.Unwrap() != nil {
		t.Fatalf("expected nil unwrap, got %v", parseErr.Unwrap())
	}
	if !strings.Contains(parseErr.Error(), "unclosed liquid output delimiter") {
		t.Fatalf("unexpected parse error: %v", parseErr)
	}
}

func TestLiquidParserParseReturnsTypedErrorForUnclosedSkippedBlock(t *testing.T) {
	_, err := (LiquidParser{}).Parse([]byte(`{% raw %} nope`))
	if err == nil {
		t.Fatal("expected malformed Liquid block to return an error")
	}

	var parseErr *LiquidParseError
	if !errors.As(err, &parseErr) {
		t.Fatalf("expected LiquidParseError, got %T: %v", err, err)
	}
	if !strings.Contains(parseErr.Error(), "unclosed liquid raw block") {
		t.Fatalf("unexpected parse error: %v", parseErr)
	}
}

func TestLiquidParserStrategyErrorIncludesSourcePath(t *testing.T) {
	_, err := NewDefaultStrategy().Parse("sections/header.liquid", []byte(`Hello {{ customer.name`))
	if err == nil {
		t.Fatal("expected malformed Liquid to return an error")
	}

	var parseErr *LiquidParseError
	if !errors.As(err, &parseErr) {
		t.Fatalf("expected wrapped LiquidParseError, got %T: %v", err, err)
	}
	if parseErr.FilePath != "sections/header.liquid" {
		t.Fatalf("expected typed source path, got %q", parseErr.FilePath)
	}
	if !strings.Contains(err.Error(), "sections/header.liquid") {
		t.Fatalf("expected strategy error to include source path, got %q", err.Error())
	}
}

func TestMarshalLiquidReplacesTextAndPreservesLiquidSyntax(t *testing.T) {
	template := []byte(`<p>Hello {{ customer.first_name }}.</p>
{{ 'header.navigation.home' | t }}
`)
	values, err := (LiquidParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	key, source := singleLiquidEntry(t, values)

	out, diags := MarshalLiquid(template, map[string]string{
		key: strings.Replace(source, "Hello", "Bonjour", 1),
	})
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallback keys: %#v", diags.SourceFallbackKeys)
	}

	rendered := string(out)
	if !strings.Contains(rendered, `<p>Bonjour {{ customer.first_name }}.</p>`) {
		t.Fatalf("expected translated paragraph with Liquid syntax restored, got %q", rendered)
	}
	if !strings.Contains(rendered, `{{ 'header.navigation.home' | t }}`) {
		t.Fatalf("expected Shopify translation call preserved, got %q", rendered)
	}
}

func TestMarshalLiquidFallsBackWhenLiquidPlaceholderMissing(t *testing.T) {
	template := []byte(`<p>Hello {{ customer.first_name }}.</p>`)
	values, err := (LiquidParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	key, _ := singleLiquidEntry(t, values)

	out, diags := MarshalLiquid(template, map[string]string{key: "Bonjour."})
	if len(diags.SourceFallbackKeys) != 1 || diags.SourceFallbackKeys[0] != key {
		t.Fatalf("expected source fallback diagnostic for %q, got %#v", key, diags)
	}
	if string(out) != string(template) {
		t.Fatalf("expected source fallback, got %q", string(out))
	}
}

func TestMarshalLiquidWithTargetFallbackUsesExistingTargetByPosition(t *testing.T) {
	source := []byte("<h1>Welcome</h1>\n<p>Checkout now.</p>\n")
	target := []byte("<h1>Bienvenue</h1>\n<p>Achetez maintenant.</p>\n")

	sourceEntries, err := (LiquidParser{}).Parse(source)
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}
	var checkoutKey string
	for key, value := range sourceEntries {
		if value == "Checkout now." {
			checkoutKey = key
		}
	}
	if checkoutKey == "" {
		t.Fatalf("expected checkout key in %#v", sourceEntries)
	}

	out, diags := MarshalLiquidWithTargetFallback(source, target, map[string]string{
		checkoutKey: "Paiement maintenant.",
	})
	if len(diags.SourceFallbackKeys) != 0 {
		t.Fatalf("unexpected fallback keys: %#v", diags.SourceFallbackKeys)
	}

	rendered := string(out)
	if !strings.Contains(rendered, "<h1>Bienvenue</h1>") {
		t.Fatalf("expected existing target heading preserved, got %q", rendered)
	}
	if !strings.Contains(rendered, "<p>Paiement maintenant.</p>") {
		t.Fatalf("expected staged paragraph translation, got %q", rendered)
	}
}

func TestValidateLiquidInternalPlaceholders(t *testing.T) {
	source := "Hello \x1eHLLQPH_ABCDEF123456_0\x1f."
	if err := ValidateLiquidInternalPlaceholders(source, "Bonjour \x1eHLLQPH_ABCDEF123456_0\x1f."); err != nil {
		t.Fatalf("unexpected placeholder validation error: %v", err)
	}
	if err := ValidateLiquidInternalPlaceholders(source, "Bonjour."); err == nil {
		t.Fatal("expected placeholder validation error")
	}
}

func requireLiquidParser(_ Parser) {}

func requireLiquidContextParser(_ ContextParser) {}

func singleLiquidEntry(t *testing.T, entries map[string]string) (string, string) {
	t.Helper()

	if len(entries) != 1 {
		t.Fatalf("expected one entry, got %#v", entries)
	}
	for key, value := range entries {
		return key, value
	}
	panic("unreachable")
}

func liquidValuesContain(values map[string]string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func liquidValueContainsText(values map[string]string, want string) bool {
	for _, value := range values {
		if strings.Contains(value, want) {
			return true
		}
	}
	return false
}

func liquidValueContaining(t *testing.T, values map[string]string, want string) string {
	t.Helper()

	for _, value := range values {
		if strings.Contains(value, want) {
			return value
		}
	}
	t.Fatalf("expected value containing %q in %#v", want, values)
	return ""
}
