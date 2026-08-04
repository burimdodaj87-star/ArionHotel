# P6 Tagesliste

Statische Website mit zwei Seiten:

- `index.html`: Eine oder mehrere CSV-Dateien nacheinander hinzufügen
- `dashboard.html`: Check-In- und Check-Out-Liste für das gewählte Datum

## Import- und Dublettenlogik

- Bereits hochgeladene Buchungen bleiben gespeichert.
- Jede weitere CSV ergänzt die vorhandenen Daten.
- Eine Buchung gilt als doppelt, wenn die Kombination aus `Email` + `Phone` + `to` identisch ist.
- Wird eine doppelte Buchung erneut importiert, bleibt sie nur einmal erhalten. Die Daten aus der neueren CSV-Zeile ersetzen die ältere Zeile, damit zum Beispiel Status oder Preis aktuell sind.
- Unterschiede bei Groß-/Kleinschreibung der E-Mail sowie Leerzeichen und Zeichen in Telefonnummern werden bei der Erkennung vereinheitlicht.
- Die Häkchen bleiben bei erneut importierten Dubletten erhalten.

## Anzeigelogik

- Es werden nur Zeilen mit `Parking = P6` berücksichtigt.
- Zeilen mit Status `CANCEL` werden nicht angezeigt.
- Check-In: Datum aus der Spalte `from` entspricht dem ausgewählten Datum.
- Check-Out: Datum aus der Spalte `to` entspricht dem ausgewählten Datum.
- Das Datumsfeld steht beim Öffnen der Seite immer auf dem heutigen Datum.
- Innerhalb jeder Liste wird nach Uhrzeit sortiert.
- Name, Telefonnummer und Preis werden direkt aus `Name`, `Phone` und `Pricing` übernommen.
- Die Häkchen werden lokal im Browser gespeichert.
- Die CSV-Daten werden nur im Browser verarbeitet und nicht an einen Server gesendet.

## GitHub Pages

1. Alle Dateien dieses Ordners in dasselbe GitHub-Repository hochladen und vorhandene Dateien ersetzen.
2. In GitHub unter **Settings → Pages** als Quelle den Branch `main` und den Ordner `/root` auswählen.
3. Die veröffentlichte URL öffnen. `index.html` ist die Upload-Seite.

Beide Seiten müssen unter derselben GitHub-Pages-Adresse liegen, damit sie auf dieselben lokal gespeicherten CSV-Daten zugreifen können.
