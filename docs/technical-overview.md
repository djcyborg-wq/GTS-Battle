# Technischer Ueberblick

## Architektur
- **Server**: Express + Socket.IO (`server/src/index.ts`)
- **Client**: React + Vite (`client/src/App.tsx`)
- **Asset-Pipeline**: PPTX-Parser (`server/src/tools/extractSteps.ts`)

## Ablauf
1. Host startet Server/Client.
2. Spieler joinen ueber QR-URL.
3. Host startet Spiel (Countdown -> Running).
4. Spieler klicken Step-Bereiche.
5. Ranking wird live berechnet.
6. Bei Abschluss aller aktiven Spieler -> Spielende + Gewinneransage.
7. Ergebnisse werden persistiert.

## Wichtige API-Endpunkte
- `GET /api/health` Healthcheck
- `GET /api/config` Room/QR/Join-Konfiguration
- `POST /api/group-name` Gruppennamen setzen
- `POST /api/start` Runde starten
- `POST /api/save-results` Ergebnisse persistieren
- `POST /api/reset` Lobby/Room resetten
- `GET /api/group-summary` CSV-Auswertung aller Gruppen

## Socket-Events (Auszug)
- `player:join`, `player:hit`
- `player:joined`, `player:update`, `player:error`
- `host:state`
- `game:countdown`, `game:countdown-tick`, `game:started`, `game:finished`, `game:reset`
- `avatar:event`

## Datenhaltung
- Laufzeitstatus im Speicher (Room/Spieler/Phase/Progress)
- Persistenz:
  - `assets/results-history.json`
  - `assets/results/*.csv`
  - `assets/results/*.txt`

## PPTX-Extraktion
- Folie 1: Hintergrundbild
- Folie 2..n: Steps
- Klickbereiche aus roten/gestrichelten Gruppen-Elementen
- Ausgabe in `assets/steps.config.json`
- Geometrie wird auf sichtbares Bildkoordinatensystem umgerechnet

## Bekannte Betriebsanforderungen
- Stable WLAN/LAN fuer mehrere Handys
- Browser mit WebSpeech-Unterstuetzung fuer Avatar-Stimme
- Firewallfreigabe fuer lokale Ports (standard: 5173, 8080)
