# Fortbyte — Battle-Royale-Mini-Game

Ein spielbares 2D-Top-Down-Battle-Royale im **Fortnite-Stil**, komplett im
Browser mit reinem HTML5-Canvas (keine Abhängigkeiten, keine Build-Tools).

> ⚠️ Das ist **nicht** das echte Fortnite (ein riesiges AAA-3D-Spiel), sondern
> eine eigenständige, kleine Hommage an dessen Kern-Mechaniken.

## Spielprinzip

100 Kämpfer, ein schrumpfender Sturm, ein Gewinner. Sammle Material, **baue
Wände** zum Schutz, looten Waffen/Schild/Munition, schalte Gegner aus und
überlebe als Letzter für die **Victory Royale**.

## Features

- 🏃 Bewegung, Sprinten, Zielen mit der Maus
- 🔫 Schießen mit aufrüstbarer Waffe (Loot erhöht das Waffenlevel)
- 🔨 Spitzhacke zum Abbauen von Bäumen → Material
- 🧱 **Bauen** von Wänden (Fortnites Markenzeichen) als Deckung
- 🛡 Loot: Waffen-Upgrade, Munition, Schild, Holz
- 🤖 KI-Bots, die patrouillieren, Deckung suchen und auf dich schießen
- 🌩 Schrumpfender **Sturm-Kreis** mit steigendem Schaden
- 🗺 Minimap, Lebens-/Schild-Balken, Gegner-Zähler
- 🏆 Sieg-/Niederlage-Bildschirm mit Platzierung & Kills

## Steuerung

| Eingabe        | Aktion                          |
| -------------- | ------------------------------- |
| `W A S D`      | Bewegen                         |
| Maus           | Zielen                          |
| Linksklick     | Schießen / Abbauen              |
| `Q`            | Wand bauen (kostet 🪵 10)        |
| `1` / `2`      | Gewehr / Spitzhacke wählen      |
| `Shift`        | Sprinten                        |

## Starten

Keine Installation nötig — `fortnite/index.html` einfach im Browser öffnen.
Empfohlen über einen lokalen Server (für saubere Datei-Pfade):

```bash
cd fortnite
python3 -m http.server 8080
# dann http://localhost:8080 öffnen
```

## Dateien

```
index.html   UI, HUD und Start-/End-Screen
style.css    Styles
game.js      gesamte Spiel-Logik (Welt, Spieler, Bots, Sturm, Render-Loop)
```
