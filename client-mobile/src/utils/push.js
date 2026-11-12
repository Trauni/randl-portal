// Web-Push-Anmeldung. Funktioniert in Chrome/Android und (installiert) auf iOS >= 16.4.
const base64ZuBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export const pushUnterstuetzt = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export async function aktuelleAnmeldung() {
  if (!pushUnterstuetzt()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function pushEinschalten() {
  const { schluessel } = await fetch('/api/mitteilungen/push/schluessel', { credentials: 'include' }).then((r) => r.json())
  if (!schluessel) throw new Error('Push ist auf dem Server noch nicht eingerichtet')
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Benachrichtigungen sind im Browser blockiert')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ZuBytes(schluessel) }))
  const res = await fetch('/api/mitteilungen/push/anmelden', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  })
  if (!res.ok) throw new Error('Anmeldung am Server fehlgeschlagen')
}

export async function pushAusschalten() {
  const sub = await aktuelleAnmeldung()
  if (!sub) return
  await fetch('/api/mitteilungen/push/abmelden', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
  await sub.unsubscribe()
}
