import type { FormaPagamento } from '../types'

export type SituacaoVenda = 'cancelada' | 'pendente' | 'fiado' | 'pago'

export interface QuitacaoVenda {
  valor: number
  forma: FormaPagamento | null
}

interface EntradaSituacao {
  status: 'finalizada' | 'cancelada'
  pagamentos: { forma: FormaPagamento; valor: number }[]
  quitacoes: QuitacaoVenda[]
}

export const rotuloForma: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  cartao_debito: 'Cartão débito',
  cartao_credito: 'Cartão crédito',
  pix: 'Pix',
  fiado: 'Fiado',
}

export const rotuloSituacao: Record<SituacaoVenda, string> = {
  cancelada: 'Cancelada',
  pendente: 'Pendente',
  fiado: 'Fiado',
  pago: 'Pago',
}

function rotuloFormas(formas: FormaPagamento[]) {
  const unicas = Array.from(new Set(formas))
  if (unicas.length === 0) return '—'
  if (unicas.length === 1) return rotuloForma[unicas[0]]
  return 'Múltiplas formas'
}

// Status e Forma exibidos na tela/relatorio de Vendas. Cancelada sempre
// prevalece; venda sem pagamento conciliado e' PENDENTE; venda com parte
// fiado e' FIADO ate as quitacoes alocadas a ela cobrirem o fiado, quando
// vira PAGO e a Forma passa a refletir as formas reais de quitacao.
export function situacaoVenda({ status, pagamentos, quitacoes }: EntradaSituacao) {
  const formasVenda = pagamentos.map((p) => p.forma)

  if (status === 'cancelada') {
    return { situacao: 'cancelada' as SituacaoVenda, forma: rotuloFormas(formasVenda) }
  }

  if (pagamentos.length === 0) {
    return { situacao: 'pendente' as SituacaoVenda, forma: '—' }
  }

  const fiadoTotal = pagamentos
    .filter((p) => p.forma === 'fiado')
    .reduce((soma, p) => soma + Number(p.valor), 0)

  if (fiadoTotal === 0) {
    return { situacao: 'pago' as SituacaoVenda, forma: rotuloFormas(formasVenda) }
  }

  const quitado = quitacoes.reduce((soma, q) => soma + Number(q.valor), 0)

  if (quitado + 0.005 < fiadoTotal) {
    return { situacao: 'fiado' as SituacaoVenda, forma: rotuloFormas(formasVenda) }
  }

  const formasFinais = [
    ...formasVenda.filter((f) => f !== 'fiado'),
    ...quitacoes.map((q) => q.forma).filter((f): f is FormaPagamento => f !== null),
  ]
  return {
    situacao: 'pago' as SituacaoVenda,
    forma: formasFinais.length === 0 ? 'Não informada' : rotuloFormas(formasFinais),
  }
}
