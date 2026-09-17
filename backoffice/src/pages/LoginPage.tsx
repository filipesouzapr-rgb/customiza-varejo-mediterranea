import { useState } from 'react'
import type { FormEvent } from 'react'
import { neon } from '../lib/neon'
import { NOME_ESTABELECIMENTO } from '../lib/config'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    setEnviando(true)

    const { error } = await neon.auth.signInWithPassword({ email, password: senha })

    if (error) {
      setEnviando(false)
      setErro('E-mail ou senha inválidos.')
      return
    }

    // O adapter Supabase-compatível do neon-js não emite onAuthStateChange
    // depois de um signInWithPassword (só no carregamento inicial da
    // página) - sem isso, o app ficava preso na tela de login mesmo com a
    // sessão já criada. Reload completo força o useSession a rechamar
    // getSession(), que já reflete a sessão nova corretamente.
    window.location.href = '/'
  }

  return (
    <div className="login-page">
      <form onSubmit={handleSubmit} className="login-form">
        <h1>Customiza Varejo — {NOME_ESTABELECIMENTO}</h1>
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </label>
        {erro && <p className="login-erro">{erro}</p>}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
