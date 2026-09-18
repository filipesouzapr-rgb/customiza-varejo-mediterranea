import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

// Tela de configurações gerais do sistema - vai crescendo com mais seções
// de parâmetro ao longo do tempo. Primeira: trocar a própria senha.
export function ParametrosPage() {
  const [senhaNova, setSenhaNova] = useState('')
  const [senhaConfirmacao, setSenhaConfirmacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    setSucesso(false)

    if (senhaNova.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (senhaNova !== senhaConfirmacao) {
      setErro('As senhas não coincidem.')
      return
    }

    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senhaNova })
    setSalvando(false)

    if (error) {
      setErro(error.message)
      return
    }

    setSenhaNova('')
    setSenhaConfirmacao('')
    setSucesso(true)
  }

  return (
    <div className="parametros-page">
      <h2>Parâmetros</h2>

      <section className="fiado-detalhe">
        <h3>Alterar senha</h3>
        <form onSubmit={handleSubmit} className="parametros-form-senha">
          <label>
            Nova senha
            <input
              type="password"
              value={senhaNova}
              onChange={(e) => setSenhaNova(e.target.value)}
              minLength={6}
              required
            />
          </label>
          <label>
            Confirmar nova senha
            <input
              type="password"
              value={senhaConfirmacao}
              onChange={(e) => setSenhaConfirmacao(e.target.value)}
              minLength={6}
              required
            />
          </label>
          {erro && <p className="erro">{erro}</p>}
          {sucesso && <p className="sucesso">Senha alterada com sucesso.</p>}
          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      </section>
    </div>
  )
}
