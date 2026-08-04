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

  function setDashboardButtonsVisible(visible) {
    p5Button.hidden = !visible;
    p6Button.hidden = !visible;
  }

  function selectFile(file) {
    notice.className = 'notice';
    setDashboardButtonsVisible(false);

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
    importButton.textContent = 'P5- und P6-Daten werden gespeichert …';
    notice.className = 'notice';

    try {
      const buffer = await selectedFile.arrayBuffer();
      const text = window.P6CSV.decodeCsv(buffer);
      const parsed = window.P6CSV.parseCsv(text);
      const allIncomingRows = window.P6CSV.normalizeRows(parsed);

      // Auf dieser Plattform werden ausschließlich P5 und P6 gespeichert.
      const supportedRows = allIncomingRows.filter((row) => ['P5', 'P6'].includes(String(row.parking || '').trim().toUpperCase()));
      const uniqueRows = window.P6CSV.mergeRows([], supportedRows).rows;
      const p5Count = uniqueRows.filter((row) => row.parking === 'P5').length;
      const p6Count = uniqueRows.filter((row) => row.parking === 'P6').length;

      if (uniqueRows.length === 0) {
        throw new Error('In dieser CSV-Datei wurden keine Buchungen mit Parking = P5 oder P6 gefunden.');
      }

      await window.P6DB.upsertBookings(uniqueRows, selectedFile.name);
      await window.P6DB.addImport({
        fileName: selectedFile.name,
        fingerprint: window.P6CSV.hashString(text),
        csvRows: allIncomingRows.length,
        p5Rows: p5Count,
        p6Rows: p6Count,
      });

      const [p5Summary, p6Summary] = await Promise.all([
        window.P6DB.getSummary('P5'),
        window.P6DB.getSummary('P6'),
      ]);

      showNotice(
        `<strong>CSV erfolgreich online gespeichert.</strong><br>` +
        `${allIncomingRows.length.toLocaleString('de-AT')} CSV-Zeilen gelesen. ` +
        `${p5Count.toLocaleString('de-AT')} P5- und ${p6Count.toLocaleString('de-AT')} P6-Buchungen wurden hinzugefügt oder aktualisiert.<br>` +
        `Online gespeichert: ${p5Summary.totalRows.toLocaleString('de-AT')} P5-Buchungen und ${p6Summary.totalRows.toLocaleString('de-AT')} P6-Buchungen.`,
        'success'
      );
      setDashboardButtonsVisible(true);
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
