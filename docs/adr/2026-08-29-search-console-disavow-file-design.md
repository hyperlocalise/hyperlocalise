# Search Console disavow file

## Context

Ahrefs flagged referring domains as spam: paid backlink shops, PBN-style
link sellers, and related spam hosts. Google Search Console ignores those
links only after we upload a disavow file. Hosting the file on the site
does not apply it.

## Decision

Keep a versioned domain list in the web app and serve Google's disavow format
at `/disavow.txt`. Each entry uses `domain:` so Google ignores the host and
subdomains. Download the file and upload it in Search Console for
hyperlocalise.com.

Do not add the path to the sitemap. The file is an operational artifact, not a
page for crawlers.

## Consequences

Adding or removing spam hosts is a code change. After the list changes, upload
the new file in Search Console again. Google may take weeks to recrawl and
reassess the links.
