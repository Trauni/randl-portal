import { useEffect, useState } from 'react'

// Read-only fuer Phase 1 -- Bearbeiten folgt in einer spaeteren Phase.
// Endpoint-Pfad /api/profile noch nicht gegen den echten profile.js-Router
// verifiziert -- Feldnamen hier auf camelCase umgestellt (fullName statt
// full_name), weil server.js/auth.js durchgaengig camelCase liefert
// (siehe /api/me: fullName, accessTags). Vor dem ersten Test einmal
// GET /api/profile im Browser ansehen und bei Abweichung anpassen.
export default function Profile() {
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    fetch('/api/profile', { credentials: 'include' })
      .then((res) => res.json())
      .then(setProfile)
  }, [])

  if (!profile) return <p>Lädt…</p>

  return (
    <section>
      <h2>Profil</h2>
      <dl className="profile-list">
        <dt>Name</dt><dd>{profile.fullName || profile.full_name}</dd>
        <dt>E-Mail</dt><dd>{profile.email}</dd>
        <dt>Telefon</dt><dd>{profile.phone || '–'}</dd>
        <dt>Abteilung</dt><dd>{profile.department || '–'}</dd>
      </dl>
      <p className="hint">
        Name, E-Mail, Telefon und Abteilung kommen aus Rentman und werden beim
        naechsten Sync ueberschrieben -- hier bewusst nicht editierbar (wie im
        Desktop-Portal, siehe Seite 188).
      </p>
    </section>
  )
}
