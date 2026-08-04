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

  const mobileLaneTabs = document.querySelector('.mobile-lane-tabs');
  const mobileCheckInTotal = document.getElementById('mobileCheckInTotal');
  const mobileTransferTotal = document.getElementById('mobileTransferTotal');
  const mobileCheckOutTotal = document.getElementById('mobileCheckOutTotal');
  const mobileCompletedTotal = document.getElementById('mobileCompletedTotal');
  const laneElements = new Map(
    Array.from(document.querySelectorAll('.operation-lane[data-lane]'))
      .map((lane) => [lane.dataset.lane, lane]),
  );

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
  const transferAlert = document.getElementById('transferAlert');
  const transferAlertTitle = document.getElementById('transferAlertTitle');
  const transferAlertText = document.getElementById('transferAlertText');
  const showDueTransfersButton = document.getElementById('showDueTransfers');

  let currentCheckIns = [];
  let currentTransfers = [];
  let currentCheckOuts = [];
  let renderSequence = 0;
  let lastFocusedElement = null;
  let toastTimer = null;
  let activeMobileLane = 'checkin';
  let dueAlertTimer = null;

  function setActiveMobileLane(laneName, { focus = false } = {}) {
    if (!laneElements.has(laneName)) return;

    activeMobileLane = laneName;
    try {
      sessionStorage.setItem(`parking-active-lane-${pageConfig.parking}`, laneName);
    } catch (error) {
      // Die Ansicht funktioniert auch, wenn Session Storage blockiert ist.
    }

    laneElements.forEach((lane, name) => {
      lane.classList.toggle('mobile-active', name === laneName);
    });

    mobileLaneTabs?.querySelectorAll('[data-lane-target]').forEach((button) => {
      const isActive = button.dataset.laneTarget === laneName;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.tabIndex = isActive ? 0 : -1;
      if (isActive && focus) button.focus();
    });
  }

  function restoreMobileLane() {
    let savedLane = 'checkin';
    try {
      savedLane = sessionStorage.getItem(`parking-active-lane-${pageConfig.parking}`) || 'checkin';
    } catch (error) {
      savedLane = 'checkin';
    }
    setActiveMobileLane(laneElements.has(savedLane) ? savedLane : 'checkin');
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

  function transferDateTime(transfer) {
    const date = String(transfer?.date || '').trim();
    const time = String(transfer?.time || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
    const value = new Date(`${date}T${time}:00`);
    return Number.isNaN(value.getTime()) ? null : value;
  }

  function isTransferDue(transfer, now = new Date()) {
    if (transfer?.completed === true) return false;
    const transferAt = transferDateTime(transfer);
    if (!transferAt) return false;
    return transferAt.getTime() <= now.getTime() + (20 * 60 * 1000);
  }

  function dueTransferText(transfers) {
    if (!transfers.length) return '';
    const first = transfers[0];
    const persons = first.persons === 1 ? '1 Person' : `${first.persons} Personen`;
    const additional = transfers.length > 1 ? ` · plus ${transfers.length - 1} weiterer Transfer` : '';
    return `${first.time} Uhr · ${first.name || 'Ohne Name'} · ${persons}${additional}`;
  }

  async function refreshDueAlert() {
    if (!transferAlert) return;

    try {
      const today = window.P6CSV.localToday();
      const source = datePicker.value === today
        ? currentTransfers
        : await window.P6DB.getHotelTransfersForDate(today, pageConfig.parking);
      const due = source
        .filter((transfer) => isTransferDue(transfer))
        .sort((a, b) => sortByTime(a, b, 'time'));

      if (!due.length) {
        transferAlert.hidden = true;
        document.body.classList.remove('transfer-due-active');
        document.querySelector('[data-lane-target="transfer"]')?.classList.remove('urgent');
        return;
      }

      transferAlertTitle.textContent = due.length === 1
        ? `${pageConfig.parking}: Hoteltransfer ist fällig`
        : `${pageConfig.parking}: ${due.length} Hoteltransfers sind fällig`;
      transferAlertText.textContent = dueTransferText(due);
      transferAlert.hidden = false;
      document.body.classList.add('transfer-due-active');
      document.querySelector('[data-lane-target="transfer"]')?.classList.add('urgent');
    } catch (error) {
      console.error('Transferwarnung konnte nicht aktualisiert werden:', error);
    }
  }

  async function openDueTransfers() {
    const today = window.P6CSV.localToday();
    if (datePicker.value !== today) {
      datePicker.value = today;
      await render();
    }
    setActiveMobileLane('transfer', { focus: true });
    document.querySelector('.transfer-lane')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      const due = isTransferDue(transfer);
      const personsLabel = transfer.persons === 1 ? '1 Person' : `${transfer.persons} Personen`;

      return `
        <article class="operation-item transfer-item ${completed ? 'completed' : ''} ${due ? 'due' : ''}" data-transfer-id="${escapeHtml(transfer.id)}">
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

    if (mobileCheckInTotal) mobileCheckInTotal.textContent = String(currentCheckIns.length);
    if (mobileTransferTotal) mobileTransferTotal.textContent = String(currentTransfers.length);
    if (mobileCheckOutTotal) mobileCheckOutTotal.textContent = String(currentCheckOuts.length);
    if (mobileCompletedTotal) mobileCompletedTotal.textContent = `${completed} / ${total}`;
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
      await refreshDueAlert();
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
    await refreshDueAlert();

    try {
      await window.P6DB.updateHotelTransferCompleted(transfer.id, newValue);
    } catch (error) {
      console.error(error);
      transfer.completed = previousValue;
      checkbox.checked = previousValue;
      item?.classList.toggle('completed', previousValue);
      updateSummary();
      await refreshDueAlert();
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
      setActiveMobileLane('transfer');
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
    restoreMobileLane();

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
      dueAlertTimer = window.setInterval(refreshDueAlert, 30000);
    } catch (error) {
      console.error(error);
      loadingState.textContent = error.message || 'Die Online-Daten konnten nicht geladen werden.';
    }
  }

  mobileLaneTabs?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-lane-target]');
    if (!button) return;
    setActiveMobileLane(button.dataset.laneTarget);
  });

  mobileLaneTabs?.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(mobileLaneTabs.querySelectorAll('[data-lane-target]'));
    const currentIndex = buttons.findIndex((button) => button.dataset.laneTarget === activeMobileLane);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % buttons.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = buttons.length - 1;

    event.preventDefault();
    setActiveMobileLane(buttons[nextIndex].dataset.laneTarget, { focus: true });
  });

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

  showDueTransfersButton?.addEventListener('click', openDueTransfers);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !transferModal.hidden) closeTransferModal();
  });

  window.addEventListener('beforeunload', () => {
    if (dueAlertTimer) window.clearInterval(dueAlertTimer);
  });

  init();
})();
