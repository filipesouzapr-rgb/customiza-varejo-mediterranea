import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { NOME_ESTABELECIMENTO } from './config'
import type { UnidadeProduto } from '../types'

export interface ItemPedidoPdf {
  nome: string
  quantidade: number
  unidade: UnidadeProduto
  precoUnitario?: number
}

interface GerarPdfPedidoParams {
  numeroPedido: string
  dataHora: string
  cliente: string
  itens: ItemPedidoPdf[]
  mostrarValores: boolean
  total?: number
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Monta o PDF programaticamente (nao e' captura de tela do PedidoA4) - texto
// nitido em qualquer zoom e mais leve/confiavel em celular do que uma rota
// via html2canvas, mas segue o mesmo layout visual: cabecalho com nome do
// estabelecimento, dados do pedido, tabela de itens e total.
export function gerarPdfPedido({
  numeroPedido,
  dataHora,
  cliente,
  itens,
  mostrarValores,
  total,
}: GerarPdfPedidoParams) {
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text(NOME_ESTABELECIMENTO, 14, 18)

  doc.setFontSize(10)
  doc.text(`Pedido ${numeroPedido} — ${dataHora}`, 14, 26)
  doc.text(`Cliente: ${cliente}`, 14, 32)

  const colunas = mostrarValores
    ? ['Item', 'Qtd', 'Preço unit.', 'Subtotal']
    : ['Item', 'Qtd']

  const linhas = itens.map((item) => {
    const qtd = `${item.quantidade}${item.unidade === 'kg' ? 'kg' : ''}`
    if (!mostrarValores) return [item.nome, qtd]
    const precoUnit = item.precoUnitario ?? 0
    return [item.nome, qtd, moeda(precoUnit), moeda(precoUnit * item.quantidade)]
  })

  autoTable(doc, {
    startY: 38,
    head: [colunas],
    body: linhas,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [60, 60, 60] },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY ?? 38

  doc.setFontSize(11)
  if (mostrarValores && total !== undefined) {
    doc.text(`Total: ${moeda(total)}`, 14, finalY + 10)
  } else {
    doc.text('Pagamento a conciliar.', 14, finalY + 10)
  }

  doc.save(`pedido-${numeroPedido}.pdf`)
}
