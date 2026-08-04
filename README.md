# Gemeinsame P5/P6-Tageslisten

Dies ist eine Erweiterung der bestehenden P6-Plattform. Es wird kein neues Repository benötigt.

- `dashboard.html`: P6-Tagesliste
- `p5.html`: P5-Tagesliste
- `index.html`: gemeinsamer CSV-Upload für P5 und P6

## Einmalige Aktualisierung

1. `supabase-p5-update.sql` im Supabase SQL Editor ausführen.
2. Die Webdateien im bestehenden GitHub-Repository hochladen und ersetzen.
3. `supabase-config.js` nicht ersetzen.
4. CSV einmal erneut hochladen, weil die frühere Version P5 nicht gespeichert hat.

## Regeln

- Gespeichert werden nur P5 und P6. P1 bis P4 werden ignoriert.
- CANCEL-Buchungen werden nicht angezeigt.
- Dubletten: E-Mail + Telefon + kompletter `to`-Wert.
- P5 + `HOTEL_IMPORT` enthalten: **Life Hotel Kunde**.
- P6 + `HOTEL_IMPORT` enthalten: **Arion Kunde**.
- Sonst: **Panda Kunde**.
- Häkchen werden für beide Ansichten online in Supabase gespeichert.
