# OmeTV

Ein zufälliger 1-zu-1 Video-Chat im Stil von OmeTV / Omegle. Nutzer werden
paarweise mit zufälligen Fremden verbunden und können per **WebRTC** (Video +
Audio) und Text chatten. Mit **„Weiter"** springt man zum nächsten Fremden.

## Funktionen

- 🎥 Peer-to-Peer Video & Audio über WebRTC (Server sieht den Stream nie)
- 🔀 Automatisches Matchmaking zufälliger Paare
- ⏭ „Weiter"-Button für den nächsten Fremden
- 🧑‍🤝‍🧑 Warteschlangen-Anzeige (eigene Position + Anzahl Wartende)
- ⌨️ Tastatursteuerung (Enter / Esc / X / C / M)
- 💬 Text-Chat mit Tipp-Indikator
- 📷 / 🎤 Kamera und Mikrofon stummschalten
- 👥 Live-Anzeige der Online-Nutzer

### Tastenkürzel

| Taste     | Aktion                          |
| --------- | ------------------------------- |
| `Enter`   | Start bzw. nächster Fremder     |
| `Esc`     | Weiter (nächster Fremder)       |
| `X`       | Stop                            |
| `C`       | Kamera an/aus                   |
| `M`       | Mikrofon an/aus                 |

## Technik

- **Backend:** Node.js, Express, Socket.IO (nur Signaling)
- **Frontend:** Vanilla JS, WebRTC, Socket.IO Client
- **STUN:** öffentliche Google-STUN-Server für NAT-Traversal

## Schnellstart

```bash
npm install
npm start
```

Dann im Browser öffnen: <http://localhost:3000>

Zum Testen zwei Tabs/Geräte öffnen und in beiden auf **Start** klicken.

> Hinweis: Kamerazugriff erfordert `https://` oder `localhost`. Hinter strengen
> NATs/Firewalls braucht WebRTC zusätzlich einen TURN-Server — der ist hier
> nicht enthalten.

## Konfiguration

| Variable | Standard | Beschreibung      |
| -------- | -------- | ----------------- |
| `PORT`   | `3000`   | HTTP-Server-Port  |

## Projektstruktur

```
server.js          Signaling-Server + Matchmaking
public/index.html  UI
public/style.css   Styles
public/app.js      WebRTC- und Socket-Logik im Browser
```

## Lizenz

MIT
