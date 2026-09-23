import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { NOME_ESTABELECIMENTO } from './config'

interface GerarPdfRelatorioParams {
  titulo: string
  slug: string
  colunas: string[]
  linhas: (string | number)[][]
}

// Base generica pros 4 relatorios agregados (estoque, produtos, clientes,
// vendas) - mesma infraestrutura usada em pdfPedido.ts (jsPDF + autoTable),
// so muda cabecalho/colunas/linhas.
export function gerarPdfRelatorio({ titulo, slug, colunas, linhas }: GerarPdfRelatorioParams) {
  const doc = new jsPDF()
  const agora = new Date()

  doc.setFontSize(16)
  doc.text(NOME_ESTABELECIMENTO, 14, 18)

  doc.setFontSize(12)
  doc.text(titulo, 14, 26)

  doc.setFontSize(9)
  doc.text(`Gerado em ${agora.toLocaleString('pt-BR')}`, 14, 32)

  autoTable(doc, {
    startY: 38,
    head: [colunas],
    body: linhas,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [60, 60, 60] },
  })

  const data = agora.toISOString().slice(0, 10)
  doc.save(`relatorio-${slug}-${data}.pdf`)
}
