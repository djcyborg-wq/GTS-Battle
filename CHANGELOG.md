# Changelog

Alle nennenswerten Aenderungen an diesem Projekt werden hier dokumentiert.

## [Unreleased]

### Changed
- Browser-Tab in der Host-Ansicht auf `GTS-Battle` vereinheitlicht.
- Gruppenauswertung im Host erweitert: schnellste, langsamste und durchschnittliche Zeit sowie Teilnehmerzahl und schnellster Spieler pro Gruppe.
- Join-URL-Generierung fuer QR verbessert, damit Deployment-Hosts (inkl. Docker/Hetzner) korrekt auf `/join` verlinken.

### Added
- Loeschfunktion pro Gruppe in der Host-Gruppenauswertung (`🗑️`) inklusive API-Endpunkt `DELETE /api/group-summary/:group`.

## [1.0.0] - 2026-04-27

### Added
- Vollstaendige Multiplayer-Spielplattform mit Host- und Player-Ansicht (React + Socket.IO).
- Host-Dashboard mit QR-Join, Live-Ranking, Gruppenverwaltung, Start/Reset und Ergebnisspeicherung.
- Spielerfluss mit Join, Lobby, Countdown, Step-Gameplay, Hilfeeinblendung und Abschlussseite.
- PPTX-Parser fuer `Schneidmesser.pptx` mit Step-Extraktion und Geometrieabgleich auf das Hintergrundbild.
- Avatar-Integration mit Video, Katja-Natural-Sprachausgabe und Event-Ansagen.
- API-Endpunkte fuer Health, Konfiguration, Start, Reset, Gruppenauswertung und Ergebnisexport.
- Ergebnispersistenz als JSON sowie pro Gruppe als CSV/TXT.
- Gruppenauswertung ueber alle CSV-Dateien.
- Projektdokumentation (`README.md`, `docs/presentation-runbook.md`, `docs/technical-overview.md`).

### Changed
- Countdown-Sprachausgabe entfernt, um Sprachkonflikte und Aussetzer zu vermeiden.
- Sprachlogik verbessert (stabilere Ausgabe, priorisierte Stimmwahl auf Katja Natural).
- Host-Layout mehrfach optimiert (Avatar/QR-Groesse, Bedienbarkeit, kompakte Metadaten).
- Klickbereichsberechnung fuer bessere Uebereinstimmung mit der PPT-Darstellung verfeinert.

### Fixed
- Join-Flow: Spieler bleibt auf Namensseite bis zum echten Server-Join.
- Fehler bei Spielende-Erkennung (Abschluss bei allen aktiven Spielern).
- Namenskonflikte durch alte Offline-Spieler bereinigt.
- Sichtbarkeitsprobleme von Schaltflaechen bei Infoausgabe behoben.
- Countdown-Flackern in der Player-Ansicht behoben.

