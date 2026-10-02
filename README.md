# Gewicht – PWA

Tägliches Gewichtstracking mit Trend (Gap-korrigierter EMA), 28-Tage-Rate, Zielprognose und Monatsstatistik.
Daten lokal im Gerät; optional Sync als `weights.json` in einem eigenen Dropbox-App-Ordner.

## Deploy (GitHub Pages)
1. Neues Repo, alle Dateien ins Root hochladen.
2. Settings → Pages → Branch `main` / root.
3. Im Safari öffnen → Teilen → „Zum Home-Bildschirm“.
4. Bei jedem Update: `V` in `sw.js` hochzählen.

Im Repo liegen **keine** Gewichtsdaten.

## Dropbox einrichten (einmalig)
1. https://www.dropbox.com/developers/apps → *Create app*
2. *Scoped access* → *App folder* → Name z. B. `WeightTracker`
3. Tab *Permissions*: `files.content.read` + `files.content.write` aktivieren → *Submit*
4. Tab *Settings*: **App key** kopieren (kein Secret nötig, keine Redirect-URI nötig)
5. In der App → Einstellungen: App Key eintragen → „Bei Dropbox anmelden“ → angezeigten Code kopieren → einfügen → „Verbinden“

Sync: beim Start, bei Rückkehr in die App und 1,5 s nach jeder Änderung. Konflikte: pro Datum gewinnt die neuere Änderung; Löschungen werden als Tombstone synchronisiert.
