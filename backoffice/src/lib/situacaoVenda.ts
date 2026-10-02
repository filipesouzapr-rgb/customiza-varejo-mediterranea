import type { FormaPagamento } from '../types'

export type SituacaoVenda = 'cancelada' | 'pendente' | 'fiado' | 'pago'

export interface QuitacaoVenda {
  valor: number
  forma: FormaPagamento | null
  pago_em: string
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
    return {
      situacao: 'cancelada' as SituacaoVenda,
      forma: rotuloFormas(formasVenda),
      dataQuitacao: null,
      pagoParcial: null,
      saldoFiado: null,
    }
  }

  if (pagamentos.length === 0) {
    return {
      situacao: 'pendente' as SituacaoVenda,
      forma: '—',
      dataQuitacao: null,
      pagoParcial: null,
      saldoFiado: null,
    }
  }

  const fiadoTotal = pagamentos
    .filter((p) => p.forma === 'fiado')
    .reduce((soma, p) => soma + Number(p.valor), 0)

  if (fiadoTotal === 0) {
    return {
      situacao: 'pago' as SituacaoVenda,
      forma: rotuloFormas(formasVenda),
      dataQuitacao: null,
      pagoParcial: null,
      saldoFiado: null,
    }
  }

  const quitado = quitacoes.reduce((soma, q) => soma + Number(q.valor), 0)

  if (quitado + 0.005 < fiadoTotal) {
    return {
      situacao: 'fiado' as SituacaoVenda,
      forma: rotuloFormas(formasVenda),
      dataQuitacao: null,
      // so informa quando ja existe algum pagamento parcial registrado pra
      // essa venda - fiado intocado nao mostra nada embaixo do badge. O
      // saldo e' sobre a parte fiado (nao o total da venda, que pode ter
      // uma parte paga em outra forma na hora da criacao).
      pagoParcial: quitado > 0 ? quitado : null,
      saldoFiado: quitado > 0 ? Math.max(0, fiadoTotal - quitado) : null,
    }
  }

  const formasFinais = [
    ...formasVenda.filter((f) => f !== 'fiado'),
    ...quitacoes.map((q) => q.forma).filter((f): f is FormaPagamento => f !== null),
  ]

  // Data que "completou" a quitacao: soma as quitacoes em ordem cronologica
  // e pega a data da primeira que faz o acumulado cobrir o fiado inteiro -
  // relevante quando o fiado foi pago em mais de uma etapa (parcial).
  const ordenadas = [...quitacoes].sort((a, b) => a.pago_em.localeCompare(b.pago_em))
  let acumulado = 0
  let dataQuitacao: string | null = null
  for (const q of ordenadas) {
    acumulado += Number(q.valor)
    if (acumulado + 0.005 >= fiadoTotal) {
      dataQuitacao = q.pago_em
      break
    }
  }

  return {
    situacao: 'pago' as SituacaoVenda,
    forma: formasFinais.length === 0 ? 'Não informada' : rotuloFormas(formasFinais),
    dataQuitacao,
    pagoParcial: null,
    saldoFiado: null,
  }
}
