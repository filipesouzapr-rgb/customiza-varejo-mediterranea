# Customiza Varejo

Sistema de PDV (ponto de venda) + backoffice da Customiza Varejo, rodando sobre
o projeto Supabase multi-tenant `customiza-varejo-core` — várias empresas
(tenants) isoladas por `empresa_id`/RLS no mesmo banco.

## Estrutura

- [`backoffice/`](backoffice) — app web único (Vite + React + TypeScript,
  sem Electron) que hospeda tanto o caixa (`/caixa`) quanto a gestão
  (`/dashboard`, `/produtos`, `/fiado`). Acesso por papel do operador: quem
  tem papel `operador` só acessa `/caixa`; `supervisor`/`dono` acessam
  `/caixa` e as telas de gestão.
- [`supabase/migrations/`](supabase/migrations) — schema do banco
  multi-tenant, na ordem em que deve ser aplicado.
- [`supabase/roteiro_teste_multitenant.sql`](supabase/roteiro_teste_multitenant.sql)
  — roteiro manual (SQL Editor) pra validar isolamento por empresa via RLS;
  não é uma migration.

## Como cadastrar um cliente novo (empresa) neste backend

Todos os clientes rodam sobre o **mesmo** projeto Supabase multi-tenant
(`customiza-varejo-core`) — cada um é isolado por RLS via `empresa_id`, não
por projeto Supabase separado. Pra dar de alta um cliente novo:

1. No SQL Editor do `customiza-varejo-core`, cadastre a empresa:
   ```sql
   insert into empresas (nome, slug) values ('Nome do Cliente', 'nome-do-cliente');
   ```
2. Crie o usuário dono em Authentication → Users no painel do Supabase, e
   depois rode no SQL Editor (usando o id da empresa do passo 1):
   ```sql
   insert into operadores (id, empresa_id, nome, papel)
   select id, '<empresa_id>', 'Nome do dono', 'dono' from auth.users where email = 'email@do-dono.com';
   ```
3. Cada cliente tem seu próprio deploy do app web (este repositório é um
   exemplo — a Mediterrânea), com `.env` apontando pra `customiza-varejo-core`
   (URL/anon key são as mesmas pra todos os clientes) e
   `VITE_NOME_ESTABELECIMENTO` com o nome daquele cliente.

## Desenvolvimento

```bash
npm install
npm run dev --workspace=backoffice   # app web único (caixa + gestão)
```

## Decisões de arquitetura

Veja o histórico de decisões de design (levantado numa sessão `/grill-me` para
o primeiro cliente, Padaria BDI) e a ordem de construção planejada no plano
salvo em `structured-crunching-puddle.md` (Claude Code) — a maior parte das
decisões é genérica e vale pra qualquer cliente novo também.
