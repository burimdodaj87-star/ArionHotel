-- P5-Erweiterung für die bestehende P6-Tagesliste.
-- Einmal vollständig im Supabase SQL Editor ausführen.
-- Bestehende P6-Buchungen und Häkchen bleiben erhalten.

alter table public.p6_imports
  add column if not exists p5_rows integer not null default 0;

-- Die bestehende Tabelle p6_bookings speichert ab jetzt P5 UND P6.
-- Der Tabellenname bleibt absichtlich gleich, damit keine bestehende P6-Datenmigration nötig ist.

drop policy if exists "P6 public insert" on public.p6_bookings;
drop policy if exists "P5 P6 public insert" on public.p6_bookings;
create policy "P5 P6 public insert"
  on public.p6_bookings for insert
  to anon, authenticated
  with check (parking in ('P5', 'P6'));

drop policy if exists "P6 public update" on public.p6_bookings;
drop policy if exists "P5 P6 public update" on public.p6_bookings;
create policy "P5 P6 public update"
  on public.p6_bookings for update
  to anon, authenticated
  using (parking in ('P5', 'P6'))
  with check (parking in ('P5', 'P6'));

grant select, insert, update on public.p6_bookings to anon, authenticated;
grant select, insert on public.p6_imports to anon, authenticated;

-- Optionaler Index für die zwei Ansichten.
create index if not exists p6_bookings_parking_from_date_idx
  on public.p6_bookings (parking, from_date);
create index if not exists p6_bookings_parking_to_date_idx
  on public.p6_bookings (parking, to_date);
