(() => {
  'use strict';

  const fileInput = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const fileChip = document.getElementById('fileChip');
  const importButton = document.getElementById('importButton');
  const p5Button = document.getElementById('p5DashboardButton');
  const p6Button = document.getElementById('p6DashboardButton');
  const notice = document.getElementById('notice');
  let selectedFile = null;

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function showNotice(message, type) {
    notice.className = `notice visible ${type}`;
    notice.innerHTML = message;
  }

  function selectFile(file) {
    notice.className = 'notice';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      selectedFile = null;
      importButton.disabled = true;
      showNotice('Bitte eine CSV-Datei auswählen.', 'error');
      return;
    }
    selectedFile = file;
    importButton.disabled = false;
    fileChip.className = 'file-chip visible';
    fileChip.innerHTML = `<strong>${escapeHtml(file.name)}</strong><br>${formatFileSize(file.size)}`;
  }

  async function importSelectedFile() {
    if (!selectedFile) return;
    importButton.disabled = true;
    importButton.textContent = 'P5 und P6 werden online gespeichert …';
    notice.className = 'notice';

    try {
      const buffer = await selectedFile.arrayBuffer();
      const text = window.P6CSV.decodeCsv(buffer);
      const parsed = window.P6CSV.parseCsv(text);
      const allRows = window.P6CSV.normalizeRows(parsed);
      const p5Raw = allRows.filter((row) => String(row.parking || '').trim().toUpperCase() === 'P5');
      const p6Raw = allRows.filter((row) => String(row.parking || '').trim().toUpperCase() === 'P6');
      const uniqueRows = window.P6CSV.mergeRows([], [...p5Raw, ...p6Raw]).rows;
      const p5Count = uniqueRows.filter((row) => row.parking === 'P5').length;
      const p6Count = uniqueRows.filter((row) => row.parking === 'P6').length;

      if (!uniqueRows.length) {
        throw new Error('In der CSV wurden keine P5- oder P6-Buchungen gefunden.');
      }

      await window.P6DB.upsertBookings(uniqueRows, selectedFile.name);
      const importResult = await window.P6DB.addImport({
        fileName: selectedFile.name,
        fingerprint: window.P6CSV.hashString(text),
        csvRows: allRows.length,
        p5Rows: p5Count,
        p6Rows: p6Count,
      });

      const [onlineP5, onlineP6] = await Promise.all([
        window.P6DB.countBookings('P5'),
        window.P6DB.countBookings('P6'),
      ]);

      if (p5Count > 0 && onlineP5 === 0) {
        throw new Error('Die CSV enthält P5, aber Supabase erlaubt P5 noch nicht. Führe supabase-p5-p6-final.sql im SQL Editor aus.');
      }

      const warning = importResult.warning
        ? `<br><small>Hinweis zum Importprotokoll: ${escapeHtml(importResult.warning)}</small>`
        : '';

      showNotice(
        `<strong>Fertig – P5 und P6 sind online.</strong><br>` +
        `${allRows.length.toLocaleString('de-AT')} CSV-Zeilen gelesen.<br>` +
        `<strong>${p5Count.toLocaleString('de-AT')} P5</strong> und <strong>${p6Count.toLocaleString('de-AT')} P6</strong> aus dieser Datei verarbeitet.<br>` +
        `In Supabase: <strong>${onlineP5.toLocaleString('de-AT')} P5</strong> und <strong>${onlineP6.toLocaleString('de-AT')} P6</strong>.${warning}`,
        'success'
      );
      p5Button.hidden = false;
      p6Button.hidden = false;
    } catch (error) {
      console.error(error);
      showNotice(`<strong>Import nicht möglich.</strong><br>${escapeHtml(error.message || 'Unbekannter Fehler')}`, 'error');
    } finally {
      importButton.disabled = false;
      importButton.textContent = 'Daten hinzufügen';
    }
  }

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', () => selectFile(fileInput.files[0]));
  importButton.addEventListener('click', importSelectedFile);

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove('dragging');
    });
  });
  dropZone.addEventListener('drop', (event) => selectFile(event.dataTransfer.files[0]));
})();
