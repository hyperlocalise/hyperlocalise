# User appearance preferences

## Decision

Persist appearance, language, timezone, and clock on the signed-in user so they
follow the account across browsers. Split **Settings → You** into Account
(identity and notifications) and Preferences (appearance).

The user approved this direction on 14 November 2026.

## Settings

Account keeps email read-only from WorkOS and adds editable first and last name.
Name changes use the existing `PATCH /v1/me` path (WorkOS, then the local
`users` row). Notifications stay as they are.

Preferences holds:

- Theme: light, dark, or system. New rows default to light.
- Language: the supported app locales. Changing it writes the account, the
  `hl_locale` cookie, and the `/[lang]` URL together. After sign-in, a saved
  locale that disagrees with the path redirects once.
- Timezone: an IANA zone for personal timestamps. Reports and schedule labels
  that already pass `timeZone: "UTC"` stay on UTC so a workspace shares one
  clock.
- Time format: 12-hour or 24-hour.

The avatar menu keeps the theme control and language dialog. Both write through
the same preferences API as the Preferences page. Controls autosave.

## Storage

`user_preferences` is one row per user: `theme`, `locale`, `timezone`,
`hour_cycle`. Identity stays on `users`. Notification email prefs stay on
`user_notification_preferences`.

`GET /v1/me` returns `preferences` as `null` when the row is missing.
`PATCH /v1/me/preferences` replaces the bundle. The first authenticated load
PATCHes defaults from the client (theme light, locale from the URL, timezone
from `Intl`, hour cycle from that locale) so timezone is stored even if the
user never opens Preferences. After that, GET is read-only.

Marketing visitors keep device-only theme and language. They have no timezone
or clock setting.

## Formatting

A nested `IntlProvider` in the signed-in shell sets `timeZone` and a Unicode
hour-cycle locale (`en-u-hc-h23`). Call sites that pass `timeZone: "UTC"` keep
UTC. Iris may ignore `preferences` on `GET /v1/me` until it grows a UI.

## Validation

Invalid theme, unsupported locale, invalid IANA timezone, or hour cycle other
than `h12`/`h23` returns 400 and leaves the previous row unchanged.
