(() => {
  'use strict';

  const pageConfig = {
    parking: String(document.body.dataset.parking || 'P6').toUpperCase(),
    hotelLabel: String(document.body.dataset.hotelLabel || 'Arion Kunde'),
  };

  const loadingState = document.getElementById('loadingState');
  const dashboardContent = document.getElementById('dashboardContent');
  const datePicker = document.getElementById('datePicker');
  const datasetMeta = document.getElementById('datasetMeta');

  const checkInContainer = document.getElementById('checkInContainer');
  const transferContainer = document.getElementById('transferContainer');
  const checkOutContainer = document.getElementById('checkOutContainer');

  const checkInTotal = document.getElementById('checkInTotal');
  const transferTotal = document.getElementById('transferTotal');
  const checkOutTotal = document.getElementById('checkOutTotal');
  const completedTotal = document.getElementById('completedTotal');

  const checkInBadge = document.getElementById('checkInBadge');
  const transferBadge = document.getElementById('transferBadge');
  const checkOutBadge = document.getElementById('checkOutBadge');

  const openTransferButton = document.getElementById('openTransferModal');
  const transferModal = document.getElementById('transferModal');
  const transferForm = document.getElementById('transferForm');
  const transferName = document.getElementById('transferName');
  const transferPersons = document.getElementById('transferPersons');
  const transferDate = document.getElementById('transferDate');
  const transferTime = document.getElementById('transferTime');
  const transferFormError = document.getElementById('transferFormError');
  const saveTransferButton = document.getElementById('saveTransferButton');
  const toast = document.getElementById('toast');

  let currentCheckIns = [];
  let currentTransfers = [];
  let currentCheckOuts = [];
  let renderSequence = 0;
  let lastFocusedElement = null;
  let toastTimer = null;

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

  function formatDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('de-AT').format(date);
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
    return aTime.localeCompare(bTime) || String(a.name || '').localeCompare(String(b.name || ''), 'de');
  }

  function isBookingCompleted(direction, row) {
    return direction === 'checkin' ? row.checkInCompleted === true : row.checkOutCompleted === true;
  }

  function setBookingCompletedLocal(direction, row, value) {
    if (direction === 'checkin') row.checkInCompleted = value;
    else row.checkOutCompleted = value;
  }

  function customerStatus(row) {
    const label = window.P6CSV.customerType(row, pageConfig.parking);
    return {
      label,
      cssClass: label === 'Panda Kunde' ? 'panda' : 'hotel',
    };
  }

  function makeBookingList(list, direction) {
    if (!list.length) {
      const label = direction === 'checkin' ? 'Check-Ins' : 'Check-Outs';
      return `<div class="lane-empty"><strong>Keine ${label}</strong><span>Für das gewählte Datum gibt es keine Einträge.</span></div>`;
    }

    const isCheckIn = direction === 'checkin';
    const timeField = isCheckIn ? 'fromTime' : 'toTime';
    const actionLabel = isCheckIn ? 'Check-In erledigt' : 'Check-Out erledigt';

    return list.map((row) => {
      const completed = isBookingCompleted(direction, row);
      const phone = String(row.phone ?? '').trim();
      const href = phoneHref(phone);
      const phoneHtml = phone
        ? (href
          ? `<a class="operation-phone" href="${escapeHtml(href)}">${escapeHtml(phone)}</a>`
          : `<span>${escapeHtml(phone)}</span>`)
        : '<span class="muted-value">Keine Nummer</span>';
      const status = customerStatus(row);

      return `
        <article class="operation-item ${completed ? 'completed' : ''}" data-booking-key="${escapeHtml(row.key)}">
          <div class="operation-time">${escapeHtml(row[timeField] || '—')}</div>
          <div class="operation-body">
            <strong class="operation-name">${escapeHtml(row.name || 'Ohne Name')}</strong>
            <div class="operation-meta">
              ${phoneHtml}
              <span class="meta-separator" aria-hidden="true">·</span>
              <span class="operation-price">${displayPrice(row.pricing)}</span>
            </div>
            <div class="operation-tags">
              <span class="customer-status ${status.cssClass}">${escapeHtml(status.label)}</span>
            </div>
          </div>
          <label class="task-check" title="${actionLabel}">
            <input type="checkbox" data-direction="${direction}" data-key="${escapeHtml(row.key)}" ${completed ? 'checked' : ''}>
            <span class="task-check-ui" aria-hidden="true">✓</span>
            <span class="task-check-label">Erledigt</span>
          </label>
        </article>`;
    }).join('');
  }

  function makeTransferList(list, loadError = null) {
    if (loadError) {
      return `<div class="lane-error"><strong>Hoteltransfers nicht verfügbar</strong><span>${escapeHtml(loadError.message || 'Unbekannter Fehler')}</span></div>`;
    }

    if (!list.length) {
      return `
        <div class="lane-empty">
          <strong>Keine Hoteltransfers</strong>
          <span>Für das gewählte Datum wurde noch kein Transfer eingetragen.</span>
          <button class="btn btn-primary btn-small" type="button" data-open-transfer-inline>+ Transfer eintragen</button>
        </div>`;
    }

    return list.map((transfer) => {
      const completed = transfer.completed === true;
      const personsLabel = transfer.persons === 1 ? '1 Person' : `${transfer.persons} Personen`;

      return `
        <article class="operation-item transfer-item ${completed ? 'completed' : ''}" data-transfer-id="${escapeHtml(transfer.id)}">
          <div class="operation-time">${escapeHtml(transfer.time || '—')}</div>
          <div class="operation-body">
            <strong class="operation-name">${escapeHtml(transfer.name || 'Ohne Name')}</strong>
            <div class="operation-meta">
              <span class="persons-chip">${escapeHtml(personsLabel)}</span>
            </div>
            <div class="operation-tags">
              <span class="manual-chip">Hoteltransfer</span>
            </div>
          </div>
          <label class="task-check" title="Transfer erledigt">
            <input type="checkbox" data-transfer-id="${escapeHtml(transfer.id)}" ${completed ? 'checked' : ''}>
            <span class="task-check-ui" aria-hidden="true">✓</span>
            <span class="task-check-label">Erledigt</span>
          </label>
        </article>`;
    }).join('');
  }

  function updateSummary() {
    const completed =
      currentCheckIns.filter((row) => isBookingCompleted('checkin', row)).length +
      currentTransfers.filter((row) => row.completed === true).length +
      currentCheckOuts.filter((row) => isBookingCompleted('checkout', row)).length;

    const total = currentCheckIns.length + currentTransfers.length + currentCheckOuts.length;

    checkInTotal.textContent = String(currentCheckIns.length);
    transferTotal.textContent = String(currentTransfers.length);
    checkOutTotal.textContent = String(currentCheckOuts.length);
    completedTotal.textContent = `${completed} / ${total}`;

    checkInBadge.textContent = String(currentCheckIns.length);
    transferBadge.textContent = String(currentTransfers.length);
    checkOutBadge.textContent = String(currentCheckOuts.length);
  }

  function setLoadingLists() {
    const loading = '<div class="lane-loading"><span></span><span></span><span></span></div>';
    checkInContainer.innerHTML = loading;
    transferContainer.innerHTML = loading;
    checkOutContainer.innerHTML = loading;
  }

  async function render() {
    const sequence = ++renderSequence;
    const selectedDate = datePicker.value;
    setLoadingLists();

    try {
      let transferLoadError = null;
      const [rows, transfers] = await Promise.all([
        window.P6DB.getBookingsForDate(selectedDate, pageConfig.parking),
        window.P6DB.getHotelTransfersForDate(selectedDate, pageConfig.parking).catch((error) => {
          transferLoadError = error;
          return [];
        }),
      ]);

      if (sequence !== renderSequence) return;

      const activeRows = rows.filter((row) => window.P6CSV.isActiveForParking(row, pageConfig.parking));

      currentCheckIns = activeRows
        .filter((row) => row.fromDate === selectedDate)
        .sort((a, b) => sortByTime(a, b, 'fromTime'));

      currentTransfers = transfers
        .slice()
        .sort((a, b) => sortByTime(a, b, 'time'));

      currentCheckOuts = activeRows
        .filter((row) => row.toDate === selectedDate)
        .sort((a, b) => sortByTime(a, b, 'toTime'));

      checkInContainer.innerHTML = makeBookingList(currentCheckIns, 'checkin');
      transferContainer.innerHTML = makeTransferList(currentTransfers, transferLoadError);
      checkOutContainer.innerHTML = makeBookingList(currentCheckOuts, 'checkout');
      updateSummary();
    } catch (error) {
      console.error(error);
      const message = escapeHtml(error.message || 'Daten konnten nicht geladen werden.');
      checkInContainer.innerHTML = `<div class="lane-error"><strong>Daten konnten nicht geladen werden</strong><span>${message}</span></div>`;
      transferContainer.innerHTML = `<div class="lane-error"><strong>Daten konnten nicht geladen werden</strong><span>${message}</span></div>`;
      checkOutContainer.innerHTML = `<div class="lane-error"><strong>Daten konnten nicht geladen werden</strong><span>${message}</span></div>`;
    }
  }

  async function handleBookingCheckboxChange(event) {
    const checkbox = event.target.closest('input[type="checkbox"][data-direction][data-key]');
    if (!checkbox) return;

    const direction = checkbox.dataset.direction;
    const list = direction === 'checkin' ? currentCheckIns : currentCheckOuts;
    const row = list.find((item) => item.key === checkbox.dataset.key);
    if (!row) return;

    const previousValue = isBookingCompleted(direction, row);
    const newValue = checkbox.checked;
    const item = checkbox.closest('.operation-item');

    checkbox.disabled = true;
    setBookingCompletedLocal(direction, row, newValue);
    item?.classList.toggle('completed', newValue);
    updateSummary();

    try {
      await window.P6DB.updateCompleted(row.key, direction, newValue);
    } catch (error) {
      console.error(error);
      setBookingCompletedLocal(direction, row, previousValue);
      checkbox.checked = previousValue;
      item?.classList.toggle('completed', previousValue);
      updateSummary();
      showToast(error.message || 'Status konnte nicht gespeichert werden.', 'error');
    } finally {
      checkbox.disabled = false;
    }
  }

  async function handleTransferCheckboxChange(event) {
    const checkbox = event.target.closest('input[type="checkbox"][data-transfer-id]');
    if (!checkbox) return;

    const transfer = currentTransfers.find((item) => item.id === checkbox.dataset.transferId);
    if (!transfer) return;

    const previousValue = transfer.completed === true;
    const newValue = checkbox.checked;
    const item = checkbox.closest('.operation-item');

    checkbox.disabled = true;
    transfer.completed = newValue;
    item?.classList.toggle('completed', newValue);
    updateSummary();

    try {
      await window.P6DB.updateHotelTransferCompleted(transfer.id, newValue);
    } catch (error) {
      console.error(error);
      transfer.completed = previousValue;
      checkbox.checked = previousValue;
      item?.classList.toggle('completed', previousValue);
      updateSummary();
      showToast(error.message || 'Transferstatus konnte nicht gespeichert werden.', 'error');
    } finally {
      checkbox.disabled = false;
    }
  }

  function roundedCurrentTime() {
    const now = new Date();
    let minutes = Math.ceil(now.getMinutes() / 5) * 5;
    let hours = now.getHours();

    if (minutes >= 60) {
      minutes = 0;
      hours = (hours + 1) % 24;
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  function openTransferModal() {
    lastFocusedElement = document.activeElement;
    transferForm.reset();
    transferPersons.value = '1';
    transferDate.value = datePicker.value || window.P6CSV.localToday();
    transferTime.value = roundedCurrentTime();
    transferFormError.hidden = true;
    transferFormError.textContent = '';
    transferModal.hidden = false;
    document.body.classList.add('modal-open');

    window.requestAnimationFrame(() => {
      transferName.focus();
    });
  }

  function closeTransferModal() {
    if (saveTransferButton.disabled) return;
    transferModal.hidden = true;
    document.body.classList.remove('modal-open');
    transferFormError.hidden = true;
    transferFormError.textContent = '';

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  function showToast(message, type = 'success') {
    if (toastTimer) window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.hidden = false;

    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 3600);
  }

  async function handleTransferSubmit(event) {
    event.preventDefault();
    transferFormError.hidden = true;
    transferFormError.textContent = '';

    if (!transferForm.reportValidity()) return;

    const payload = {
      parking: pageConfig.parking,
      name: transferName.value,
      persons: Number(transferPersons.value),
      date: transferDate.value,
      time: transferTime.value,
    };

    saveTransferButton.disabled = true;
    saveTransferButton.textContent = 'Wird eingetragen …';

    try {
      await window.P6DB.addHotelTransfer(payload);
      transferModal.hidden = true;
      document.body.classList.remove('modal-open');

      if (datePicker.value !== payload.date) {
        datePicker.value = payload.date;
      }

      await render();
      showToast(`${payload.name.trim()} wurde für ${formatDate(payload.date)} um ${payload.time} Uhr eingetragen.`);
    } catch (error) {
      console.error(error);
      transferFormError.textContent = error.message || 'Hoteltransfer konnte nicht eingetragen werden.';
      transferFormError.hidden = false;
    } finally {
      saveTransferButton.disabled = false;
      saveTransferButton.textContent = 'Eintragen';
    }
  }

  async function init() {
    datePicker.value = window.P6CSV.localToday();

    try {
      const summary = await window.P6DB.getSummary(pageConfig.parking);
      loadingState.hidden = true;

      const importLabel = summary.importCount === 1
        ? '1 CSV-Import'
        : `${summary.importCount.toLocaleString('de-AT')} CSV-Importe`;
      const latest = summary.latestImport;

      if (summary.totalRows > 0 && latest) {
        datasetMeta.textContent =
          `${importLabel} · zuletzt ${latest.file_name} am ${formatDateTime(latest.imported_at)} · ` +
          `${summary.totalRows.toLocaleString('de-AT')} ${pageConfig.parking}-Buchungen online`;
      } else if (summary.totalRows > 0) {
        datasetMeta.textContent = `${summary.totalRows.toLocaleString('de-AT')} ${pageConfig.parking}-Buchungen online`;
      } else {
        datasetMeta.textContent = 'Noch keine CSV-Buchungen vorhanden · Hoteltransfers können trotzdem eingetragen werden';
      }

      dashboardContent.hidden = false;
      await render();
    } catch (error) {
      console.error(error);
      loadingState.textContent = error.message || 'Die Online-Daten konnten nicht geladen werden.';
    }
  }

  datePicker.addEventListener('change', render);
  checkInContainer.addEventListener('change', handleBookingCheckboxChange);
  checkOutContainer.addEventListener('change', handleBookingCheckboxChange);
  transferContainer.addEventListener('change', handleTransferCheckboxChange);
  transferContainer.addEventListener('click', (event) => {
    if (event.target.closest('[data-open-transfer-inline]')) openTransferModal();
  });

  openTransferButton.addEventListener('click', openTransferModal);
  transferForm.addEventListener('submit', handleTransferSubmit);

  transferModal.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-transfer]')) closeTransferModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !transferModal.hidden) closeTransferModal();
  });

  init();
})();
