# GourmetGuide

Rezept-Plattform für die Compensational Exercise in **Web Technologies ILV** (SS 2026, Tim Göttinger).

GourmetGuide sucht Rezepte über die externe [Spoonacular Food API](https://spoonacular.com/food-api), entweder nach Gericht oder nach Zutaten, die man zu Hause hat. Registrierte User speichern Rezepte in ihrem Kochbuch, bewerten sie und passen die Mengen an. Admins verwalten User und empfohlene Rezepte.

| Rolle | Darf |
|---|---|
| Guest | Rezepte suchen, filtern und mit Nährwerten ansehen |
| User | zusätzlich: Kochbuch mit Bewertung und Notizen, Portionsrechner, Zutaten-Alternativen |
| Admin | zusätzlich: User verwalten, Rezepte auf der Startseite empfehlen |

## Voraussetzungen

| Software | Version |
|---|---|
| [Node.js](https://nodejs.org) | 18 oder neuer (getestet mit 22 und 24) |
| npm | wird mit Node.js installiert |
| Spoonacular API Key | kostenlos, siehe unten |

Die Pakete werden mit `npm install` automatisch installiert (siehe `backend/package.json`): express, dotenv, jsonwebtoken, bcryptjs.

## Installation

```bash
git clone https://github.com/EinBaer/GourmetGuide.git
cd GourmetGuide/backend
npm install
```

## Konfiguration

Im Ordner `backend` die Vorlage kopieren und danach die Werte in `backend/.env` eintragen:

```bash
cp .env.example .env
```

(Windows: `copy .env.example .env`)

| Variable | Pflicht | Beschreibung |
|---|:-:|---|
| `JWT_SECRET` | ✓ | Beliebiger langer, geheimer Text zum Signieren der Login-Tokens |
| `SPOONACULAR_API_KEY` | ✓ | API Key von Spoonacular |
| `PORT` | | Port des Servers, Standard `3000` |
| `OWNER_USERNAME` | | Haupt-Admin, den andere Admins weder degradieren noch löschen können |

Fehlt eine Pflichtvariable, bricht der Server beim Start mit einer klaren Fehlermeldung ab.

### Spoonacular API Key

1. Kostenlosen Account auf [spoonacular.com/food-api/console](https://spoonacular.com/food-api/console) anlegen.
2. Unter **Profile → API Key** den Key kopieren und als `SPOONACULAR_API_KEY` eintragen.

Der kostenlose Tarif ist auf 50 Punkte pro Tag begrenzt. Die App spart Punkte, indem sie pro Suche 27 Rezepte auf einmal lädt ("Show more" kostet nichts) und API-Antworten 1 Stunde zwischenspeichert. Der aktuelle Verbrauch wird im Server-Terminal angezeigt. Ist das Limit erreicht, zeigt die App eine verständliche Meldung, Kochbuch und Chef's Picks funktionieren weiter.

## Build

Kein Build-Schritt nötig. Das Frontend ist reines HTML, CSS und JavaScript.

## Start

```bash
cd backend
npm start
```

Danach im Browser **http://localhost:3000** öffnen.

Client und Server starten gemeinsam: Der Express-Server liefert die API und das Frontend aus, ein separater Frontend-Server ist nicht nötig.

## Admin-Account anlegen

Neue Accounts bekommen immer die Rolle `user`. Den ersten Admin ernennt man per Skript:

1. In der App einen Account registrieren.
2. Im Ordner `backend` ausführen:
   ```bash
   npm run make-admin -- <benutzername>
   ```
3. Die Seite im Browser neu laden, der Admin-Tab erscheint.

Weitere Admins lassen sich danach direkt im Admin-Tab ernennen.
