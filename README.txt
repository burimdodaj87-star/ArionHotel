ALARM STOPPT BEIM ÖFFNEN DER HOTELTRANSFERS

In GitHub diese 4 Dateien ersetzen:
- dashboard.html
- p5.html
- dashboard.js
- push-notifications.js

Kein SQL ausführen.
Keine CSV erneut hochladen.
supabase-config.js nicht ersetzen.

Verhalten:
- Klick auf „Hoteltransfers öffnen“ stoppt den Alarmton sofort.
- Am Handy stoppt auch das Antippen des Tabs „Hoteltransfers“ den Alarmton.
- Die sichtbare Warnung bleibt, bis der Transfer als „Erledigt“ markiert wird.
- Kommt ein neuer fälliger Transfer hinzu, startet der Alarm erneut.
