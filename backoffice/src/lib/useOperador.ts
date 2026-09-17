import { useEffect, useState } from 'react'
import type { Session } from '@supabase/auth-js'
import { neon } from './neon'
import type { Operador } from '../types'

export function useOperador(session: Session | null) {
  const [operador, setOperador] = useState<Operador | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) {
      setOperador(null)
      setLoading(false)
      return
    }

    setLoading(true)
    neon
      .from('operadores')
      .select('id, nome, papel, ativo')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('useOperador: falha ao buscar operador', error)
        setOperador(data as Operador | null)
        setLoading(false)
      })
  }, [session])

  return { operador, loading }
}
