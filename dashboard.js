(() => {
  'use strict';

  const CHECK_STATE_KEY = 'p6-tagesliste-check-state-v1';
  const loadingState = document.getElementById('loadingState');
  const noDataState = document.getElementById('noDataState');
  const dashboardContent = document.getElementById('dashboardContent');
  const datePicker = document.getElementById('datePicker');
  const datasetMeta = document.getElementById('datasetMeta');
  const checkInContainer = document.getElementById('checkInContainer');
  const checkOutContainer = document.getElementById('checkOutContainer');
  const checkInTotal = document.getElementById('checkInTotal');
  const checkOutTotal = document.getElementById('checkOutTotal');
  const completedTotal = document.getElementById('completedTotal');
  const checkInBadge = document.getElementById('checkInBadge');
  const checkOutBadge = document.getElementById('checkOutBadge');

  let rows = [];
  let currentCheckIns = [];
  let currentCheckOuts = [];
  let checkState = loadCheckState();

  function loadCheckState() {
    try {
      return JSON.parse(localStorage.getItem(CHECK_STATE_KEY) || '{}');
    } catch (_error) {
      return {};
    }
  }

  function saveCheckState() {
    localStorage.setItem(CHECK_STATE_KEY, JSON.stringify(checkState));
  }

  function stateKey(direction, row) {
    return `${direction}:${row.key}`;
  }

  function isCompleted(direction, row) {
    return checkState[stateKey(direction, row)] === true;
  }

  function setCompleted(direction, row, value) {
    const key = stateKey(direction, row);
    if (value) checkState[key] = true;
    else delete checkState[key];
    saveCheckState();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDateTime(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('de-AT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  function displayPrice(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '—';
    return /[€$£]/.test(raw) ? escapeHtml(raw) : `${escapeHtml(raw)} €`;
  }

  function phoneHref(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const cleaned = raw.replace(/[^\d+]/g, '');
    return cleaned ? `tel:${cleaned}` : '';
  }

  function sortByTime(a, b, field) {
    const aTime = a[field] || '99:99';
    const bTime = b[field] || '99:99';
    return aTime.localeCompare(bTime) || a.name.localeCompare(b.name, 'de');
  }

  function makeTable(list, direction) {
    if (list.length === 0) {
      return '<div class="empty-state">Für dieses Datum gibt es keine passenden Buchungen.</div>';
    }

    const isCheckIn = direction === 'checkin';
    const timeField = isCheckIn ? 'fromTime' : 'toTime';
    const actionLabel = isCheckIn ? 'Eingecheckt' : 'Ausgecheckt';
    const body = list.map((row) => {
      const completed = isCompleted(direction, row);
      const phone = String(row.phone ?? '').trim();
      const href = phoneHref(phone);
      const phoneHtml = phone
        ? (href ? `<a class="phone-link" href="${escapeHtml(href)}">${escapeHtml(phone)}</a>` : escapeHtml(phone))
        : '<span class="dataset-meta">Keine Nummer</span>';
      const customerType = window.P6CSV.customerType(row);
      const customerTypeClass = customerType === 'Arion Kunde' ? 'arion' : 'panda';

      return `
        <tr class="${completed ? 'completed' : ''}" data-row-key="${row.key}">
          <td class="time-cell">${escapeHtml(row[timeField] || '—')}</td>
          <td class="customer-name">${escapeHtml(row.name || 'Ohne Name')}</td>
          <td>${phoneHtml}</td>
          <td class="price-cell">${displayPrice(row.pricing)}</td>
          <td><span class="customer-status ${customerTypeClass}">${customerType}</span></td>
          <td>
            <label class="check-wrap">
              <input type="checkbox" data-direction="${direction}" data-key="${row.key}" ${completed ? 'checked' : ''}>
              <span>${actionLabel}</span>
            </label>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="table-scroll">
        <table class="booking-table">
          <thead><tr><th>Uhrzeit</th><th>Name</th><th>Telefon</th><th>Betrag</th><th>Status</th><th>Erledigt</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  function updateSummary() {
    const completed =
      currentCheckIns.filter((row) => isCompleted('checkin', row)).length +
      currentCheckOuts.filter((row) => isCompleted('checkout', row)).length;
    const total = currentCheckIns.length + currentCheckOuts.length;

    checkInTotal.textContent = String(currentCheckIns.length);
    checkOutTotal.textContent = String(currentCheckOuts.length);
    completedTotal.textContent = `${completed} / ${total}`;
    checkInBadge.textContent = String(currentCheckIns.length);
    checkOutBadge.textContent = String(currentCheckOuts.length);
  }

  function render() {
    const selectedDate = datePicker.value;
    const activeRows = rows.filter(window.P6CSV.isP6Active);

    currentCheckIns = activeRows
      .filter((row) => row.fromDate === selectedDate)
      .sort((a, b) => sortByTime(a, b, 'fromTime'));
    currentCheckOuts = activeRows
      .filter((row) => row.toDate === selectedDate)
      .sort((a, b) => sortByTime(a, b, 'toTime'));

    checkInContainer.innerHTML = makeTable(currentCheckIns, 'checkin');
    checkOutContainer.innerHTML = makeTable(currentCheckOuts, 'checkout');
    updateSummary();
  }

  function handleCheckboxChange(event) {
    const checkbox = event.target.closest('input[type="checkbox"][data-direction][data-key]');
    if (!checkbox) return;

    const direction = checkbox.dataset.direction;
    const list = direction === 'checkin' ? currentCheckIns : currentCheckOuts;
    const row = list.find((item) => item.key === checkbox.dataset.key);
    if (!row) return;

    setCompleted(direction, row, checkbox.checked);
    checkbox.closest('tr')?.classList.toggle('completed', checkbox.checked);
    updateSummary();
  }

  async function init() {
    datePicker.value = window.P6CSV.localToday();

    try {
      const dataset = await window.P6DB.getDataset();
      loadingState.hidden = true;

      if (!dataset || !Array.isArray(dataset.rows)) {
        noDataState.hidden = false;
        return;
      }

      rows = dataset.rows;
      const importCount = Number(dataset.importCount || 1);
      const importLabel = importCount === 1 ? '1 CSV-Import' : `${importCount.toLocaleString('de-AT')} CSV-Importe`;
      datasetMeta.textContent = `${importLabel} · zuletzt ${dataset.fileName || 'CSV-Datei'} am ${formatDateTime(dataset.importedAt)} · ${rows.length.toLocaleString('de-AT')} eindeutige Buchungen`;
      dashboardContent.hidden = false;
      render();
    } catch (error) {
      console.error(error);
      loadingState.textContent = 'Die gespeicherten CSV-Daten konnten nicht geladen werden.';
    }
  }

  datePicker.addEventListener('change', render);
  checkInContainer.addEventListener('change', handleCheckboxChange);
  checkOutContainer.addEventListener('change', handleCheckboxChange);
  init();
})();
