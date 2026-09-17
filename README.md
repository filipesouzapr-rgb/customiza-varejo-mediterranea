# Mediterrânea — PDV + Backoffice

Sistema de PDV (ponto de venda) + backoffice da Mediterrânea, rodando sobre um
projeto **Neon** (Postgres) próprio — banco single-tenant, sem `empresa_id`/RLS
multi-tenant (este projeto já rodou sobre um Supabase compartilhado entre
clientes; migrado pro Neon com banco dedicado, seguindo o mesmo padrão do
projeto irmão `apreciarcafe`).

Autenticação via **Neon Auth** (Managed Better Auth) + **Neon Data API**
(camada REST estilo PostgREST, com RLS de verdade por trás).

## Estrutura

- [`backoffice/`](backoffice) — app web único (Vite + React + TypeScript,
  workspace npm) que hospeda tanto o caixa (`/caixa`) quanto a gestão
  (`/dashboard`, `/produtos`, `/clientes`, `/fiado`, `/contas-pagar`). Acesso
  por papel do operador: quem tem papel `operador` só acessa `/caixa`;
  `supervisor`/`dono` acessam `/caixa` e as telas de gestão.
- [`neon/migrations/`](neon/migrations) — schema do banco Neon, na ordem em
  que deve ser aplicado (`neon psql main --project-id <id> --role-name
  neondb_owner -- -f neon/migrations/000X_arquivo.sql`).
- [`neon.ts`](neon.ts) — declara os serviços Neon do projeto (`auth` +
  `dataApi`); aplicar com `neon deploy --project-id <id> --branch main`.
- [`supabase/`](supabase) — **histórico/legado**: migrations da fase em que
  este projeto ainda rodava sobre Supabase (multi-tenant, compartilhado com
  outros clientes). Não é mais usado nem aplicado — mantido só como
  referência de como o schema evoluiu antes da migração pro Neon.

## Regras de negócio (não mudaram na migração pro Neon)

- PDV (`/caixa`) não mostra nenhum valor pro operador (preço, subtotal,
  total, desconto, troco) — o preço de cada item vem do cadastro de produtos,
  calculado no servidor.
- Toda venda exige cliente vinculado; não existe caixa físico
  (abrir/fechar/sangria/suprimento).
- Toda venda nasce pendente de conciliação. O admin (`supervisor`/`dono`)
  concilia a forma de pagamento e pode editar o pedido (itens/preço/desconto)
  sem limite de tempo, desde que ainda não conciliado.
- Módulo de Contas a Pagar completo (fornecedores, grupos de despesa,
  lançamentos avulsos e recorrentes com geração automática de ocorrências).
- Impressão de pedido em A4, com valores só quando quem imprime é
  `supervisor`/`dono`.
- Paleta preto/grafite/cinza e responsivo mobile.

## Desenvolvimento

```bash
npm install
npm run dev --workspace=backoffice   # app web único (caixa + gestão), porta 5173
```

`backoffice/.env` aponta pro projeto Neon (`VITE_NEON_AUTH_URL`,
`VITE_NEON_DATA_API_URL`, `VITE_NOME_ESTABELECIMENTO`).

## Cadastrar um operador novo

Não tem self-signup — cadastro é manual:

1. Criar o usuário no Neon Auth (console.neon.tech → projeto → Auth → Users,
   com e-mail/senha), ou via `neon neon-auth user create --email ...`.
2. Inserir a linha correspondente em `operadores` com o mesmo `id` (uuid) do
   usuário criado, e o `papel` desejado (`operador`, `supervisor` ou `dono`).

## Decisões de arquitetura

Veja o histórico de decisões de design (levantado numa sessão `/grill-me` para
o primeiro cliente, Padaria BDI) e a ordem de construção planejada no plano
salvo em `structured-crunching-puddle.md` (Claude Code) — a maior parte das
decisões é genérica e vale pra qualquer cliente novo também.
