import { createContext, useContext, useEffect, useState } from 'react'
import { spheres as spheresApi } from './api'

const SpheresContext = createContext(null)

export function SpheresProvider({ children }) {
  const [data, setData] = useState([])

  useEffect(() => {
    spheresApi.all().then(setData).catch(() => {})
  }, [])

  const unique = data.filter((s, i) => data.findIndex(x => x.sphere === s.sphere) === i)
  const SPHERE_ORDER  = unique.map(s => s.sphere)
  const SPHERE_LABELS = Object.fromEntries(unique.map(s => [s.sphere, s.label]))
  const SPHERE_COLORS = Object.fromEntries(unique.map(s => [s.sphere, s.color]))

  return (
    <SpheresContext.Provider value={{ SPHERE_ORDER, SPHERE_LABELS, SPHERE_COLORS }}>
      {children}
    </SpheresContext.Provider>
  )
}

export function useSpheres() {
  return useContext(SpheresContext)
}
