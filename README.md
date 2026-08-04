# P6 Tagesliste – Supabase-Version

Die Daten werden jetzt online in Supabase gespeichert. Dadurch sehen beide Arbeitsgeräte dieselben Buchungen und dieselben Check-In-/Check-Out-Häkchen.

## Einmalige Einrichtung

1. In Supabase **SQL Editor** öffnen.
2. Den vollständigen Inhalt von `supabase.sql` ausführen.
3. In Supabase unter **Project Settings → API** kopieren:
   - Project URL
   - Publishable key oder anon public key
4. Beide Werte in `supabase-config.js` eintragen.
5. Alle Dateien dieses Ordners in das GitHub-Repository hochladen und gleichnamige Dateien ersetzen.
6. Danach die CSV über `index.html` erneut hochladen.

## Regeln

- In Supabase werden nur Zeilen mit `Parking = P6` gespeichert. P1 bis P5 werden ignoriert.
- Status `CANCEL...` wird in der Tagesliste nicht angezeigt.
- Dubletten werden anhand `E-Mail + Telefonnummer + kompletter to-Wert` erkannt.
- Neu hochgeladene Daten aktualisieren eine bereits vorhandene Buchung mit derselben Kombination.
- Enthält Referral/Refferal `HOTEL_IMPORT`, wird `Arion Kunde` angezeigt; sonst `Panda Kunde`.
- Check-In- und Check-Out-Häkchen werden online in Supabase gespeichert.

Wichtig: In `supabase-config.js` nur den Publishable-/anon-Key verwenden, niemals den `service_role`-Key.
