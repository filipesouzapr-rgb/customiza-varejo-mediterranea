import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.RENDERER_VITE_SUPABASE_URL
const anonKey = import.meta.env.RENDERER_VITE_SUPABASE_ANON_KEY

/**
 * Verifica email/senha de um supervisor sem afetar a sessão do operador
 * logado no caixa: usa um client Supabase à parte, sem persistir sessão.
 * Retorna o id do operador autorizado (papel supervisor/dono), ou null se
 * a credencial for inválida ou não tiver papel de autorizar.
 */
export async function verificarSupervisor(email: string, senha: string): Promise<string | null> {
  const clienteTemporario = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await clienteTemporario.auth.signInWithPassword({
    email,
    password: senha,
  })

  if (error || !data.user) return null

  const { data: operador } = await clienteTemporario
    .from('operadores')
    .select('id, papel, ativo')
    .eq('id', data.user.id)
    .single()

  if (!operador || !operador.ativo) return null
  if (operador.papel !== 'supervisor' && operador.papel !== 'dono') return null

  return operador.id
}
