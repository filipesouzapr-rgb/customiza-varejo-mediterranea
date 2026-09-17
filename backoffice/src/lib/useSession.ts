import { useEffect, useState } from 'react'
import type { Session } from '@supabase/auth-js'
import { neon } from './neon'

// O token de acesso (JWT) dura só ~15 minutos - sem renovação automática,
// qualquer tela aberta por mais tempo que isso passa a falhar com
// "AuthRequiredError" na primeira chamada ao banco. startAutoRefresh()
// cobre a renovação em si; o poll a cada poucos minutos é reforço porque
// onAuthStateChange deste adapter não é confiável pra emitir todo evento de
// sessão - melhor não depender só dele pra manter o estado do React em dia.
const INTERVALO_REVALIDACAO_MS = 4 * 60 * 1000

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    neon.auth.startAutoRefresh()

    neon.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = neon.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    const intervalo = setInterval(() => {
      neon.auth.getSession().then(({ data }) => setSession(data.session))
    }, INTERVALO_REVALIDACAO_MS)

    return () => {
      subscription.subscription.unsubscribe()
      clearInterval(intervalo)
      neon.auth.stopAutoRefresh()
    }
  }, [])

  return { session, loading }
}
