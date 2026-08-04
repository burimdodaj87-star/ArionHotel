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

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function importSelectedFile() {
    if (!selectedFile) return;
    importButton.disabled = true;
    importButton.textContent = 'CSV wird verarbeitet …';
    notice.className = 'notice';

    try {
      const buffer = await selectedFile.arrayBuffer();
      const text = window.P6CSV.decodeCsv(buffer);
      const parsed = window.P6CSV.parseCsv(text);
      const incomingRows = window.P6CSV.normalizeRows(parsed);
      const previousDataset = await window.P6DB.getDataset();
      const existingRows = Array.isArray(previousDataset?.rows) ? previousDataset.rows : [];
      const mergeResult = window.P6CSV.mergeRows(existingRows, incomingRows);
      const rows = mergeResult.rows;
      const today = window.P6CSV.localToday();
      const activeP6 = rows.filter(window.P6CSV.isP6Active);
      const todayCheckIns = activeP6.filter((row) => row.fromDate === today).length;
      const todayCheckOuts = activeP6.filter((row) => row.toDate === today).length;
      const arionCount = rows.filter((row) => window.P6CSV.customerType(row) === 'Arion Kunde').length;
      const pandaCount = rows.length - arionCount;
      const previousFileNames = Array.isArray(previousDataset?.fileNames)
        ? previousDataset.fileNames
        : (previousDataset?.fileName ? [previousDataset.fileName] : []);
      const fileNames = [...new Set([...previousFileNames, selectedFile.name])];
      const importCount = Number(previousDataset?.importCount || (existingRows.length ? 1 : 0)) + 1;

      await window.P6DB.saveDataset({
        fileName: selectedFile.name,
        fileNames,
        importCount,
        importedAt: new Date().toISOString(),
        dataVersion: 3,
        fingerprint: window.P6CSV.hashString(text),
        totalRows: rows.length,
        rows,
      });

      showNotice(
        `<strong>CSV erfolgreich hinzugefügt.</strong><br>` +
        `${incomingRows.length.toLocaleString('de-AT')} Zeilen gelesen: ` +
        `${mergeResult.added.toLocaleString('de-AT')} neue Buchungen ergänzt, ` +
        `${mergeResult.updated.toLocaleString('de-AT')} bereits vorhandene Buchungen erkannt und aktualisiert. ` +
        `Gespeichert sind jetzt ${rows.length.toLocaleString('de-AT')} eindeutige Buchungen. ` +
        `Davon ${arionCount.toLocaleString('de-AT')} Arion-Kunden und ${pandaCount.toLocaleString('de-AT')} Panda-Kunden. ` +
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
