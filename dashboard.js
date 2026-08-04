(() => {
  'use strict';

  const pageConfig = {
    parking: String(document.body.dataset.parking || 'P6').toUpperCase(),
    hotelLabel: String(document.body.dataset.hotelLabel || 'Arion Kunde'),
  };

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

  let currentCheckIns = [];
  let currentCheckOuts = [];
  let renderSequence = 0;

  function isCompleted(direction, row) {
    return direction === 'checkin' ? row.checkInCompleted === true : row.checkOutCompleted === true;
  }

  function setCompletedLocal(direction, row, value) {
    if (direction === 'checkin') row.checkInCompleted = value;
    else row.checkOutCompleted = value;
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
      const customerType = window.P6CSV.customerType(row, pageConfig.parking);
      const customerTypeClass = customerType === 'Panda Kunde' ? 'panda' : 'hotel';

      return `
        <tr class="${completed ? 'completed' : ''}" data-row-key="${escapeHtml(row.key)}">
          <td class="time-cell" data-label="Uhrzeit">${escapeHtml(row[timeField] || '—')}</td>
          <td class="customer-name" data-label="Name">${escapeHtml(row.name || 'Ohne Name')}</td>
          <td class="phone-cell" data-label="Telefon">${phoneHtml}</td>
          <td class="price-cell" data-label="Betrag">${displayPrice(row.pricing)}</td>
          <td class="status-cell" data-label="Status"><span class="customer-status ${customerTypeClass}">${escapeHtml(customerType)}</span></td>
          <td class="done-cell" data-label="Erledigt">
            <label class="check-wrap">
              <input type="checkbox" data-direction="${direction}" data-key="${escapeHtml(row.key)}" ${completed ? 'checked' : ''}>
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

  async function render() {
    const sequence = ++renderSequence;
    const selectedDate = datePicker.value;
    checkInContainer.innerHTML = '<div class="empty-state">Daten werden geladen …</div>';
    checkOutContainer.innerHTML = '<div class="empty-state">Daten werden geladen …</div>';

    try {
      const rows = await window.P6DB.getBookingsForDate(selectedDate, pageConfig.parking);
      if (sequence !== renderSequence) return;

      const activeRows = rows.filter((row) => window.P6CSV.isActiveForParking(row, pageConfig.parking));
      currentCheckIns = activeRows
        .filter((row) => row.fromDate === selectedDate)
        .sort((a, b) => sortByTime(a, b, 'fromTime'));
      currentCheckOuts = activeRows
        .filter((row) => row.toDate === selectedDate)
        .sort((a, b) => sortByTime(a, b, 'toTime'));

      checkInContainer.innerHTML = makeTable(currentCheckIns, 'checkin');
      checkOutContainer.innerHTML = makeTable(currentCheckOuts, 'checkout');
      updateSummary();
    } catch (error) {
      console.error(error);
      const message = escapeHtml(error.message || 'Daten konnten nicht geladen werden.');
      checkInContainer.innerHTML = `<div class="empty-state">${message}</div>`;
      checkOutContainer.innerHTML = `<div class="empty-state">${message}</div>`;
    }
  }

  async function handleCheckboxChange(event) {
    const checkbox = event.target.closest('input[type="checkbox"][data-direction][data-key]');
    if (!checkbox) return;

    const direction = checkbox.dataset.direction;
    const list = direction === 'checkin' ? currentCheckIns : currentCheckOuts;
    const row = list.find((item) => item.key === checkbox.dataset.key);
    if (!row) return;

    const previousValue = isCompleted(direction, row);
    const newValue = checkbox.checked;
    checkbox.disabled = true;
    setCompletedLocal(direction, row, newValue);
    checkbox.closest('tr')?.classList.toggle('completed', newValue);
    updateSummary();

    try {
      await window.P6DB.updateCompleted(row.key, direction, newValue);
    } catch (error) {
      console.error(error);
      setCompletedLocal(direction, row, previousValue);
      checkbox.checked = previousValue;
      checkbox.closest('tr')?.classList.toggle('completed', previousValue);
      updateSummary();
      window.alert(error.message || 'Status konnte nicht gespeichert werden.');
    } finally {
      checkbox.disabled = false;
    }
  }

  async function init() {
    datePicker.value = window.P6CSV.localToday();

    try {
      const summary = await window.P6DB.getSummary(pageConfig.parking);
      loadingState.hidden = true;

      if (!summary.totalRows) {
        noDataState.hidden = false;
        return;
      }

      const importLabel = summary.importCount === 1
        ? '1 CSV-Import'
        : `${summary.importCount.toLocaleString('de-AT')} CSV-Importe`;
      const latest = summary.latestImport;
      datasetMeta.textContent = latest
        ? `${importLabel} · zuletzt ${latest.file_name} am ${formatDateTime(latest.imported_at)} · ${summary.totalRows.toLocaleString('de-AT')} ${pageConfig.parking}-Buchungen online`
        : `${summary.totalRows.toLocaleString('de-AT')} ${pageConfig.parking}-Buchungen online`;

      dashboardContent.hidden = false;
      await render();
    } catch (error) {
      console.error(error);
      loadingState.textContent = error.message || 'Die Online-Daten konnten nicht geladen werden.';
    }
  }

  datePicker.addEventListener('change', render);
  checkInContainer.addEventListener('change', handleCheckboxChange);
  checkOutContainer.addEventListener('change', handleCheckboxChange);
  init();
})();
