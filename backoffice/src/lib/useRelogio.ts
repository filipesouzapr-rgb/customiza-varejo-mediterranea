import { useEffect, useState } from 'react'

export function useRelogio() {
  const [agora, setAgora] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return agora
}
