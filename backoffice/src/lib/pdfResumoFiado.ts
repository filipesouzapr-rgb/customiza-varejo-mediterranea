import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { NOME_ESTABELECIMENTO } from './config'

interface LinhaResumoFiado {
  data: string
  pedido: string
  valor: string
  situacao: string
}

interface GerarPdfResumoFiadoParams {
  cliente: string
  periodo: string
  situacaoFiltro: string
  pagos: LinhaResumoFiado[]
  pendentes: LinhaResumoFiado[]
  totalComprado: string
  totalPago: string
  totalFalta: string
}

const colunas = ['Data', 'Pedido', 'Valor', 'Situação']

// Resumo de fiado por cliente - caixas separadas pra pagos e pendentes de
// pagamento (nao mistura na mesma tabela), com os totais sempre por
// ultimo. Mesma base jsPDF + autoTable do resto do app (pdfPedido.ts,
// pdfRelatorio.ts), so com mais de uma tabela no mesmo documento.
export function gerarPdfResumoFiado({
  cliente,
  periodo,
  situacaoFiltro,
  pagos,
  pendentes,
  totalComprado,
  totalPago,
  totalFalta,
}: GerarPdfResumoFiadoParams) {
  const doc = new jsPDF()
  const agora = new Date()

  doc.setFontSize(16)
  doc.text(NOME_ESTABELECIMENTO, 14, 18)

  doc.setFontSize(12)
  doc.text(`Resumo de fiado — ${cliente}`, 14, 26)

  doc.setFontSize(10)
  doc.text(`Período: ${periodo}${situacaoFiltro}`, 14, 32)

  doc.setFontSize(9)
  doc.text(`Gerado em ${agora.toLocaleString('pt-BR')}`, 14, 38)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let finalY = 42

  function desenharCaixa(titulo: string, linhas: LinhaResumoFiado[]) {
    if (linhas.length === 0) return
    doc.setFontSize(11)
    doc.text(titulo, 14, finalY + 8)
    autoTable(doc, {
      startY: finalY + 12,
      head: [colunas],
      body: linhas.map((l) => [l.data, l.pedido, l.valor, l.situacao]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [60, 60, 60] },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finalY = (doc as any).lastAutoTable.finalY
  }

  desenharCaixa('Pagos', pagos)
  desenharCaixa('Pendentes de pagamento', pendentes)

  autoTable(doc, {
    startY: finalY + 10,
    body: [
      ['Total comprado', totalComprado],
      ['Total já pago', totalPago],
      ['Falta pagar', totalFalta],
    ],
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: 'right' } },
  })

  const dataArquivo = agora.toISOString().slice(0, 10)
  const slug = cliente
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
  doc.save(`resumo-fiado-${slug}-${dataArquivo}.pdf`)
}
