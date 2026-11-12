import { createContext, useContext, useEffect, useState } from 'react'
import { spheres as spheresApi } from './api'

const SpheresContext = createContext(null)

export function SpheresProvider({ children }) {
  const [data, setData] = useState([])

  useEffect(() => {
    spheresApi.all().then(setData).catch(() => {})
  }, [])

  // /api/tree/spheres exposes the compatibility slug as `id`.
  const unique = data.filter((s, i) => s?.id && data.findIndex(x => x.id === s.id) === i)
  const SPHERE_ORDER  = unique.map(s => s.id)
  const SPHERE_LABELS = Object.fromEntries(unique.map(s => [s.id, s.label]))
  const SPHERE_COLORS = Object.fromEntries(unique.map(s => [s.id, s.color]))

  return (
    <SpheresContext.Provider value={{ SPHERE_ORDER, SPHERE_LABELS, SPHERE_COLORS }}>
      {children}
    </SpheresContext.Provider>
  )
}

export function useSpheres() {
  return useContext(SpheresContext)
}
