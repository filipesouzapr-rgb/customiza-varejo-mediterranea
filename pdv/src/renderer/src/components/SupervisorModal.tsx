import { useState } from 'react'
import type { FormEvent } from 'react'
import { verificarSupervisor } from '../lib/verificarSupervisor'

interface Props {
  titulo: string
  onAutorizado: (supervisorId: string) => void
  onCancelar: () => void
}

export function SupervisorModal({ titulo, onAutorizado, onCancelar }: Props) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    setVerificando(true)

    const supervisorId = await verificarSupervisor(email, senha)

    setVerificando(false)

    if (!supervisorId) {
      setErro('Credenciais inválidas ou sem permissão de supervisor.')
      return
    }

    onAutorizado(supervisorId)
  }

  return (
    <div className="modal-fundo">
      <form onSubmit={handleSubmit} className="modal-caixa">
        <h2>{titulo}</h2>
        <p>Requer login de supervisor ou dono.</p>
        <label>
          E-mail do supervisor
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
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
        {erro && <p className="erro">{erro}</p>}
        <div className="modal-acoes">
          <button type="button" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={verificando}>
            {verificando ? 'Verificando...' : 'Autorizar'}
          </button>
        </div>
      </form>
    </div>
  )
}
