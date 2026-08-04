(() => {
  'use strict';

  const BOOKINGS_TABLE = 'p6_bookings';
  const IMPORTS_TABLE = 'p6_imports';
  const UPSERT_CHUNK_SIZE = 200;
  let client = null;

  function normalizeParking(value) {
    const parking = String(value || '').trim().toUpperCase();
    if (!['P5', 'P6'].includes(parking)) {
      throw new Error(`Nicht unterstützter Parkplatz: ${parking || 'leer'}`);
    }
    return parking;
  }

  function getClient() {
    if (client) return client;
    const config = window.P6_SUPABASE || {};
    const url = String(config.url || '').trim();
    const anonKey = String(config.anonKey || '').trim();

    if (!url || !anonKey || url.includes('HIER_SUPABASE') || anonKey.includes('HIER_SUPABASE')) {
      throw new Error('Supabase ist nicht eingerichtet. Project URL und Publishable Key fehlen in supabase-config.js.');
    }
    if (!window.supabase?.createClient) {
      throw new Error('Die Supabase-Bibliothek konnte nicht geladen werden. Internetverbindung prüfen.');
    }

    client = window.supabase.createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    return client;
  }

  function toDbRow(row, sourceFile) {
    return {
      dedupe_key: window.P6CSV.bookingIdentity(row),
      booking_id: String(row.id || ''),
      name: String(row.name || ''),
      phone: String(row.phone || ''),
      email: String(row.email || ''),
      pricing: String(row.pricing || ''),
      from_raw: String(row.fromRaw || ''),
      from_date: row.fromDate || null,
      from_time: String(row.fromTime || ''),
      to_raw: String(row.toRaw || ''),
      to_date: row.toDate || null,
      to_time: String(row.toTime || ''),
      booking_status: String(row.status || ''),
      parking: normalizeParking(row.parking),
      referral: String(row.referral || ''),
      source_row: Number.isFinite(Number(row.sourceRow)) ? Number(row.sourceRow) : null,
      source_file: String(sourceFile || ''),
      updated_at: new Date().toISOString(),
    };
  }

  function fromDbRow(row) {
    return {
      key: String(row.dedupe_key || ''),
      id: String(row.booking_id || ''),
      name: String(row.name || ''),
      phone: String(row.phone || ''),
      email: String(row.email || ''),
      pricing: String(row.pricing || ''),
      fromRaw: String(row.from_raw || ''),
      fromDate: row.from_date || '',
      fromTime: String(row.from_time || ''),
      toRaw: String(row.to_raw || ''),
      toDate: row.to_date || '',
      toTime: String(row.to_time || ''),
      status: String(row.booking_status || ''),
      parking: String(row.parking || '').toUpperCase(),
      referral: String(row.referral || ''),
      sourceRow: row.source_row,
      checkInCompleted: row.check_in_completed === true,
      checkOutCompleted: row.check_out_completed === true,
    };
  }

  async function upsertBookings(rows, sourceFile) {
    const supabaseClient = getClient();
    const dbRows = rows.map((row) => toDbRow(row, sourceFile));

    for (let start = 0; start < dbRows.length; start += UPSERT_CHUNK_SIZE) {
      const chunk = dbRows.slice(start, start + UPSERT_CHUNK_SIZE);
      const { error } = await supabaseClient
        .from(BOOKINGS_TABLE)
        .upsert(chunk, {
          onConflict: 'dedupe_key',
          ignoreDuplicates: false,
          defaultToNull: false,
        });

      if (error) {
        const hint = /row-level security|policy/i.test(error.message || '')
          ? ' Führe die Datei supabase-p5-p6-final.sql einmal im Supabase SQL Editor aus.'
          : '';
        throw new Error(`Supabase-Import fehlgeschlagen: ${error.message}.${hint}`);
      }
    }
    return dbRows.length;
  }

  // Das Importprotokoll darf niemals verhindern, dass erfolgreich gespeicherte Buchungen angezeigt werden.
  async function addImport({ fileName, fingerprint, csvRows, p5Rows, p6Rows }) {
    const payload = {
      file_name: String(fileName || ''),
      fingerprint: String(fingerprint || ''),
      csv_rows: Number(csvRows || 0),
      p5_rows: Number(p5Rows || 0),
      p6_rows: Number(p6Rows || 0),
    };

    let result = await getClient().from(IMPORTS_TABLE).insert(payload);
    if (result.error && /p5_rows/i.test(result.error.message || '')) {
      const fallback = { ...payload };
      delete fallback.p5_rows;
      result = await getClient().from(IMPORTS_TABLE).insert(fallback);
    }
    return { warning: result.error ? result.error.message : '' };
  }

  async function getBookingsForDate(date, parking = 'P6') {
    const selectedDate = String(date || '').trim();
    if (!selectedDate) return [];
    const selectedParking = normalizeParking(parking);

    const { data, error } = await getClient()
      .from(BOOKINGS_TABLE)
      .select('*')
      .eq('parking', selectedParking)
      .or(`from_date.eq.${selectedDate},to_date.eq.${selectedDate}`)
      .order('from_time', { ascending: true });

    if (error) throw new Error(`Buchungen konnten nicht geladen werden: ${error.message}`);
    return (data || []).map(fromDbRow);
  }

  async function countBookings(parking) {
    const selectedParking = normalizeParking(parking);
    const { count, error } = await getClient()
      .from(BOOKINGS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('parking', selectedParking);
    if (error) throw new Error(`${selectedParking}-Anzahl konnte nicht geladen werden: ${error.message}`);
    return count || 0;
  }

  async function getSummary(parking = 'P6') {
    const selectedParking = normalizeParking(parking);
    const supabaseClient = getClient();
    const [countResult, latestResult, importsCountResult] = await Promise.all([
      supabaseClient.from(BOOKINGS_TABLE).select('*', { count: 'exact', head: true }).eq('parking', selectedParking),
      supabaseClient.from(IMPORTS_TABLE).select('*').order('imported_at', { ascending: false }).limit(1).maybeSingle(),
      supabaseClient.from(IMPORTS_TABLE).select('*', { count: 'exact', head: true }),
    ]);

    if (countResult.error) throw new Error(`Buchungsanzahl konnte nicht geladen werden: ${countResult.error.message}`);
    // Falls das alte Importprotokoll nicht lesbar ist, funktionieren die Tageslisten trotzdem.
    return {
      totalRows: countResult.count || 0,
      importCount: importsCountResult.error ? 0 : (importsCountResult.count || 0),
      latestImport: latestResult.error ? null : (latestResult.data || null),
    };
  }

  async function updateCompleted(dedupeKey, direction, completed) {
    const field = direction === 'checkin' ? 'check_in_completed' : 'check_out_completed';
    const { error } = await getClient()
      .from(BOOKINGS_TABLE)
      .update({ [field]: Boolean(completed), updated_at: new Date().toISOString() })
      .eq('dedupe_key', dedupeKey);
    if (error) throw new Error(`Status konnte nicht gespeichert werden: ${error.message}`);
  }

  window.P6DB = {
    addImport,
    countBookings,
    getBookingsForDate,
    getSummary,
    updateCompleted,
    upsertBookings,
  };
})();
