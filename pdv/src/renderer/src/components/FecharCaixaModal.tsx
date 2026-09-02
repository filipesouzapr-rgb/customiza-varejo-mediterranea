import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { CaixaSessao, FormaPagamento } from '../types'

const rotuloForma: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  cartao_debito: 'Cartão débito',
  cartao_credito: 'Cartão crédito',
  pix: 'Pix',
  fiado: 'Outros',
}

interface Props {
  caixaSessao: CaixaSessao
  onFechada: () => void
  onFechar: () => void
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function FecharCaixaModal({ caixaSessao, onFechada, onFechar }: Props) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [porForma, setPorForma] = useState<Partial<Record<FormaPagamento, number>>>({})
  const [sangrias, setSangrias] = useState(0)
  const [suprimentos, setSuprimentos] = useState(0)
  const [valorContado, setValorContado] = useState('')
  const [salvando, setSalvando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function carregar() {
      setCarregando(true)

      const { data: vendas, error: errVendas } = await supabase
        .from('vendas')
        .select('id')
        .eq('caixa_sessao_id', caixaSessao.id)
        .eq('status', 'finalizada')

      if (errVendas) {
        setErro(errVendas.message)
        setCarregando(false)
        return
      }

      const vendaIds = (vendas ?? []).map((v) => v.id)
      const somaPorForma: Partial<Record<FormaPagamento, number>> = {}

      if (vendaIds.length > 0) {
        const { data: pagamentos, error: errPag } = await supabase
          .from('venda_pagamentos')
          .select('forma, valor')
          .in('venda_id', vendaIds)

        if (errPag) {
          setErro(errPag.message)
          setCarregando(false)
          return
        }

        for (const p of pagamentos ?? []) {
          const forma = p.forma as FormaPagamento
          somaPorForma[forma] = (somaPorForma[forma] ?? 0) + Number(p.valor)
        }
      }

      const { data: movimentos, error: errMov } = await supabase
        .from('caixa_movimentos')
        .select('tipo, valor')
        .eq('caixa_sessao_id', caixaSessao.id)

      if (errMov) {
        setErro(errMov.message)
        setCarregando(false)
        return
      }

      const totalSangrias = (movimentos ?? [])
        .filter((m) => m.tipo === 'sangria')
        .reduce((soma, m) => soma + Number(m.valor), 0)
      const totalSuprimentos = (movimentos ?? [])
        .filter((m) => m.tipo === 'suprimento')
        .reduce((soma, m) => soma + Number(m.valor), 0)

      setPorForma(somaPorForma)
      setSangrias(totalSangrias)
      setSuprimentos(totalSuprimentos)
      setCarregando(false)
    }

    carregar()
  }, [caixaSessao.id])

  useEffect(() => {
    if (!carregando) inputRef.current?.focus()
  }, [carregando])

  const esperadoDinheiro =
    caixaSessao.valor_abertura + (porForma.dinheiro ?? 0) + suprimentos - sangrias

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSalvando(true)
    setErro(null)

    const { error } = await supabase
      .from('caixa_sessoes')
      .update({ fechado_em: new Date().toISOString(), valor_fechamento_informado: Number(valorContado) || 0 })
      .eq('id', caixaSessao.id)

    setSalvando(false)

    if (error) {
      setErro(error.message)
      return
    }

    onFechada()
  }

  return (
    <div className="modal-fundo">
      <form
        onSubmit={handleSubmit}
        className="modal-caixa fechar-caixa"
        onKeyDown={(e) => e.key === 'Escape' && onFechar()}
      >
        <h2>Fechamento de caixa</h2>
        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <>
            <div className="fechar-caixa-resumo">
              <div>
                <span>Abertura</span>
                <span>{moeda(caixaSessao.valor_abertura)}</span>
              </div>
              {(Object.keys(rotuloForma) as FormaPagamento[]).map(
                (forma) =>
                  !!porForma[forma] && (
                    <div key={forma}>
                      <span>Vendas — {rotuloForma[forma]}</span>
                      <span>{moeda(porForma[forma] ?? 0)}</span>
                    </div>
                  ),
              )}
              <div>
                <span>Suprimentos</span>
                <span>+{moeda(suprimentos)}</span>
              </div>
              <div>
                <span>Sangrias</span>
                <span>-{moeda(sangrias)}</span>
              </div>
              <div className="fechar-caixa-esperado">
                <span>Esperado em dinheiro</span>
                <span>{moeda(esperadoDinheiro)}</span>
              </div>
            </div>
            <label>
              Valor contado em dinheiro
              <input
                ref={inputRef}
                type="number"
                step="0.01"
                min="0"
                value={valorContado}
                onChange={(e) => setValorContado(e.target.value)}
              />
            </label>
            {erro && <p className="erro">{erro}</p>}
            <div className="modal-acoes">
              <button type="button" onClick={onFechar}>
                Cancelar
              </button>
              <button type="submit" disabled={salvando}>
                {salvando ? 'Fechando...' : 'Confirmar fechamento'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
