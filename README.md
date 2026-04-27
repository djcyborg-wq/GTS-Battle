# GTS-Battle

Praesentationsreifes Multiplayer-Zeitspiel fuer Laptop-Host und Handy-Spieler.

## Funktionen
- Host-Dashboard mit QR-Join, Live-Ranking, Fortschritt und Startsteuerung.
- Spieler-Flow: Name eingeben, warten, Countdown, Step-basiertes Klickspiel, Abschlussseite.
- Echtzeit via Socket.IO (Lobby, Countdown, Running, Finished).
- PPTX-gestuetzte Step-Extraktion aus `Schneidmesser.pptx`.
- Automatische Ergebnisablage pro Gruppe als JSON, CSV und TXT.
- Avatar mit Video + Sprachausgabe (Katja Natural bevorzugt), Event-Ansagen.

## Projektstruktur
- `server/` Node.js + TypeScript API und Socket-Server
- `client/` React + Vite Frontend (Host + Player)
- `assets/` Step-Konfiguration und Ergebnisdateien
- `docs/` Runbook und technische Doku
- `test/` Smoke-Test

## Voraussetzungen
- Node.js 20+ (empfohlen 22)
- npm 10+
- Windows/Linux/macOS mit Browser (Chrome/Edge empfohlen)

## Lokales Setup
1. Abhaengigkeiten installieren:
   - Root: `npm install`
   - Server: `npm install --prefix server`
   - Client: `npm install --prefix client`
2. Konfiguration:
   - `.env.example` nach `.env` kopieren
3. PPTX in Steps umwandeln:
   - `npm run extract:steps`
4. Starten:
   - `npm run dev`

## Wichtige Commands
- `npm run dev` startet Server + Client parallel
- `npm run build` baut Server + Client
- `npm run start` startet den gebauten Server
- `npm run extract:steps` erzeugt `assets/steps.config.json` aus PPTX
- `npm run test:e2e` fuehrt den API-Smoke-Test aus

## URLS
- Host: `http://localhost:5173/host`
- Player: `http://localhost:5173/`
- Health: `http://localhost:8080/api/health`

## Ergebnisdateien
- Historie gesamt: `assets/results-history.json`
- Pro Gruppe:
  - `assets/results/<Gruppenname>.csv`
  - `assets/results/<Gruppenname>.txt`

## Host-Bedienung
- `Spiel starten`: startet 5s Countdown und Runde.
- `Ergebnisse speichern`: schreibt JSON/CSV/TXT.
- `Server reset`: neue Room-ID, neue Lobby, neue Gruppe moeglich.
- `Gruppenauswertung`: liest alle Gruppen-CSV und zeigt Kennzahlen.

## Netzwerk-Hinweise
- QR-Link wird automatisch auf LAN-IP aufgebaut (wenn moeglich).
- Bei Handy-Problemen im Firmennetz:
  - Firewall Ports 5173/8080 pruefen
  - gleiche WLAN-/Netzsegment-Verbindung sicherstellen

## Avatar/Sprach-Events
- Teambegruessung bei neuem Gruppennamen.
- Begruessung neuer Spieler mit variierenden Formulierungen.
- Ansage bei Fuehrungswechsel.
- Abschlussansage mit Gewinner-Glueckwunsch.
- Countdown-Sprachausgabe ist deaktiviert (gewollt).

## Technische Doku
- Betriebsablauf: `docs/presentation-runbook.md`
- Architektur/API: `docs/technical-overview.md`
