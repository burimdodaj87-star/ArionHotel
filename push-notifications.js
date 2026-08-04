(() => {
  'use strict';

  const button = document.getElementById('enablePushButton');
  if (!button) return;

  const parking = String(document.body.dataset.parking || 'P5').toUpperCase();
  const publicKey = String(window.PARKING_PUSH?.vapidPublicKey || '').trim();
  let active = false;

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
    setButtonState('active', 'Benachrichtigungen aktiv', `${parking}: Push-Benachrichtigungen sind aktiv`);
    return subscription;
  }

  button.addEventListener('click', async () => {
    if (active) {
      window.alert(`${parking}: Benachrichtigungen sind bereits aktiv.`);
      return;
    }

    setButtonState('loading', 'Wird aktiviert …', 'Benachrichtigungen werden aktiviert');
    try {
      await ensurePush({ interactive: true });
      window.alert(`${parking}: Benachrichtigungen sind aktiv. Das Handy erhält 20 Minuten vor einem noch offenen Hoteltransfer eine Push-Warnung.`);
    } catch (error) {
      console.error(error);
      setButtonState('error', 'Glocke aktivieren', error.message || 'Aktivierung fehlgeschlagen');
      window.alert(error.message || 'Benachrichtigungen konnten nicht aktiviert werden.');
    }
  });

  (async () => {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      setButtonState('idle', 'Glocke aktivieren', '20 Minuten vorher Push-Benachrichtigung aktivieren');
      return;
    }

    setButtonState('loading', 'Wird geprüft …');
    try {
      await ensurePush({ interactive: false });
    } catch (error) {
      console.error(error);
      setButtonState('error', 'Glocke aktivieren', error.message || 'Push ist nicht aktiv');
    }
  })();
})();
