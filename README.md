# Spielarchiv

Persönliches Videospiel-Archiv: Wertung von 1 bis 100, gespielte Stunden, Fortschritt in Prozent,
Zeitraum von–bis, Release, Plattform, Genres, Cover, Notizen — sortierbar, filterbar und in eigene
Listen einteilbar.

Statische Seite, läuft auf GitHub Pages. Die Daten liegen als JSON im Repo, jede Änderung wird ein
Commit. Cover und Metadaten kommen aus der Spieledatenbank [RAWG](https://rawg.io).

## Einrichten

**1 — Pages einschalten.** Repository → Settings → Pages → Source: „Deploy from a branch“, Branch
`main`, Ordner `/ (root)`. Nach ein bis zwei Minuten liegt die Seite unter
`https://<dein-account>.github.io/spielearchiv/`.

**2 — Eigenen Account eintragen.** Nur nötig, wenn du das Repo geforkt oder umbenannt hast:
in [`js/config.js`](js/config.js) `owner`, `repo`, `branch` und `path` anpassen.

**3 — GitHub-Token anlegen.** Ohne Token liest die Seite dein Archiv nur; Änderungen bleiben im
Browser. Für „Speichern per Klick“:

- github.com → Settings → Developer settings → **Personal access tokens → Fine-grained tokens**
- *Repository access:* **Only select repositories** → nur dieses Repo
- *Permissions → Repository permissions → Contents:* **Read and write** — mehr nicht
- *Expiration:* höchstens **ein Jahr** — ein weiter entferntes Datum lehnt GitHub ohne sichtbare
  Fehlermeldung ab, der Knopf tut dann scheinbar nichts
- Token einmal kopieren, er wird nur ein einziges Mal angezeigt

Dann auf der Seite **Einstellungen** öffnen, Token einfügen, **Verbindung prüfen**, **Übernehmen**.

**4 — RAWG-Key holen.** Kostenlos registrieren, dann auf [rawg.io/apidocs](https://rawg.io/apidocs)
eingeloggt auf „Get API Key“ klicken (Direktlink: <https://rawg.io/login/?forward=developer>). Key
kopieren und in den Einstellungen eintragen. Der Gratis-Tarif gilt für nicht-kommerzielle Projekte,
erlaubt 20.000 Anfragen im Monat und verlangt einen Rückverweis auf RAWG — der steht in der Fußzeile. Danach schlägt die Titelsuche im Eintrag Cover, Release,
Plattform und Genres vor.

Token und RAWG-Key werden **nicht** ins Repo geschrieben. Sie liegen im `localStorage` des jeweiligen
Browsers und gehen ausschließlich an `api.github.com` bzw. `api.rawg.io` — auf einem neuen Gerät also
einmal neu eintragen.

## Bedienung

| | |
|---|---|
| `n` | neues Spiel |
| `/` | Suchfeld |
| `⌘S` / `Strg+S` | jetzt auf GitHub speichern |
| `⌘⏎` / `Strg+⏎` | Eintrag speichern |

Die Seite hat vier Bereiche: **Archiv** (alle Spiele mit Kennzahlen und Filtern), **Hinzufügen**
(Datenbanksuche), **Listen** und **Mehr**. Sie stehen als Reiter unter dem Titel — auf schmalen
Bildschirmen klebt die Reiterleiste beim Scrollen oben fest.

Jede Liste merkt sich ihre eigene Reihenfolge und Ansicht (`sort` und `view` am Listeneintrag).

Der Chip oben rechts zeigt den Speicherstand: *ungespeichert* → *speichert* → *gespeichert*. Klick
darauf speichert sofort; sonst pusht die Seite drei Sekunden nach der letzten Änderung von selbst.
„Mehrere eintragen“ nimmt eine Liste entgegen — eine Zeile pro Spiel, optional `Titel | 87` mit
Wertung — und holt für jedes Spiel die Daten aus der Datenbank.

## Datenformat

`data/archiv.json`:

```json
{
  "version": 1,
  "updatedAt": "2026-09-07T12:00:00.000Z",
  "lists": [{ "id": "…", "name": "Top 10 2025", "createdAt": 0 }],
  "games": [{
    "id": "…",
    "title": "Elden Ring",
    "release": "2022-02-25",
    "platform": "PC",
    "genres": ["Action-RPG", "Open World"],
    "score": 95,
    "hours": 128.5,
    "avgHours": 58,
    "completion": 92,
    "startedOn": "2024-03-05",
    "finishedOn": "2024-04-21",
    "status": "gespielt",
    "notes": "",
    "cover": "https://media.rawg.io/…",
    "listIds": ["…"],
    "createdAt": 0
  }]
}
```

`status` ist `gespielt`, `spiele`, `backlog`, `wunschliste` oder `abgebrochen`. `wunschliste` ist
für Angekündigtes gedacht: Liegt `release` in der Zukunft, zeigen Karte und Tabelle statt der
Jahreszahl „erscheint TT.MM.JJJJ“. `release`, `startedOn` und
`finishedOn` stehen als ISO-Datum in der Datei, damit sich danach sortieren lässt; in der Oberfläche
werden sie als Tag.Monat.Jahr angezeigt und eingegeben. `cover` ist entweder eine Bild-URL
oder ein `data:`-URI aus einem eigenen Upload (beim Hochladen auf ca. 300×420 verkleinert).
`hours` sind deine eigenen Stunden, `avgHours` die übliche Spieldauer laut RAWG.

Weil das Repo öffentlich sein muss, damit Pages kostenlos ist: Dein Archiv ist lesbar für jeden, der
die Adresse kennt. Schreiben kann nur, wer den Token hat.

## Lokal ausprobieren

```
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Zum Speichern braucht es auch lokal den Token.
