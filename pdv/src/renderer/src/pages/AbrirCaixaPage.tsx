import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { TerminalFrame } from '../components/TerminalFrame'
import type { CaixaSessao } from '../types'

interface Props {
  operadorId: string
  onAberta: (sessao: CaixaSessao) => void
}

export function AbrirCaixaPage({ operadorId, onAberta }: Props) {
  const [valorAbertura, setValorAbertura] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    setEnviando(true)

    const { data, error } = await supabase
      .from('caixa_sessoes')
      .insert({ operador_id: operadorId, valor_abertura: Number(valorAbertura) || 0 })
      .select()
      .single()

    setEnviando(false)

    if (error) {
      setErro(error.message)
      return
    }

    onAberta(data as CaixaSessao)
  }

  return (
    <TerminalFrame titulo="ABRIR CAIXA">
      <div className="tela-central">
        <form onSubmit={handleSubmit} className="form-largo">
          <h1>Abrir caixa</h1>
          <label>
            Valor inicial de troco
            <input
              type="number"
              step="0.01"
              min="0"
              value={valorAbertura}
              onChange={(e) => setValorAbertura(e.target.value)}
              autoFocus
              required
            />
          </label>
          {erro && <p className="erro">{erro}</p>}
          <button type="submit" disabled={enviando}>
            {enviando ? 'Abrindo...' : 'Abrir caixa'}
          </button>
        </form>
      </div>
    </TerminalFrame>
  )
}
