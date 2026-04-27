# GTS-Battle Praesentations-Runbook

## Vor dem Termin
- `.env.example` nach `.env` kopieren und Werte pruefen.
- `npm install` in `C:\Daten\GTS_Battle`, `server`, `client` ausfuehren.
- Mit `npm run extract:steps` die Step-Bereiche aus der PPTX neu generieren.
- `assets/steps.config.json` visuell pruefen und bei Bedarf Geometrie anpassen.

## Start am Praesentationstag
- Server + Client: `npm run dev` im Root.
- Host-Ansicht aufrufen: `http://localhost:5173/host`.
- QR-Code wird automatisch angezeigt.
- Optional Gruppenname setzen.
- Spieler beitreten lassen und dann Startknopf druecken.

## Testmatrix (Generalprobe)
- Laptop als Host und lokaler Player.
- 2-3 Handys im WLAN.
- Simulierter Verbindungsabbruch und Wiederverbindung.
- Ergebnis speichern und Datei `assets/results-history.json` pruefen.
