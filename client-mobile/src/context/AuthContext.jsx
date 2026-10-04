import { createContext, useContext, useEffect, useState } from 'react'
import { hasArea as hasAreaFn } from '../utils/permissions.js'

const AuthContext = createContext(null)

// Verifiziert gegen den echten server.js (09.08.2026): /api/me ist immer 200
// und liefert { authenticated: false } oder { authenticated: true, user }.
// user-Felder laut server.js: id, username, fullName, email, groups, role,
// accessTags, avatarInitials -- camelCase, NICHT full_name/access_tags.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          window.location.href = '/auth/login?redirect=/mobile'
          return
        }
        setUser(data.user)
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const hasArea = (area) => hasAreaFn(user, area)

  return (
    <AuthContext.Provider value={{ user, loading, hasArea }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
