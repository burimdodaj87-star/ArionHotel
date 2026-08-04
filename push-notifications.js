(() => {
  'use strict';

  const button = document.getElementById('enablePushButton');
  if (!button) return;

  const parking = String(document.body.dataset.parking || 'P5').toUpperCase();
  const publicKey = String(window.PARKING_PUSH?.vapidPublicKey || '').trim();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const alarmStorageKey = 'parking-transfer-alarm-armed-v2';

  let active = false;
  let audioContext = null;
  let alarmArmed = false;
  let dueActive = false;
  let alarmInterval = null;
  let lastDueSignature = '';

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function urlBase64ToUint8Array(value) {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
  }

  function setButtonState(state, label, title = '') {
    button.classList.toggle('active', state === 'active');
    button.classList.toggle('error', state === 'error');
    button.disabled = state === 'loading';
    const text = button.querySelector('.push-button-label');
    if (text) text.textContent = label;
    button.title = title || label;
    active = state === 'active';
  }

  async function getRegistration() {
    const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
    await navigator.serviceWorker.ready;
    return registration;
  }

  async function saveSubscription(subscription) {
    await window.P6DB.savePushSubscription({
      subscription,
      parking,
      userAgent: navigator.userAgent,
    });
  }

  async function ensurePush({ interactive }) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      throw new Error('Dieses Handy oder dieser Browser unterstützt keine Push-Benachrichtigungen.');
    }
    if (!publicKey) {
      throw new Error('Der öffentliche Push-Schlüssel fehlt.');
    }
    if (isIos() && !isStandalone()) {
      throw new Error('Auf dem iPhone zuerst: Teilen → Zum Home-Bildschirm. Danach die App vom Home-Bildschirm öffnen und die Glocke antippen.');
    }

    let permission = Notification.permission;
    if (permission === 'default' && interactive) {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      throw new Error(permission === 'denied'
        ? 'Benachrichtigungen sind für diese Seite blockiert. Bitte in den Handy-Einstellungen erlauben.'
        : 'Bitte Benachrichtigungen erlauben.');
    }

    const registration = await getRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await saveSubscription(subscription);
    setButtonState('active', 'Alarm aktiv · testen', `${parking}: Push und Alarmton sind eingerichtet`);
    return { registration, subscription };
  }

  async function ensureAudioContext() {
    if (!AudioContextClass) {
      throw new Error('Dieser Browser unterstützt keinen Alarmton über die Webseite.');
    }
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') await audioContext.resume();
    return audioContext;
  }

  function tone(context, frequency, startOffset, duration, volume = 0.20) {
    const start = context.currentTime + startOffset;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
    gain.gain.setValueAtTime(volume, start + Math.max(0.03, duration - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  async function playAlarmPattern({ test = false } = {}) {
    if (!alarmArmed && !test) return;
    const context = await ensureAudioContext();
    tone(context, 880, 0.00, 0.32, 0.24);
    tone(context, 1046, 0.42, 0.32, 0.24);
    tone(context, 880, 0.84, 0.48, 0.26);
    if ('vibrate' in navigator) navigator.vibrate([350, 120, 350, 120, 650]);
  }

  function stopAlarmLoop() {
    if (alarmInterval) window.clearInterval(alarmInterval);
    alarmInterval = null;
    if ('vibrate' in navigator) navigator.vibrate(0);
  }

  async function startAlarmLoop() {
    if (!dueActive || !alarmArmed) return;
    if (alarmInterval) return;
    try {
      await playAlarmPattern();
    } catch (error) {
      console.warn('Alarmton wurde vom Browser blockiert:', error);
      return;
    }
    alarmInterval = window.setInterval(() => {
      if (!dueActive || !alarmArmed) {
        stopAlarmLoop();
        return;
      }
      playAlarmPattern().catch((error) => console.warn('Alarmton konnte nicht abgespielt werden:', error));
    }, 7000);
  }

  async function armAlarmAndTest() {
    alarmArmed = true;
    try {
      localStorage.setItem(alarmStorageKey, '1');
    } catch (_error) {
      // Alarm funktioniert auch ohne Local Storage in der aktuellen Sitzung.
    }
    await playAlarmPattern({ test: true });
    if (dueActive) await startAlarmLoop();
  }

  async function showLocalTestNotification(registration) {
    if (!registration || Notification.permission !== 'granted') return;
    await registration.showNotification(`${parking}: Test-Benachrichtigung`, {
      body: 'Push ist aktiv. Der Alarmton der geöffneten Seite wurde ebenfalls getestet.',
      icon: 'app-icon-192.png',
      badge: 'app-icon-192.png',
      tag: `parking-push-test-${parking}`,
      renotify: true,
      vibrate: [250, 100, 250],
      data: { url: parking === 'P6' ? 'dashboard.html' : 'p5.html', parking },
    });
  }

  window.ParkingTransferAlarm = {
    setDueTransfers(transfers = [], sourceParking = parking) {
      if (String(sourceParking || '').toUpperCase() !== parking) return;
      const openDue = Array.isArray(transfers) ? transfers.filter((item) => item && item.completed !== true) : [];
      dueActive = openDue.length > 0;
      lastDueSignature = openDue.map((item) => `${item.id || ''}:${item.date || ''}:${item.time || ''}`).join('|');

      if (!dueActive) {
        stopAlarmLoop();
        return;
      }
      if (alarmArmed) startAlarmLoop();
    },
    stop() {
      dueActive = false;
      lastDueSignature = '';
      stopAlarmLoop();
    },
    isArmed() {
      return alarmArmed;
    },
  };

  button.addEventListener('click', async () => {
    setButtonState('loading', 'Wird geprüft …', 'Push und Alarmton werden geprüft');
    try {
      const { registration } = await ensurePush({ interactive: true });
      await armAlarmAndTest();
      await showLocalTestNotification(registration);
      setButtonState('active', 'Alarm aktiv · testen', `${parking}: Push und Alarmton sind aktiv`);
      window.alert(`${parking}: Alarmton wurde gerade getestet. Bei einem fälligen Transfer klingelt die geöffnete Seite alle 7 Sekunden bis „Erledigt“. Zusätzlich wurde eine Test-Benachrichtigung gesendet.`);
    } catch (error) {
      console.error(error);
      setButtonState('error', 'Glocke aktivieren', error.message || 'Aktivierung fehlgeschlagen');
      window.alert(error.message || 'Benachrichtigungen und Alarmton konnten nicht aktiviert werden.');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && dueActive && alarmArmed) {
      startAlarmLoop();
    }
  });

  window.addEventListener('beforeunload', stopAlarmLoop);

  try {
    alarmArmed = localStorage.getItem(alarmStorageKey) === '1';
  } catch (_error) {
    alarmArmed = false;
  }

  (async () => {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      setButtonState('idle', 'Glocke aktivieren', 'Push und Alarmton aktivieren');
      return;
    }

    setButtonState('loading', 'Wird geprüft …');
    try {
      await ensurePush({ interactive: false });
      setButtonState('active', alarmArmed ? 'Alarm aktiv · testen' : 'Ton einmal aktivieren',
        alarmArmed ? `${parking}: Push ist aktiv; antippen zum Testen` : 'Einmal antippen, damit der Browser den Alarmton erlaubt');
    } catch (error) {
      console.error(error);
      setButtonState('error', 'Glocke aktivieren', error.message || 'Push ist nicht aktiv');
    }
  })();
})();
