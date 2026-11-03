import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ContaPagamentoSaldo } from '../../types'

interface Props {
  conta: ContaPagamentoSaldo
  onFechar: () => void
}

interface LinhaMovimentacao {
  id: string
  tipo: 'entrada' | 'saida'
  valor: number
  data: string
  descricao: string | null
  contas_pagar: { descricao: string } | null
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ExtratoContaPagamentoModal({ conta, onFechar }: Props) {
  const [movimentacoes, setMovimentacoes] = useState<LinhaMovimentacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('movimentacoes_conta_pagamento')
      .select('id, tipo, valor, data, descricao, contas_pagar(descricao)')
      .eq('conta_pagamento_id', conta.id)
      .order('data', { ascending: false })
      .order('criado_em', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setErro(error.message)
        } else {
          setMovimentacoes((data as unknown as LinhaMovimentacao[]) ?? [])
        }
        setCarregando(false)
      })
  }, [conta.id])

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-caixa pedido-admin" onClick={(e) => e.stopPropagation()}>
        <h2>Extrato — {conta.nome}</h2>
        <p className="venda-cliente-vazio">Saldo atual: {moeda(Number(conta.saldo_atual))}</p>

        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <div className="tabela-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td>{m.contas_pagar?.descricao ?? m.descricao ?? '—'}</td>
                    <td>
                      <span className={`badge ${m.tipo === 'entrada' ? 'badge-conciliado' : 'badge-pendente'}`}>
                        {m.tipo === 'entrada' ? 'Aporte' : 'Pagamento'}
                      </span>
                    </td>
                    <td>
                      {m.tipo === 'saida' ? '− ' : '+ '}
                      {moeda(Number(m.valor))}
                    </td>
                  </tr>
                ))}
                {movimentacoes.length === 0 && (
                  <tr>
                    <td colSpan={4}>Nenhuma movimentação registrada ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-acoes">
          <button type="button" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
