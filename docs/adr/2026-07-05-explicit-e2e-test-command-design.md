# Explicit e2e test command

## Context

The web app keeps browser e2e flows under `src/e2e/`. Its default Vite+ test configuration includes only `*.test.ts` and `*.test.tsx` files and excludes `src/e2e/`, so an explicit path filter does not discover the e2e suite.

## Design

Add a dedicated Vite+ configuration that includes only `src/e2e/**/*.e2e.ts`. Give browser flows a 30-second test timeout while retaining Node as the test environment because Playwright manages the browser.

Expose the configuration through `test:e2e` in the web app's `package.json`. Add a separate `e2e:install` command for installing Chromium without adding that download to every test run. Provide `.env.e2e.example` for the required fixture-auth settings. The test command assumes PostgreSQL and the fixture-auth application are already running.

Read `E2E_BASE_URL` in the browser runner so the same flows can target a custom local port or staging deployment. Wait for the DOM content event during login, then let each flow's visible-element assertions determine when the page is ready.

Track the generated WorkOS user and organization IDs with each in-memory fixture session. Browser teardown calls an idempotent fixture-auth cleanup endpoint, which uses those exact IDs with the existing test cleanup helper. Cleanup runs before the browser closes on both successful and failed tests. It never searches by a broad name or ID prefix.

## Verification

Use Vite+'s list command with the e2e configuration to verify test discovery without requiring a running application. Add route coverage for cleanup and run the web app's standard test and check commands before finalizing.
