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

  function normalizeRows(parsed) {
    const aliases = {
      id: ['id'],
      name: ['name'],
      phone: ['phone', 'telefon', 'phonenumber'],
      pricing: ['pricing', 'price', 'betrag'],
      from: ['from', 'checkin', 'arrival'],
      to: ['to', 'checkout', 'departure'],
      status: ['status'],
      parking: ['parking', 'parkplatz'],
    };

    const available = new Set(parsed.normalizedHeaders);
    const resolved = {};

    Object.entries(aliases).forEach(([key, candidates]) => {
      resolved[key] = candidates.find((candidate) => available.has(candidate)) || '';
    });

    const required = ['name', 'phone', 'pricing', 'from', 'to', 'status', 'parking'];
    const missing = required.filter((key) => !resolved[key]);
    if (missing.length > 0) {
      const labels = {
        name: 'Name',
        phone: 'Phone',
        pricing: 'Pricing',
        from: 'from',
        to: 'to',
        status: 'Status',
        parking: 'Parking',
      };
      throw new Error(`Diese Spalten fehlen: ${missing.map((key) => labels[key]).join(', ')}`);
    }

    return parsed.records.map((record, index) => {
      const get = (key) => String(record.__normalized[resolved[key]] ?? '').trim();
      const from = parseDateTime(get('from'));
      const to = parseDateTime(get('to'));
      const id = resolved.id ? get('id') : '';
      const stableSource = [
        id,
        get('name'),
        get('phone'),
        from.raw,
        to.raw,
        get('parking'),
      ].join('|');

      return {
        key: hashString(stableSource),
        id,
        name: get('name'),
        phone: get('phone'),
        pricing: get('pricing'),
        fromRaw: from.raw,
        fromDate: from.date,
        fromTime: from.time,
        toRaw: to.raw,
        toDate: to.date,
        toTime: to.time,
        status: get('status'),
        parking: get('parking'),
        sourceRow: record.__rowNumber,
      };
    });
  }

  function isP6Active(row) {
    const parking = String(row.parking ?? '').trim().toUpperCase();
    const status = String(row.status ?? '').trim().toUpperCase();
    return parking === 'P6' && !status.startsWith('CANCEL');
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
    decodeCsv,
    hashString,
    isP6Active,
    localToday,
    normalizeRows,
    parseCsv,
    parseDateTime,
  };
})();
