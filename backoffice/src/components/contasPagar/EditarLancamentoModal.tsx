import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type {
  ContaPagarRegra,
  Fornecedor,
  FormaPagamentoContasPagar,
  GrupoDespesa,
} from '../../types'

interface Props {
  contaId: string
  fornecedores: Fornecedor[]
  grupos: GrupoDespesa[]
  onFechar: () => void
  onAtualizado: () => void
}

interface ContaDetalhe {
  id: string
  fornecedor_id: string | null
  grupo_id: string
  descricao: string
  valor: number
  desconto: number
  data_vencimento: string
  data_pagamento: string | null
  forma_pagamento: FormaPagamentoContasPagar | null
  status: 'nao_conciliado' | 'conciliado'
  regra_id: string | null
}

const rotuloForma: Record<FormaPagamentoContasPagar, string> = {
  dinheiro: 'Dinheiro',
  cartao_debito: 'Cartão débito',
  cartao_credito: 'Cartão crédito',
  pix: 'Pix',
  transferencia: 'Transferência',
  boleto: 'Boleto',
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

export function EditarLancamentoModal({ contaId, fornecedores, grupos, onFechar, onAtualizado }: Props) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [conta, setConta] = useState<ContaDetalhe | null>(null)
  const [regra, setRegra] = useState<ContaPagarRegra | null>(null)
  const [aplicarRegraToda, setAplicarRegraToda] = useState(false)

  const [fornecedorId, setFornecedorId] = useState('')
  const [grupoId, setGrupoId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [desconto, setDesconto] = useState('')
  const [dataVencimento, setDataVencimento] = useState('')

  const [dataPagamento, setDataPagamento] = useState(hoje())
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoContasPagar>('dinheiro')

  async function carregar() {
    setCarregando(true)
    setErro(null)

    const { data, error } = await supabase.from('contas_pagar').select('*').eq('id', contaId).single()

    if (error || !data) {
      setErro(error?.message ?? 'Conta não encontrada.')
      setCarregando(false)
      return
    }

    const c = data as ContaDetalhe
    setConta(c)
    setFornecedorId(c.fornecedor_id ?? '')
    setGrupoId(c.grupo_id)
    setDescricao(c.descricao)
    setValor(String(c.valor))
    setDesconto(String(c.desconto))
    setDataVencimento(c.data_vencimento)

    if (c.regra_id) {
      const { data: regraData } = await supabase
        .from('contas_pagar_regras')
        .select('*')
        .eq('id', c.regra_id)
        .single()
      setRegra((regraData as ContaPagarRegra) ?? null)
    } else {
      setRegra(null)
    }

    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contaId])

  async function salvarEdicao() {
    setErro(null)
    setSalvando(true)

    if (aplicarRegraToda && regra) {
      const { error } = await supabase.rpc('editar_regra_contas_pagar', {
        p_regra_id: regra.id,
        p_fornecedor_id: fornecedorId || null,
        p_grupo_id: grupoId,
        p_descricao: descricao,
        p_valor: Number(valor),
        p_desconto: desconto === '' ? 0 : Number(desconto),
        p_periodicidade: regra.periodicidade,
        p_dia_semana: regra.dia_semana,
        p_dia_mes: regra.dia_mes,
        p_data_inicio: regra.data_inicio,
        p_ativo: regra.ativo,
      })
      setSalvando(false)
      if (error) {
        setErro(error.message)
        return
      }
    } else {
      const { error } = await supabase
        .from('contas_pagar')
        .update({
          fornecedor_id: fornecedorId || null,
          grupo_id: grupoId,
          descricao,
          valor: Number(valor),
          desconto: desconto === '' ? 0 : Number(desconto),
          data_vencimento: dataVencimento,
        })
        .eq('id', contaId)
      setSalvando(false)
      if (error) {
        setErro(error.message)
        return
      }
    }

    await carregar()
    onAtualizado()
  }

  async function confirmarConciliacao() {
    setErro(null)
    setSalvando(true)

    const { error } = await supabase
      .from('contas_pagar')
      .update({ status: 'conciliado', data_pagamento: dataPagamento, forma_pagamento: formaPagamento })
      .eq('id', contaId)

    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    onAtualizado()
    onFechar()
  }

  const podeEditar = conta?.status === 'nao_conciliado'

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-caixa pedido-admin" onClick={(e) => e.stopPropagation()}>
        <div className="pedido-admin-cabecalho">
          <h2>Conta a pagar</h2>
          {conta && (
            <span className={`badge ${conta.status === 'conciliado' ? 'badge-conciliado' : 'badge-pendente'}`}>
              {conta.status === 'conciliado' ? 'Pago' : 'Pendente'}
            </span>
          )}
        </div>

        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <>
            {erro && <p className="erro">{erro}</p>}

            <label>
              Fornecedor (opcional)
              <select
                value={fornecedorId}
                disabled={!podeEditar}
                onChange={(e) => setFornecedorId(e.target.value)}
              >
                <option value="">— nenhum —</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Grupo
              <select value={grupoId} disabled={!podeEditar} onChange={(e) => setGrupoId(e.target.value)}>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Descrição
              <input value={descricao} disabled={!podeEditar} onChange={(e) => setDescricao(e.target.value)} />
            </label>

            <label>
              Valor
              <input
                type="number"
                step="0.01"
                min="0"
                value={valor}
                disabled={!podeEditar}
                onChange={(e) => setValor(e.target.value)}
              />
            </label>

            <label>
              Desconto
              <input
                type="number"
                step="0.01"
                min="0"
                value={desconto}
                disabled={!podeEditar}
                onChange={(e) => setDesconto(e.target.value)}
              />
            </label>

            <label>
              Data de vencimento
              <input
                type="date"
                value={dataVencimento}
                disabled={!podeEditar || aplicarRegraToda}
                onChange={(e) => setDataVencimento(e.target.value)}
              />
            </label>

            {podeEditar && regra && (
              <div className="pedido-admin-pagamento-linha">
                <label className="clientes-checkbox-label">
                  <input
                    type="radio"
                    checked={!aplicarRegraToda}
                    onChange={() => setAplicarRegraToda(false)}
                  />
                  Só esta conta
                </label>
                <label className="clientes-checkbox-label">
                  <input
                    type="radio"
                    checked={aplicarRegraToda}
                    onChange={() => setAplicarRegraToda(true)}
                  />
                  Esta e as próximas (regra completa)
                </label>
              </div>
            )}

            {podeEditar && (
              <div className="modal-acoes">
                <button type="button" onClick={salvarEdicao} disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar edição'}
                </button>
              </div>
            )}

            {podeEditar && (
              <>
                <hr className="cliente-rule" />
                <h3>Dar baixa (pagar)</h3>
                <label>
                  Data de pagamento
                  <input
                    type="date"
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                  />
                </label>
                <label>
                  Forma de pagamento
                  <select
                    value={formaPagamento}
                    onChange={(e) => setFormaPagamento(e.target.value as FormaPagamentoContasPagar)}
                  >
                    {(Object.keys(rotuloForma) as FormaPagamentoContasPagar[]).map((forma) => (
                      <option key={forma} value={forma}>
                        {rotuloForma[forma]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="modal-acoes">
                  <button type="button" onClick={confirmarConciliacao} disabled={salvando}>
                    {salvando ? 'Confirmando...' : 'Confirmar pagamento'}
                  </button>
                </div>
              </>
            )}

            {conta?.status === 'conciliado' && (
              <p className="venda-cliente-vazio">
                Pago em {conta.data_pagamento ? new Date(conta.data_pagamento).toLocaleDateString('pt-BR') : '—'}
                {' · '}
                {conta.forma_pagamento ? rotuloForma[conta.forma_pagamento] : '—'}
                {' · '}
                {moeda(conta.valor - conta.desconto)}
              </p>
            )}

            <div className="modal-acoes">
              <button type="button" onClick={onFechar}>
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
