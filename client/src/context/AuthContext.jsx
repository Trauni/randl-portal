import { createContext, useContext, useState, useEffect } from 'react'
import { hasArea as hasAreaFn } from '../utils/permissions'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(data => {
        if (data.authenticated) {
          setUser(data.user)
        } else {
          setUser(null)
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const groups = user?.groups || []
  const role = user?.role
  const accessTags = user?.accessTags || []

  // Zentrale Pruefung. Bereiche siehe utils/permissions.js
  const hasArea = (area) => hasAreaFn(role, accessTags, area)

  const hasGroup = (g) => groups.includes(g)
  const hasTag = (t) => accessTags.includes(t)

  // Nur noch fuer HR-Ansichten verwendet (Urlaubskalender, Mitarbeiterverwaltung)
  const isAdmin = () => hasArea('hr.mitarbeiter')

  return (
    <AuthContext.Provider value={{ user, loading, role, accessTags, hasArea, hasGroup, hasTag, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden')
  return ctx
}
