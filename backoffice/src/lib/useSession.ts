import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { CHAVE_POPUP_VENCIMENTO_MOSTRADO } from './popupVencimentoHoje'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        try {
          sessionStorage.removeItem(CHAVE_POPUP_VENCIMENTO_MOSTRADO)
        } catch {
          // sessionStorage indisponivel (ex: navegacao privada)
        }
      }
      setSession(session)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  return { session, loading }
}
