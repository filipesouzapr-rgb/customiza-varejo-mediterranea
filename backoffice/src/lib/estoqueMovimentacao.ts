import type { TipoEstoqueMovimentacao } from '../types'

export const rotuloTipoMovimentacao: Record<TipoEstoqueMovimentacao, string> = {
  venda: 'Venda',
  cancelamento_venda: 'Cancelamento de venda',
  entrada: 'Entrada',
  ajuste_manual: 'Ajuste manual',
  importacao_nf: 'Importação de NF',
  saldo_inicial: 'Saldo inicial',
}
