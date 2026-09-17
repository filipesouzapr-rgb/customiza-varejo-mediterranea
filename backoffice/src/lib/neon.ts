import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js'

// Adapter Supabase-compatível: mantém a mesma API que o resto do app já usa
// (neon.auth.signInWithPassword, neon.auth.getSession, neon.auth.onAuthStateChange,
// neon.from(...).select()/.rpc(...)) - só troca o backend por trás, sem reescrever
// cada tela que consome esses métodos.
export const neon = createClient({
  auth: {
    url: import.meta.env.VITE_NEON_AUTH_URL,
    adapter: SupabaseAuthAdapter(),
  },
  dataApi: {
    url: import.meta.env.VITE_NEON_DATA_API_URL,
  },
})

// signOut() invalida a sessão certinho no servidor, mas o adapter não emite
// onAuthStateChange pra avisar o app - sem isso a tela continua exibida
// normalmente até um reload manual. Reload força o useSession a rechamar
// getSession(), que já reflete corretamente a sessão encerrada.
export async function sair() {
  await neon.auth.signOut()
  window.location.href = '/'
}
