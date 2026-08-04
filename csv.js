(() => {
  'use strict';

  function normalizeHeader(value) {
    return String(value ?? '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/[\s_\-]+/g, '');
  }

  function parseCsv(text) {
    const input = String(text ?? '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];

      if (inQuotes) {
        if (char === '"') {
          if (input[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n') {
        row.push(field);
        field = '';
        if (row.some((cell) => cell !== '')) rows.push(row);
        row = [];
      } else if (char !== '\r') {
        field += char;
      }
    }

    if (field !== '' || row.length > 0) {
      row.push(field);
      if (row.some((cell) => cell !== '')) rows.push(row);
    }

    if (inQuotes) {
      throw new Error('Die CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.');
    }
    if (rows.length < 2) {
      throw new Error('Die CSV-Datei enthält keine Buchungsdaten.');
    }

    const headers = rows[0].map((header) => String(header).trim());
    const normalizedHeaders = headers.map(normalizeHeader);
    const records = rows.slice(1).map((cells, rowIndex) => {
      const record = { __rowNumber: rowIndex + 2 };
      headers.forEach((header, index) => {
        record[header] = cells[index] ?? '';
      });
      record.__normalized = {};
      normalizedHeaders.forEach((header, index) => {
        record.__normalized[header] = cells[index] ?? '';
      });
      return record;
    });

    return { headers, normalizedHeaders, records };
  }

  function parseDateTime(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return { date: '', time: '', raw };

    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
      return {
        date: `${match[1]}-${match[2]}-${match[3]}`,
        time: match[4] ? `${match[4].padStart(2, '0')}:${match[5]}` : '',
        raw,
      };
    }

    match = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
      return {
        date: `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`,
        time: match[4] ? `${match[4].padStart(2, '0')}:${match[5]}` : '',
        raw,
      };
    }

    return { date: '', time: '', raw };
  }

  function hashString(value) {
    let hash = 0x811c9dc5;
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function normalizeEmail(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  function normalizePhone(value) {
    return String(value ?? '').replace(/\D/g, '');
  }

  function normalizedToValue(row) {
    const date = String(row?.toDate ?? '').trim();
    const time = String(row?.toTime ?? '').trim();
    if (date) return `${date} ${time}`.trim();
    return String(row?.toRaw ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  // Verbindliche Dublettenregel: E-Mail + Telefon + kompletter "to"-Wert.
  function bookingIdentity(row) {
    return [
      normalizeEmail(row?.email),
      normalizePhone(row?.phone),
      normalizedToValue(row),
    ].join('|');
  }

  function legacyIdentity(row) {
    return [normalizePhone(row?.phone), normalizedToValue(row)].join('|');
  }

  function normalizeRows(parsed) {
    const aliases = {
      id: ['id'],
      name: ['name'],
      phone: ['phone', 'telefon', 'phonenumber'],
      email: ['email', 'emailaddress', 'emailadresse'],
      pricing: ['pricing', 'price', 'betrag'],
      from: ['from', 'checkin', 'arrival'],
      to: ['to', 'checkout', 'departure'],
      status: ['status'],
      parking: ['parking', 'parkplatz'],
      referral: ['refferal', 'referral', 'referrer'],
    };

    const available = new Set(parsed.normalizedHeaders);
    const resolved = {};

    Object.entries(aliases).forEach(([key, candidates]) => {
      resolved[key] = candidates.find((candidate) => available.has(candidate)) || '';
    });

    const required = ['name', 'phone', 'email', 'pricing', 'from', 'to', 'status', 'parking', 'referral'];
    const missing = required.filter((key) => !resolved[key]);
    if (missing.length > 0) {
      const labels = {
        name: 'Name',
        phone: 'Phone',
        email: 'Email',
        pricing: 'Pricing',
        from: 'from',
        to: 'to',
        status: 'Status',
        parking: 'Parking',
        referral: 'Refferal/Referral',
      };
      throw new Error(`Diese Spalten fehlen: ${missing.map((key) => labels[key]).join(', ')}`);
    }

    return parsed.records.map((record) => {
      const get = (key) => String(record.__normalized[resolved[key]] ?? '').trim();
      const from = parseDateTime(get('from'));
      const to = parseDateTime(get('to'));
      const row = {
        id: resolved.id ? get('id') : '',
        name: get('name'),
        phone: get('phone'),
        email: get('email'),
        pricing: get('pricing'),
        fromRaw: from.raw,
        fromDate: from.date,
        fromTime: from.time,
        toRaw: to.raw,
        toDate: to.date,
        toTime: to.time,
        status: get('status'),
        parking: get('parking'),
        referral: get('referral'),
        sourceRow: record.__rowNumber,
      };
      row.key = hashString(bookingIdentity(row));
      return row;
    });
  }

  /**
   * Vorhandene Buchungen bleiben erhalten, neue werden ergänzt.
   * Bei gleicher Kombination aus E-Mail + Telefon + to ersetzt die neuere
   * CSV-Zeile die vorhandene Zeile, damit Status/Preis aktuell bleiben.
   */
  function mergeRows(existingRows, incomingRows) {
    const merged = new Map();
    const legacyByPhoneAndTo = new Map();
    let duplicates = 0;
    let added = 0;
    let updated = 0;

    for (const originalRow of Array.isArray(existingRows) ? existingRows : []) {
      const row = { ...originalRow };
      const hasEmail = normalizeEmail(row.email) !== '';

      if (hasEmail) {
        const identity = bookingIdentity(row);
        if (merged.has(identity)) {
          const previous = merged.get(identity);
          row.key = previous.key || row.key || hashString(identity);
          duplicates += 1;
        } else {
          row.key = row.key || hashString(identity);
        }
        merged.set(identity, row);
      } else {
        // Übergang für Daten, die mit der früheren Version ohne E-Mail gespeichert wurden.
        const legacy = legacyIdentity(row);
        const storageKey = `legacy:${legacy}:${row.key || hashString(JSON.stringify(row))}`;
        merged.set(storageKey, row);
        if (!legacyByPhoneAndTo.has(legacy)) legacyByPhoneAndTo.set(legacy, []);
        legacyByPhoneAndTo.get(legacy).push(storageKey);
      }
    }

    for (const incomingOriginal of Array.isArray(incomingRows) ? incomingRows : []) {
      const incoming = { ...incomingOriginal };
      const identity = bookingIdentity(incoming);
      const exactExisting = merged.get(identity);

      if (exactExisting) {
        incoming.key = exactExisting.key || incoming.key || hashString(identity);
        merged.set(identity, incoming);
        duplicates += 1;
        updated += 1;
        continue;
      }

      // Einmalige Migration: alte gespeicherte Zeile ohne E-Mail anhand Telefon + to ersetzen.
      const legacy = legacyIdentity(incoming);
      const legacyCandidates = legacyByPhoneAndTo.get(legacy) || [];
      const legacyKey = legacyCandidates.find((candidate) => merged.has(candidate));
      if (legacyKey) {
        const legacyRow = merged.get(legacyKey);
        merged.delete(legacyKey);
        incoming.key = legacyRow?.key || incoming.key || hashString(identity);
        merged.set(identity, incoming);
        duplicates += 1;
        updated += 1;
        continue;
      }

      incoming.key = incoming.key || hashString(identity);
      merged.set(identity, incoming);
      added += 1;
    }

    return {
      rows: Array.from(merged.values()),
      added,
      updated,
      duplicates,
    };
  }

  function isP6Active(row) {
    const parking = String(row.parking ?? '').trim().toUpperCase();
    const status = String(row.status ?? '').trim().toUpperCase();
    return parking === 'P6' && !status.startsWith('CANCEL');
  }

  function containsHotelImport(value) {
    return String(value ?? '').toUpperCase().includes('HOTEL_IMPORT');
  }

  function customerType(row) {
    // Entscheidend ist nicht eine exakte Übereinstimmung. Sobald der Inhalt
    // HOTEL_IMPORT enthält – z. B. HOTEL_IMPORT:805b225... – ist es ein Arion-Kunde.
    const knownReferralValues = [
      row?.referral,
      row?.refferal,
      row?.referrer,
      row?.Refferal,
      row?.Referral,
      row?.Referrer,
    ];

    if (knownReferralValues.some(containsHotelImport)) return 'Arion Kunde';

    // Zusätzliche Absicherung für ältere gespeicherte Datensätze oder abweichende
    // Schreibweisen des Spaltennamens: alle Referral-/Refferal-Felder durchsuchen.
    if (row && typeof row === 'object') {
      for (const [key, value] of Object.entries(row)) {
        const normalizedKey = normalizeHeader(key);
        if (['referral', 'refferal', 'referrer'].includes(normalizedKey) && containsHotelImport(value)) {
          return 'Arion Kunde';
        }
      }
    }

    return 'Panda Kunde';
  }

  function localToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function decodeCsv(arrayBuffer) {
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer);
    const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
    if (replacementCount === 0) return utf8;
    try {
      return new TextDecoder('windows-1252').decode(arrayBuffer);
    } catch (_error) {
      return utf8;
    }
  }

  window.P6CSV = {
    bookingIdentity,
    customerType,
    decodeCsv,
    hashString,
    isP6Active,
    localToday,
    mergeRows,
    normalizeRows,
    parseCsv,
    parseDateTime,
  };
})();
