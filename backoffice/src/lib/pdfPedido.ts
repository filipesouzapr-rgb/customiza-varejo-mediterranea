import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { NOME_ESTABELECIMENTO } from './config'
import { rotuloQuantidade } from './resumoCategoria'
import type { LinhaResumoCategoria } from './resumoCategoria'
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
  resumoCategorias?: LinhaResumoCategoria[]
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
  resumoCategorias,
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
  let finalY = (doc as any).lastAutoTable.finalY ?? 38

  if (resumoCategorias && resumoCategorias.length > 0) {
    doc.setFontSize(11)
    doc.text('Resumo por categoria', 14, finalY + 10)
    autoTable(doc, {
      startY: finalY + 14,
      head: [['Categoria', 'Quantidade']],
      body: resumoCategorias.map((r) => [r.rotulo, rotuloQuantidade(r.quantidade, r.unidade)]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [60, 60, 60] },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finalY = (doc as any).lastAutoTable.finalY ?? finalY
  }

  doc.setFontSize(11)
  if (mostrarValores && total !== undefined) {
    doc.text(`Total: ${moeda(total)}`, 14, finalY + 10)
  } else {
    doc.text('Pagamento a conciliar.', 14, finalY + 10)
  }

  doc.save(`pedido-${numeroPedido}.pdf`)
}
