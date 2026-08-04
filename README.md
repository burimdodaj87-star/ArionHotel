# P6 Tagesliste

Statische Website mit zwei Seiten:

- `index.html`: CSV-Datei hochladen
- `dashboard.html`: Check-In- und Check-Out-Liste für das gewählte Datum

## Logik

- Es werden nur Zeilen mit `Parking = P6` berücksichtigt.
- Zeilen mit Status `CANCEL` werden nicht angezeigt.
- Check-In: Datum aus der Spalte `from` entspricht dem ausgewählten Datum.
- Check-Out: Datum aus der Spalte `to` entspricht dem ausgewählten Datum.
- Das Datumsfeld steht beim Öffnen der Seite immer auf dem heutigen Datum.
- Innerhalb jeder Liste wird nach Uhrzeit sortiert.
- Name, Telefonnummer und Preis werden direkt aus `Name`, `Phone` und `Pricing` übernommen.
- Die Häkchen werden lokal im Browser gespeichert.
- Enthält `Refferal`/`Referral` den Text `HOTEL_IMPORT`, wird **Arion Kunde** angezeigt; sonst **Panda Kunde**.
- Die CSV-Daten werden nur im Browser verarbeitet und nicht an einen Server gesendet.

## GitHub Pages

1. Alle Dateien dieses Ordners in ein GitHub-Repository hochladen.
2. In GitHub unter **Settings → Pages** als Quelle den Branch `main` und den Ordner `/root` auswählen.
3. Die veröffentlichte URL öffnen. `index.html` ist die Upload-Seite.

Beide Seiten müssen unter derselben GitHub-Pages-Adresse liegen, damit sie auf dieselben lokal gespeicherten CSV-Daten zugreifen können.


## Update auf die Kundentyp-Version

Nach dem Hochladen dieser Version die CSV-Datei einmal erneut über `index.html` importieren. Bereits gespeicherte Buchungen bleiben bestehen und werden anhand E-Mail + Telefon + `to` aktualisiert.


## Kundenstatus

- Enthält `Refferal` oder `Referral` irgendwo den Text `HOTEL_IMPORT` (zum Beispiel `HOTEL_IMPORT:805b225...`), wird **Arion Kunde** angezeigt.
- Andernfalls wird **Panda Kunde** angezeigt.
