# Krron – Netlify-Version

Amazon-Style Shop für deinen Roleplay-Server. Läuft komplett auf Netlify:

- **Frontend:** statische Seite in `public/` (ohne Build-Schritt)
- **Backend:** eine Netlify Function (`netlify/functions/api.js`) mit der Logik in `netlify/lib/`
- **Datenbank:** Netlify Database (PostgreSQL). Schema und Startdaten liegen als Migrationen in `netlify/database/migrations/` und werden beim Deploy automatisch eingespielt
- **Bilder:** Uploads werden in der Datenbank gespeichert und über `/img/<id>` ausgeliefert

## Online bringen (ca. 10 Minuten)

**Wichtig:** Netlify Functions und die Datenbank funktionieren nicht per ZIP-Drag-and-Drop. Der Weg läuft über GitHub.

1. **ZIP entpacken.** Du brauchst den Inhalt des Ordners `krron-netlify`, nicht die ZIP-Datei selbst.
2. **GitHub-Repository anlegen:** auf github.com → *New repository* → Name z. B. `krron` → *Create*.
3. **Dateien hochladen:** im neuen Repository *uploading an existing file* wählen und den **gesamten Inhalt** des entpackten Ordners hineinziehen (`public`, `netlify`, `package.json`, `netlify.toml` …). Wenn der Browser Ordner nicht annimmt: GitHub Desktop oder `git push` verwenden. Danach *Commit changes*.
4. **Bei Netlify importieren:** *Add new project* → *Import an existing project* → GitHub → Repository `krron` wählen. Die Build-Einstellungen bleiben leer (alles steht in `netlify.toml`). *Deploy* klicken.
5. **Datenbank:** Netlify legt sie beim Deploy automatisch an, weil `@netlify/database` und die Migrationen vorhanden sind. Falls nach dem Deploy der Shop meldet „nicht erreichbar“: im Projekt unter *Data & Storage → Database* eine Datenbank erstellen und unter *Deploys* erneut deployen.
6. **Ersten Admin anlegen:** `https://DEINE-SEITE.netlify.app/#/setup` öffnen, E-Mail eingeben, das angezeigte Einmal-Passwort notieren, anmelden, neues Passwort vergeben. Fertig.

### Empfohlen: Setup absichern
Wer `/#/setup` zuerst aufruft, wird Admin. Setze deshalb in Netlify unter *Site configuration → Environment variables* den Wert `SETUP_KEY` (beliebiges Geheimwort) **vor** dem ersten Aufruf. Dieses Wort trägst du dann im Setup-Formular ein. Nach der Einrichtung ist `/setup` ohnehin gesperrt.

Optional: `SESSION_SECRET` (zufällige lange Zeichenfolge). Ohne Wert erzeugt der Shop beim ersten Start selbst einen und speichert ihn in der Datenbank.

## Funktionen

- Keine öffentliche Registrierung. Konten legt nur der Admin an (E-Mail, Telefon, Rolle, Fahrer-Notizen). Das Einmal-Passwort wird erzeugt und beim ersten Login muss der Nutzer es ändern.
- Gesperrte Konten sehen beim Login den Sperrgrund. Bestehende Sitzungen werden sofort ungültig.
- Katalog, Suche, Kategorien, Bestseller, Angebote, Warenkorb, Kasse (Lieferzone, Adresse, Bar oder Krron-Guthaben, ein Gutschein pro Bestellung).
- Stornierung durch den Kunden innerhalb der Stornofrist (Standard 6 Stunden, im Admin einstellbar). Lager, Gutschein und Guthaben werden zurückgebucht.
- Bewertungen mit Sternen und Text.
- Adminpanel: Nutzer, Rollen und Rechte, Bestellungen (Status mit Nachricht an den Kunden, Stornieren mit Grund), Produkte mit Bild-Upload, Kategorien, Gutscheine (12-stellig) und Rabattaktionen, Lieferzonen, UI-Editor (Hero-Slides, Werbebanner, Kacheln, Textboxen), Logo und Farben.
- Rolle „Lieferant“: sieht Bestellungen und Fahrer-Notizen und darf den Status ändern.

## Grenzen und Hinweise

- Bilder dürfen höchstens ca. 3,5 MB groß sein. Große Fotos verkleinert der Browser vor dem Upload automatisch. Bilder zählen zum Speicher der Datenbank.
- Passwörter werden mit **scrypt** gehasht (in Node eingebaut, gleichwertige Sicherheit wie bcrypt, keine zusätzlichen Pakete).
- Es gibt keine Sperre nach vielen falschen Login-Versuchen. Die langsame scrypt-Prüfung bremst Angriffe, ersetzt aber keine Ratenbegrenzung.
- Die Seite nutzt `#/…`-Adressen (Hash-Routing), damit keine Server-Weiterleitungen nötig sind.
- Netlify-Limits für Functions (Laufzeit, Anfragegröße) und die Datenbank-Kontingente hängen von deinem Netlify-Tarif ab.
