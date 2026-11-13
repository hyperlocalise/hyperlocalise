package translationfileparser

import (
	"strings"
	"testing"
)

// Real Intercom Articles API body_markdown (newlines, not JSON \n escapes).
const intercomArticleBodyMarkdown = `Public articles enable customers to self-serve and find support 24/7.  
Teammates can also insert articles in Help Desk conversations, send them in Proactive Support messages, and use them to power the [Fin AI Agent](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained) 💪

# Build a comprehensive knowledge base {#h_61bff2dd7a}

Once you've written your first few articles, you need to [group them into collections](https://www.intercom.com/help/en/articles/56647-create-collections-in-your-help-center) to publish them on your Help Center (articles are only visible on your Help Center if they’re in a collection).

### To make your content easy to find, you need to: {#h_bb4813e5c6}

- Organize your collections into topics that matter most to your customers - this will make your Help Center easier to browse.
- Add short descriptions to each collection to optimize them for search, and to help people better understand what they contain.
- [Customize your Help Center to match your brand](https://www.intercom.com/help/en/articles/56644-customize-your-help-center) or use [Multi Help Center](https://www.intercom.com/help/en/articles/8170953-create-and-manage-multiple-help-centers) for various products/brands.

# Use Articles to power Fin AI Agent and Fin AI Copilot {#h_8b76258d80}

Fin can use your Intercom Articles to hold conversations and provide AI Answers. As your Articles get better, Fin AI Agent does too—along with its rate of automated resolution.

![](https://downloads.intercomcdn.com/i/o/737654156/1dacc100c19eb70144b41922/226da4b3-5acb-4a75-8983-61dea50c6f31?expires=1791590400&signature=0b97dadf5fe00a9f5bb374bc34a2f0a3242d3fbc5c733abdc194bfdd564c1ad8&req=cyMgEMx6nIRZFb4V1XW4gaZNBtELFfNgeEWOJyYsMs1EgBJ8dVfYG%2B4HPe%2F%2B%0AiCGCuVy1Qq1ASTW%2BCYIoU48EpQ%3D%3D%0A)

:::callout backgroundColor="#feedaf80" borderColor="#fbc91633"
For a public article to be enabled for Fin, it must be published, part of a live [Help Center](https://www.intercom.com/help/en/articles/1970126-get-started-with-help-center) and in a [collection.](https://www.intercom.com/help/en/articles/56647-create-collections-in-your-help-center)
:::

---

For more tips on using public articles, visit our [Help Center.](https://www.intercom.com/help/en/articles/56641-create-an-article)
`

func TestStandardMarkdownIsUnchangedByIntercomProtections(t *testing.T) {
	template := []byte("# Guide\n\nHello {name}, see [docs](https://example.com).\n\n> Keep this quote.\n")
	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	for _, value := range entries {
		if strings.Contains(value, "{#") {
			t.Fatalf("ICU/brace text should not become a heading id token: %q", value)
		}
	}
	output := string(MarshalMarkdown(template, entries, false))
	if output != string(template) {
		t.Fatalf("marshal changed ordinary markdown\n got: %q\nwant: %q", output, template)
	}
}

func TestIntercomCalloutFenceDoesNotSwallowOtherDirectives(t *testing.T) {
	if isIntercomCalloutFence(":::tip") || isIntercomCalloutFence(":::note title") {
		t.Fatal("only :::callout / closing ::: should be Intercom fences")
	}
	if !isIntercomCalloutFence(`:::callout backgroundColor="#feedaf80"`) || !isIntercomCalloutFence(":::") {
		t.Fatal("expected Intercom callout fences to match")
	}
}

func TestMarshalIntercomArticleBodyMarkdownKeepsIntercomSyntax(t *testing.T) {
	template := []byte(intercomArticleBodyMarkdown)
	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	output := string(MarshalMarkdown(template, entries, false))
	for _, keep := range []string{
		"{#h_61bff2dd7a}",
		"{#h_bb4813e5c6}",
		"{#h_8b76258d80}",
		`:::callout backgroundColor="#feedaf80" borderColor="#fbc91633"`,
		"[Help Center](https://www.intercom.com/help/en/articles/1970126-get-started-with-help-center)",
		"[collection.](https://www.intercom.com/help/en/articles/56647-create-collections-in-your-help-center)",
		"To make your content easy to find, you need to:",
		"Use Articles to power Fin AI Agent and Fin AI Copilot",
	} {
		if !strings.Contains(output, keep) {
			t.Fatalf("marshal dropped %q\n%s", keep, output)
		}
	}
	if strings.Contains(output, "\x1eHLMDPH_") {
		t.Fatalf("marshal left unexpanded placeholders:\n%s", output)
	}
}

func TestIntercomCalloutFenceNotInQueue(t *testing.T) {
	entries, err := (MarkdownParser{}).Parse([]byte(intercomArticleBodyMarkdown))
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := entries["md.Paragraph[4]/line[0]"]; ok {
		t.Fatal(":::callout fence must not become md.Paragraph[4]/line[0]")
	}
	for key, value := range entries {
		if strings.Contains(value, ":::") {
			t.Fatalf("queue still has callout fence %s=%q", key, value)
		}
	}
	body, ok := entries["md.Paragraph[4]/line[1]"]
	if !ok || !strings.Contains(body, "For a public article to be enabled for Fin") {
		t.Fatalf("expected callout body to stay translatable, got %q", body)
	}
}
