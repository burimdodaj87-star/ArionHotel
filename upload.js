(() => {
  'use strict';

  const fileInput = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const fileChip = document.getElementById('fileChip');
  const importButton = document.getElementById('importButton');
  const dashboardButton = document.getElementById('dashboardButton');
  const notice = document.getElementById('notice');
  let selectedFile = null;

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function showNotice(message, type) {
    notice.className = `notice visible ${type}`;
    notice.innerHTML = message;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function selectFile(file) {
    notice.className = 'notice';
    dashboardButton.hidden = true;

    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      selectedFile = null;
      importButton.disabled = true;
      fileChip.className = 'file-chip';
      showNotice('Bitte eine Datei mit der Endung <strong>.csv</strong> auswählen.', 'error');
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
    importButton.textContent = 'P6-Daten werden online gespeichert …';
    notice.className = 'notice';

    try {
      const buffer = await selectedFile.arrayBuffer();
      const text = window.P6CSV.decodeCsv(buffer);
      const parsed = window.P6CSV.parseCsv(text);
      const allIncomingRows = window.P6CSV.normalizeRows(parsed);

      // Nur P6 wird nach Supabase übertragen. P1 bis P5 werden vollständig ignoriert.
      // Stornierte P6-Buchungen werden gespeichert, damit ein späterer CANCEL-Status
      // eine zuvor aktive Buchung online aktualisiert und aus der Tagesliste entfernt.
      const p6Rows = allIncomingRows.filter((row) => String(row.parking || '').trim().toUpperCase() === 'P6');
      const uniqueP6Rows = window.P6CSV.mergeRows([], p6Rows).rows;

      if (uniqueP6Rows.length === 0) {
        throw new Error('In dieser CSV-Datei wurden keine Buchungen mit Parking = P6 gefunden.');
      }

      await window.P6DB.upsertBookings(uniqueP6Rows, selectedFile.name);
      await window.P6DB.addImport({
        fileName: selectedFile.name,
        fingerprint: window.P6CSV.hashString(text),
        csvRows: allIncomingRows.length,
        p6Rows: uniqueP6Rows.length,
      });

      const summary = await window.P6DB.getSummary();
      const today = window.P6CSV.localToday();
      const todayRows = await window.P6DB.getBookingsForDate(today);
      const activeToday = todayRows.filter(window.P6CSV.isP6Active);
      const todayCheckIns = activeToday.filter((row) => row.fromDate === today).length;
      const todayCheckOuts = activeToday.filter((row) => row.toDate === today).length;

      showNotice(
        `<strong>CSV erfolgreich online gespeichert.</strong><br>` +
        `${allIncomingRows.length.toLocaleString('de-AT')} CSV-Zeilen gelesen. ` +
        `${uniqueP6Rows.length.toLocaleString('de-AT')} eindeutige P6-Buchungen wurden hinzugefügt oder aktualisiert. ` +
        `In Supabase sind jetzt ${summary.totalRows.toLocaleString('de-AT')} P6-Buchungen gespeichert. ` +
        `Für heute: ${todayCheckIns} Check-Ins und ${todayCheckOuts} Check-Outs.`,
        'success'
      );
      dashboardButton.hidden = false;
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
