# Spielarchiv

Persönliches Archiv für **Spiele, Filme und Serien** auf einer gemeinsamen Skala von 1 bis 100:
Zeit, Fortschritt, Zeitraum, Erscheinungsdatum, Plattform beziehungsweise Anbieter, Genres und
Cover — sortierbar, filterbar und in eigene Listen einteilbar, die alle drei Medien mischen dürfen.

Statische Seite, läuft auf GitHub Pages. Die Daten liegen als JSON im Repo, jede Änderung wird ein
Commit. Spieldaten kommen von [RAWG](https://rawg.io), Film- und Seriendaten von
[TMDB](https://www.themoviedb.org).

Jedes Medium steht vollständig in einer Tabelle am Anfang von [`js/app.js`](js/app.js) (`MEDIA`):
Benennung, Zustände, Felder, Datenquelle, Zeichen. Ein weiteres Medium braucht einen Eintrag dort,
eine Farbe in [`css/app.css`](css/app.css) und eine Quelle — am übrigen Code ändert sich nichts.

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

**5 — TMDB-Key holen.** Für Filme und Serien. Konto auf
[themoviedb.org](https://www.themoviedb.org) anlegen, in den Kontoeinstellungen auf „API“, den
Bedingungen zustimmen, Key (v3 auth) kopieren und in den Einstellungen eintragen. Die
Anmeldeseite ist laut TMDB nicht für Telefone gemacht — das am Rechner erledigen. Der Gratis-Zugang
gilt für nicht-kommerzielle Projekte; TMDB verlangt den Hinweis, dass die Daten von dort stammen
und dass TMDB die Seite nicht geprüft hat — er steht in der Fußzeile.

Token, RAWG-Key und TMDB-Key werden **nicht** ins Repo geschrieben. Sie liegen im `localStorage` des jeweiligen
Browsers und gehen ausschließlich an `api.github.com`, `api.rawg.io` bzw. `api.themoviedb.org` —
auf einem neuen Gerät also einmal neu eintragen.

## Bedienung

| | |
|---|---|
| `n` | neuer Eintrag |
| `/` | Suchfeld |
| `⌘S` / `Strg+S` | jetzt auf GitHub speichern |
| `⌘⏎` / `Strg+⏎` | Eintrag speichern |

Die Seite hat fünf Bereiche: **Archiv** (alles mit Kennzahlen und Filtern), **Hinzufügen**
(Datenbanksuche), **Listen**, **Empfehlungen** und **Mehr**.

Im Archiv steht oben der Medienumschalter: **Alle · Spiele · Filme · Serien**. Er bestimmt, worauf
sich Kennzahlen, Filter und Begriffe beziehen — im Filmbereich heißt „Plattform“ etwa „Gesehen bei“
und „Gespielt“ heißt „Gesehen“. Jedes Medium hat eine eigene Farbe (Spiele petrol, Filme indigo,
Serien oliv), die den Bereich kennzeichnet: Umschalter, eine Spur im Hintergrund, die Kante des
Schubfachs und in der gemischten Ansicht ein Zeichen auf der Kachel. Die Aktionsfarbe bleibt überall
dieselbe, und die Wertungsfarben bleiben den Wertungen vorbehalten.

Die Empfehlungen gelten vorerst nur für Spiele, weil sie über die RAWG-Datenbank laufen. Sie
entstehen ohne Sprachmodell: Aus den Spielen mit einer Wertung ab 80 wird ein
gewichtetes Genre-Profil gebildet (Gewicht = Wertung − 79), damit werden die stärksten Genres in der
RAWG-Datenbank abgefragt, und die Treffer werden nach Profil-Übereinstimmung, Metacritic-Wertung und
Plattform bewertet. Was schon im Archiv steht, fällt raus. Jeder Vorschlag nennt, worüber er passt. Sie stehen als Reiter unter dem Titel — auf schmalen
Bildschirmen klebt die Reiterleiste beim Scrollen oben fest.

Jede Liste merkt sich ihre eigene Reihenfolge und Ansicht (`sort` und `view` am Listeneintrag).

Der Chip oben rechts zeigt den Speicherstand: *ungespeichert* → *speichert* → *gespeichert*. Klick
darauf speichert sofort; sonst pusht die Seite drei Sekunden nach der letzten Änderung von selbst.
„Mehrere eintragen“ nimmt eine Liste entgegen — eine Zeile pro Spiel, optional `Titel | 87` mit
Wertung — und holt für jedes Spiel die Daten aus der Datenbank. Das gilt nur für Spiele.

## Datenformat

`data/archiv.json`:

```json
{
  "version": 1,
  "updatedAt": "2026-09-07T12:00:00.000Z",
  "lists": [{ "id": "…", "name": "Top 10 2025", "createdAt": 0 }],
  "games": [{
    "id": "…",
    "media": "game",
    "title": "Elden Ring",
    "release": "2022-02-25",
    "platform": "PC",
    "genres": ["Action-RPG", "Open World"],
    "score": 95,
    "hours": 128.5,
    "avgHours": 58,
    "completion": 92,
    "playthroughs": 2,
    "priority": "",
    "startedOn": "2024-03-05",
    "finishedOn": "2024-04-21",
    "status": "gespielt",
    "cover": "https://media.rawg.io/…",
    "listIds": ["…"],
    "createdAt": 0
  }, {
    "id": "…",
    "media": "tv",
    "title": "Breaking Bad",
    "release": "2008-01-20",
    "platform": "Netflix",
    "genres": ["Drama", "Krimi"],
    "score": 97,
    "runtime": 47,
    "episodes": 62,
    "episodesSeen": 62,
    "hours": 48.6,
    "completion": 100,
    "cover": "https://image.tmdb.org/t/p/w780/…",
    "status": "gespielt",
    "listIds": [],
    "createdAt": 0
  }]
}
```

`media` ist `game`, `movie` oder `tv`. Fehlt das Feld, gilt der Eintrag als Spiel — ältere Einträge
mussten dafür nicht angefasst werden. Die Zustandsschlüssel in `status` sind für alle Medien gleich,
nur ihre Beschriftung wechselt; so funktionieren Filter, Sortierung und gemischte Listen über alle
Medien hinweg.

`runtime` sind Minuten: bei Filmen die Laufzeit, bei Serien die Länge einer Folge. Zusammen mit
`episodesSeen` und der Zahl der Durchgänge rechnet die App daraus `hours` und `completion` selbst
aus — bei Film und Serie sind das abgeleitete Werte, die trotzdem gespeichert werden, damit
Statistik und Sortierung über alle Medien mit denselben Feldern arbeiten. `avgHours` (übliche
Spieldauer laut RAWG) gibt es nur bei Spielen.

`genres` mischt die groben Genres der Datenbank mit Tags, die du selbst auswählst — im Eintrag schlägt
„Tags vorschlagen“ die spezifischen RAWG-Tags vor und filtert deren Steam-Eigenschaften heraus.

`status` ist `gespielt`, `spiele`, `backlog`, `wunschliste` oder `abgebrochen`. `wunschliste` ist
für Angekündigtes gedacht: Liegt `release` in der Zukunft, zeigen Karte und Tabelle statt der
Jahreszahl „erscheint TT.MM.JJJJ“. `release`, `startedOn` und
`finishedOn` stehen als ISO-Datum in der Datei, damit sich danach sortieren lässt; in der Oberfläche
werden sie als Tag.Monat.Jahr angezeigt und eingegeben. `cover` ist entweder eine Bild-URL
oder ein `data:`-URI aus einem eigenen Upload (beim Hochladen auf ca. 300×420 verkleinert).
`hours` sind bei Spielen deine eigenen Stunden, `playthroughs` die Zahl der Durchgänge
beziehungsweise wie oft du einen Film oder eine Serie gesehen hast. `priority` ist die Vorfreude von 1 bis 5 und wird nur bei
`backlog` und `wunschliste` erfasst und angezeigt.

Weil das Repo öffentlich sein muss, damit Pages kostenlos ist: Dein Archiv ist lesbar für jeden, der
die Adresse kennt. Schreiben kann nur, wer den Token hat.

## Lokal ausprobieren

```
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Zum Speichern braucht es auch lokal den Token.
