# Customiza Varejo — Template

Base do sistema de PDV (ponto de venda) da Customiza Varejo. Este repositório é o
**template**: não roda para nenhum cliente específico, serve só de ponto de
partida limpo pra criar o projeto de um cliente novo (ex.: `padaria bdi`).

## Estrutura

- [`pdv/`](pdv) — app desktop (Electron + React + TypeScript) usado no caixa.
- [`backoffice/`](backoffice) — app web (Vite + React + TypeScript) para cadastro
  de produtos, dashboard, fiado e demais telas de gestão.
- [`supabase/migrations/`](supabase/migrations) — schema do banco, na ordem em
  que deve ser aplicado num projeto Supabase novo.

## Como criar o projeto de um cliente novo a partir daqui

1. Copie esta pasta inteira para `Customiza Varejo/<nome-do-cliente>` (não
   precisa copiar `node_modules` nem `.git` — dá pra rodar `npm install` e
   `git init` de novo na pasta nova).
2. Na pasta nova: `git init` (histórico próprio, independente deste template).
3. Crie um **projeto Supabase novo**, exclusivo desse cliente. Pegue a Project
   URL e a anon key.
4. Rode as migrations de `supabase/migrations/` no SQL Editor do projeto novo,
   na ordem numérica.
5. Copie `pdv/.env.example` → `pdv/.env` e `backoffice/.env.example` →
   `backoffice/.env`, preenchendo com a URL/anon key do projeto novo e o nome
   do estabelecimento (`RENDERER_VITE_NOME_ESTABELECIMENTO` /
   `VITE_NOME_ESTABELECIMENTO`).
6. Crie o usuário dono em Authentication → Users no painel do Supabase, e
   depois rode no SQL Editor:
   ```sql
   insert into operadores (id, nome, papel)
   select id, 'Nome do dono', 'dono' from auth.users where email = 'email@do-dono.com';
   ```
7. `npm install` na pasta do cliente, depois `npm run dev --workspace=pdv` /
   `--workspace=backoffice` pra testar.

## Mantendo o template atualizado

Melhorias genéricas (que valem pra qualquer cliente — correção de bug, novo
atalho de teclado, ajuste visual) feitas num projeto de cliente devem ser
trazidas de volta pra cá, pra que o próximo cliente já nasça com elas. O jeito
mais simples: com o projeto do cliente como remoto local, `git fetch`/`merge`
aqui (funciona bem quando o template não teve mudanças próprias divergentes).
Coisas específicas de um cliente (nome, dados, customizações só daquele
negócio) **não** devem voltar pra cá.

## Desenvolvimento

```bash
npm install
npm run dev --workspace=pdv          # PDV (Electron)
npm run dev --workspace=backoffice   # Backoffice (web)
```

## Decisões de arquitetura

Veja o histórico de decisões de design (levantado numa sessão `/grill-me` para
o primeiro cliente, Padaria BDI) e a ordem de construção planejada no plano
salvo em `structured-crunching-puddle.md` (Claude Code) — a maior parte das
decisões é genérica e vale pra qualquer cliente novo também.
