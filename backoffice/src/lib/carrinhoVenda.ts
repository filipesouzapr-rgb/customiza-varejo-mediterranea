// Chave de sessionStorage usada pelo caixa (VendaPage) pra nao perder o
// pedido em andamento ao trocar de tela e voltar - limpa no logout
// (useSession.ts), pra nao vazar carrinho de um operador pro proximo login
// num terminal compartilhado.
export const CHAVE_CARRINHO_VENDA = 'carrinhoVenda'
