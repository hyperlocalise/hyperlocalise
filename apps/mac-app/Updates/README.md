# Sparkle appcast assets

Host a real `appcast.xml` (based on `appcast.example.xml`) at the URL in
`SU_FEED_URL` (`https://updates.hyperlocalise.com/mac/appcast.xml` by default).

Do not commit private Sparkle keys. Sign each DMG/ZIP with `sign_update` and
paste the EdDSA signature into the `sparkle:edSignature` attribute.
