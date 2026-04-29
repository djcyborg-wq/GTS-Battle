# Deployment & Hosting

Diese App benoetigt:
- Node.js 20+ (empfohlen 22)
- WebSocket-Unterstuetzung (Socket.IO)
- Dauerhaft laufenden Prozess (kein Sleep)
- Schreibzugriff auf `assets/` fuer Ergebnisdateien

## Empfehlung

### 1) Oracle Cloud Always Free (guenstigste Option: 0 EUR)
- **Kosten:** 0 EUR/Monat (im Always-Free-Kontingent)
- **Sleep-Verhalten:** Kein automatisches Sleep wie bei vielen Free-Webhostern
- **Eignung:** Sehr gut, wenn du mit VM-Setup klarkommst

### 2) Hetzner Cloud CX22 (stabilste Low-Cost Option)
- **Kosten:** ca. 4-6 EUR/Monat (je nach Region/Steuer)
- **Sleep-Verhalten:** Kein Sleep
- **Eignung:** Sehr gut fuer dauerhaften Betrieb mit wenig Wartung

## Warum Render/Railway/Fly fuer diesen Fall meist unpassend sind
- Viele kostenlose Web-Tiers schlafen ein oder haben harte Freigrenzen.
- Bei Echtzeit-Spielen mit WebSockets fuehrt Sleep oft zu schlechter UX.
- Fuer "immer online" brauchst du praktisch immer VM oder bezahlten Service.

## Setup auf VM (Oracle oder Hetzner) mit Docker

Die folgenden Schritte sind fuer Ubuntu 24.04 gedacht.

1. Server vorbereiten:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw
```

2. Docker installieren:
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

3. Projekt deployen:
```bash
git clone <DEIN_REPO_URL> /opt/gts-battle
cd /opt/gts-battle
cp .env.example .env
```

4. `.env` fuer Produktion anpassen (mindestens):
```env
HOST_PORT=8080
CLIENT_PUBLIC_URL=https://deine-domain.tld
ALLOW_ORIGINS=https://deine-domain.tld
STEPS_CONFIG_PATH=/app/assets/steps.config.json
RESULTS_PATH=/app/assets/results-history.json
RESULTS_DIR=/app/assets/results
```

5. Container bauen und starten:
```bash
docker build -t gts-battle:latest .
docker run -d --name gts-battle --restart unless-stopped -p 8080:8080 gts-battle:latest
```

6. Pruefen:
```bash
curl http://localhost:8080/api/health
```

## Domain + HTTPS (empfohlen)

Nutze einen Reverse Proxy (z. B. Caddy oder Nginx) vor Port 8080.
Caddy ist am einfachsten fuer automatisches HTTPS.

## Betriebshinweise

- Ergebnisdateien liegen im Container unter `/app/assets/results*`.
- Fuer Persistenz ueber Container-Neustarts hinweg ein Volume mounten:
```bash
docker run -d --name gts-battle --restart unless-stopped \
  -p 8080:8080 \
  -v /opt/gts-data/assets:/app/assets \
  gts-battle:latest
```
- Danach sind deine Spielergebnisse auf der VM dauerhaft gespeichert.
