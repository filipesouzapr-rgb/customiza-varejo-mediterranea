import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { ContaPagamentoSaldo } from '../../types'

interface Props {
  conta: ContaPagamentoSaldo
  onFechar: () => void
  onCriado: () => void
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

export function AporteModal({ conta, onFechar, onCriado }: Props) {
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hoje())
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    setSalvando(true)

    const { error } = await supabase.from('movimentacoes_conta_pagamento').insert({
      conta_pagamento_id: conta.id,
      tipo: 'entrada',
      valor: Number(valor),
      data,
      descricao: descricao.trim() || null,
    })

    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    onCriado()
    onFechar()
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <form
        onSubmit={handleSubmit}
        className="modal-caixa pedido-admin"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Aporte em {conta.nome}</h2>

        <label>
          Valor
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
          />
        </label>

        <label>
          Data
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
        </label>

        <label>
          Descrição (opcional)
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>

        {erro && <p className="erro">{erro}</p>}

        <div className="modal-acoes">
          <button type="button" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Registrar aporte'}
          </button>
        </div>
      </form>
    </div>
  )
}
