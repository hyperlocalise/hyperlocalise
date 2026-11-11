=== Hyperlocalise ===
Contributors: hyperlocalise
Tags: translation, localization, multilingual, wpml, polylang
Requires at least: 6.2
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Translate posts and pages with Hyperlocalise and save the results as WPML or Polylang translations.

== Description ==

Hyperlocalise translates your content with your workspace's glossary, translation memory, and review workflow. This plugin connects WordPress to it without replacing your multilingual plugin.

* Send a post from the editor, or many posts from the posts list.
* Translations are saved through WPML or Polylang, linked to the source post.
* New translations are drafts. Published translations stay unchanged unless you allow overwrites.
* Titles, excerpts, block content, and chosen custom fields, including Yoast SEO and Rank Math fields, are translated.

The plugin calls the Hyperlocalise API at hyperlocalise.com and api.hyperlocalise.com when you send, check, or save translations. Post content you send is uploaded to your Hyperlocalise project. See the [Hyperlocalise terms](https://hyperlocalise.com/terms) and [privacy policy](https://hyperlocalise.com/privacy).

== Installation ==

1. Install and configure WPML or Polylang with your site languages.
2. Install and activate Hyperlocalise.
3. Go to Settings → Hyperlocalise, paste a personal access token, and choose your project.
4. Open a post and select Send for translation in the Hyperlocalise box.

== Frequently Asked Questions ==

= Does this replace WPML or Polylang? =

No. Your multilingual plugin keeps managing languages, URLs, and language switchers. Hyperlocalise writes translated content into the translations it manages.

= Which posts can be sent? =

Posts in the language that matches the project source locale. Translations cannot be sent as a source.

== Changelog ==

= 0.1.0 =
* First release: WPML and Polylang adapters, editor panel, bulk sending, and automatic saving when jobs finish.
