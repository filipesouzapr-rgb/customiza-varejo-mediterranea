-- Converte o schema (hoje pensado pra um unico negocio por projeto Supabase)
-- em multi-tenant: varios estabelecimentos ("empresas") isolados dentro do
-- MESMO banco, via Row Level Security.
--
-- Terminologia: "empresas" = tenants (cada mercado/padaria que usa o
-- sistema, ex: Padaria BDI, Mediterranea). Isso e diferente de "clientes",
-- que ja existia e continua significando o freguês do estabelecimento
-- (fiado, CPF) - nao mudamos esse nome pra nao confundir os dois conceitos.
--
-- NAO ALTERA as migrations 0001-0004 ja aplicadas: so adiciona colunas,
-- troca constraints e substitui (create or replace) policies/funcoes.

-- =========================================================================
-- 1. TABELA DE TENANTS
-- =========================================================================

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- =========================================================================
-- 2. empresa_id NAS TABELAS EXISTENTES
-- =========================================================================
--
-- venda_itens e venda_pagamentos NAO ganham empresa_id direto - ver
-- explicacao do trade-off na mensagem que acompanha este arquivo. Todas as
-- outras tabelas de dado "de primeira classe" ganham a coluna.
--
-- Cada ALTER TABLE ... ADD COLUMN aqui embaixo fica sem "not null" num
-- primeiro momento porque a tabela ja tem linhas (os dados de teste da
-- Mediterranea) sem empresa definida. Depois de rodar o UPDATE de backfill
-- (que te dou junto no roteiro de teste, associando essas linhas a uma
-- empresa "Mediterranea" placeholder), a segunda parte do bloco aplica
-- "not null" de verdade. Se este banco estiver zerado, pode pular o
-- backfill e ir direto pro "not null".

alter table operadores add column empresa_id uuid references empresas (id);
alter table produtos add column empresa_id uuid references empresas (id);
alter table clientes add column empresa_id uuid references empresas (id);
alter table caixa_sessoes add column empresa_id uuid references empresas (id);
alter table caixa_movimentos add column empresa_id uuid references empresas (id);
alter table vendas add column empresa_id uuid references empresas (id);
alter table fiado_pagamentos add column empresa_id uuid references empresas (id);

-- Depois do backfill (ver roteiro), rode:
--   alter table operadores alter column empresa_id set not null;
--   alter table produtos alter column empresa_id set not null;
--   alter table clientes alter column empresa_id set not null;
--   alter table caixa_sessoes alter column empresa_id set not null;
--   alter table caixa_movimentos alter column empresa_id set not null;
--   alter table vendas alter column empresa_id set not null;
--   alter table fiado_pagamentos alter column empresa_id set not null;
-- Deixei comentado de proposito: se rodar isso agora, com linhas antigas
-- sem empresa_id preenchido, a migration inteira falha e nao aplica nada.

-- =========================================================================
-- 3. CONSTRAINTS UNICAS POR EMPRESA
-- =========================================================================

alter table produtos drop constraint produtos_codigo_barras_key;
alter table produtos add constraint produtos_empresa_codigo_barras_key unique (empresa_id, codigo_barras);

alter table produtos drop constraint produtos_codigo_interno_key;
alter table produtos add constraint produtos_empresa_codigo_interno_key unique (empresa_id, codigo_interno);

alter table clientes drop constraint clientes_cpf_key;
alter table clientes add constraint clientes_empresa_cpf_key unique (empresa_id, cpf);

-- =========================================================================
-- 4. SEQUENCE DE codigo_interno - mantida global (ver explicacao)
-- =========================================================================
-- Nao mexe em produtos_codigo_interno_seq. Continua gerando PLU000001,
-- PLU000002... de forma crescente pra TODAS as empresas juntas (nao
-- reinicia em 1 pra cada empresa nova). E' cosmetico, invisivel no dia a
-- dia de qualquer empresa isolada, e evita ter que criar/gerenciar uma
-- sequence nova toda vez que um cliente novo se cadastra.

-- =========================================================================
-- 5. RLS POR EMPRESA
-- =========================================================================

create or replace function empresa_do_usuario_atual()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select empresa_id from operadores where id = auth.uid()
$$;

-- IMPORTANTE: o app (pdv/backoffice) hoje NUNCA envia empresa_id nos
-- inserts (nao faz sentido pedir isso pro usuario - ele nao "escolhe" a
-- empresa, o login dele ja implica uma so). Sem isso aqui, toda tela que
-- cadastra produto/cliente/abre caixa/etc pararia de funcionar assim que
-- o RLS entrasse em vigor, porque o insert chegaria com empresa_id NULL e
-- o "with check" abaixo rejeitaria. O DEFAULT preenche automaticamente
-- quando a coluna nao vem no insert (e' exatamente o caso do app hoje);
-- se alguem enviar empresa_id explicito mesmo assim (like a simulacao de
-- ataque no roteiro de teste), o valor enviado prevalece sobre o default e
-- quem trava isso e' o "with check" das policies, nao o default.
alter table operadores alter column empresa_id set default empresa_do_usuario_atual();
alter table produtos alter column empresa_id set default empresa_do_usuario_atual();
alter table clientes alter column empresa_id set default empresa_do_usuario_atual();
alter table caixa_sessoes alter column empresa_id set default empresa_do_usuario_atual();
alter table caixa_movimentos alter column empresa_id set default empresa_do_usuario_atual();
alter table vendas alter column empresa_id set default empresa_do_usuario_atual();
alter table fiado_pagamentos alter column empresa_id set default empresa_do_usuario_atual();

-- Remove as policies antigas (sem isolamento nenhum).
drop policy if exists "operadores autenticados podem tudo" on operadores;
drop policy if exists "operadores autenticados podem tudo" on produtos;
drop policy if exists "operadores autenticados podem tudo" on clientes;
drop policy if exists "operadores autenticados podem tudo" on caixa_sessoes;
drop policy if exists "operadores autenticados podem tudo" on caixa_movimentos;
drop policy if exists "operadores autenticados podem tudo" on vendas;
drop policy if exists "operadores autenticados podem tudo" on venda_itens;
drop policy if exists "operadores autenticados podem tudo" on venda_pagamentos;
drop policy if exists "operadores autenticados podem tudo" on fiado_pagamentos;

alter table empresas enable row level security;

-- operadores: cada um so ve gente da propria empresa (mas sempre pode ler a
-- propria linha, mesmo antes de ter empresa_id preenchido - evita ficar
-- travado no primeiro login).
create policy "isolado por empresa" on operadores for all
  using (id = auth.uid() or empresa_id = empresa_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual());

create policy "isolado por empresa" on produtos for all
  using (empresa_id = empresa_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual());

create policy "isolado por empresa" on clientes for all
  using (empresa_id = empresa_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual());

create policy "isolado por empresa" on caixa_sessoes for all
  using (empresa_id = empresa_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual());

create policy "isolado por empresa" on caixa_movimentos for all
  using (empresa_id = empresa_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual());

create policy "isolado por empresa" on vendas for all
  using (empresa_id = empresa_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual());

create policy "isolado por empresa" on fiado_pagamentos for all
  using (empresa_id = empresa_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual());

-- venda_itens e venda_pagamentos: isolamento via join com vendas, ja que
-- nao tem empresa_id proprio (decisao do item 2).
create policy "isolado por empresa via venda" on venda_itens for all
  using (exists (
    select 1 from vendas v where v.id = venda_itens.venda_id and v.empresa_id = empresa_do_usuario_atual()
  ))
  with check (exists (
    select 1 from vendas v where v.id = venda_itens.venda_id and v.empresa_id = empresa_do_usuario_atual()
  ));

create policy "isolado por empresa via venda" on venda_pagamentos for all
  using (exists (
    select 1 from vendas v where v.id = venda_pagamentos.venda_id and v.empresa_id = empresa_do_usuario_atual()
  ))
  with check (exists (
    select 1 from vendas v where v.id = venda_pagamentos.venda_id and v.empresa_id = empresa_do_usuario_atual()
  ));

-- empresas: cada operador so ve a propria empresa (nao a lista inteira de
-- empresas cadastradas no banco - isso tambem seria vazamento de dado,
-- mesmo sendo "so" nome/slug).
create policy "so a propria empresa" on empresas for select
  using (id = empresa_do_usuario_atual());

-- =========================================================================
-- 6. finalizar_venda e cancelar_venda: validar mesma empresa
-- =========================================================================
-- As duas funcoes continuam SECURITY INVOKER (sem "security definer") de
-- proposito: rodando com o privilegio de quem chama, todo INSERT/UPDATE
-- que elas fazem passa pelas policies de RLS acima automaticamente. Isso
-- so nao cobre um caso: chave estrangeira (ex: produto_id dentro do jsonb
-- de itens) NAO e filtrada por RLS - um operador poderia, em tese, tentar
-- finalizar uma venda referenciando o UUID de um produto de OUTRA empresa
-- (se soubesse ou adivinhasse o id). Por isso a validacao explicita abaixo,
-- alem do RLS.

create or replace function finalizar_venda(
  p_caixa_sessao_id uuid,
  p_operador_id uuid,
  p_cliente_id uuid,
  p_itens jsonb,
  p_pagamentos jsonb,
  p_desconto numeric default 0,
  p_desconto_autorizado_por uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid;
  v_venda_id uuid;
  v_subtotal numeric(10, 2);
  v_total numeric(10, 2);
  v_total_pago numeric(10, 2);
  v_item jsonb;
  v_pagamento jsonb;
begin
  v_empresa_id := empresa_do_usuario_atual();
  if v_empresa_id is null then
    raise exception 'Operador sem empresa associada';
  end if;

  if not exists (
    select 1 from caixa_sessoes where id = p_caixa_sessao_id and empresa_id = v_empresa_id
  ) then
    raise exception 'Caixa nao encontrado para esta empresa';
  end if;

  if p_cliente_id is not null and not exists (
    select 1 from clientes where id = p_cliente_id and empresa_id = v_empresa_id
  ) then
    raise exception 'Cliente nao encontrado para esta empresa';
  end if;

  if p_desconto_autorizado_por is not null and not exists (
    select 1 from operadores where id = p_desconto_autorizado_por and empresa_id = v_empresa_id
  ) then
    raise exception 'Supervisor nao encontrado para esta empresa';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_itens) item
    where not exists (
      select 1 from produtos p
      where p.id = (item->>'produto_id')::uuid and p.empresa_id = v_empresa_id
    )
  ) then
    raise exception 'Um ou mais produtos nao pertencem a esta empresa';
  end if;

  select coalesce(sum((item->>'quantidade')::numeric * (item->>'preco_unitario')::numeric), 0)
  into v_subtotal
  from jsonb_array_elements(p_itens) as item;

  v_total := v_subtotal - coalesce(p_desconto, 0);

  select coalesce(sum((pagamento->>'valor')::numeric), 0)
  into v_total_pago
  from jsonb_array_elements(p_pagamentos) as pagamento;

  if v_total_pago <> v_total then
    raise exception 'Soma dos pagamentos (%) difere do total da venda (%)', v_total_pago, v_total;
  end if;

  if p_desconto > 0 and p_desconto_autorizado_por is null then
    raise exception 'Desconto exige autorizacao de supervisor';
  end if;

  insert into vendas (
    empresa_id, caixa_sessao_id, operador_id, cliente_id, status,
    subtotal, desconto, desconto_autorizado_por, total, finalizada_em
  )
  values (
    v_empresa_id, p_caixa_sessao_id, p_operador_id, p_cliente_id, 'finalizada',
    v_subtotal, coalesce(p_desconto, 0), p_desconto_autorizado_por, v_total, now()
  )
  returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal)
    values (
      v_venda_id,
      (v_item->>'produto_id')::uuid,
      (v_item->>'quantidade')::numeric,
      (v_item->>'preco_unitario')::numeric,
      (v_item->>'quantidade')::numeric * (v_item->>'preco_unitario')::numeric
    );

    update produtos
    set estoque_atual = estoque_atual - (v_item->>'quantidade')::numeric,
        atualizado_em = now()
    where id = (v_item->>'produto_id')::uuid;
  end loop;

  for v_pagamento in select * from jsonb_array_elements(p_pagamentos)
  loop
    insert into venda_pagamentos (venda_id, forma, valor)
    values (v_venda_id, v_pagamento->>'forma', (v_pagamento->>'valor')::numeric);
  end loop;

  return v_venda_id;
end;
$$;

create or replace function cancelar_venda(
  p_venda_id uuid,
  p_cancelado_por uuid
)
returns void
language plpgsql
as $$
declare
  v_empresa_id uuid;
  v_status text;
  v_venda_empresa_id uuid;
  v_finalizada_em timestamptz;
  v_item jsonb;
begin
  v_empresa_id := empresa_do_usuario_atual();

  select status, finalizada_em, empresa_id
  into v_status, v_finalizada_em, v_venda_empresa_id
  from vendas where id = p_venda_id;

  -- Mensagem generica de proposito nos dois casos (nao encontrada / de
  -- outra empresa) pra nao dar pista de que o id existe em outro tenant.
  if v_status is null or v_venda_empresa_id is distinct from v_empresa_id then
    raise exception 'Venda nao encontrada';
  end if;

  if not exists (
    select 1 from operadores where id = p_cancelado_por and empresa_id = v_empresa_id
  ) then
    raise exception 'Supervisor nao encontrado para esta empresa';
  end if;

  if v_status <> 'finalizada' then
    raise exception 'Venda nao esta finalizada (status atual: %)', v_status;
  end if;

  if now() - v_finalizada_em > interval '30 minutes' then
    raise exception 'Fora da janela de cancelamento (30 minutos)';
  end if;

  update vendas
  set status = 'cancelada', cancelada_em = now(), cancelada_por = p_cancelado_por
  where id = p_venda_id;

  for v_item in
    select jsonb_build_object('produto_id', produto_id, 'quantidade', quantidade)
    from venda_itens where venda_id = p_venda_id
  loop
    update produtos
    set estoque_atual = estoque_atual + (v_item->>'quantidade')::numeric,
        atualizado_em = now()
    where id = (v_item->>'produto_id')::uuid;
  end loop;
end;
$$;

-- =========================================================================
-- View de fiado: passa a ser por empresa tambem (mesmo que o cliente ja
-- fique isolado via RLS, a soma dentro da view deve ficar restrita a
-- vendas/pagamentos da mesma empresa do cliente).
-- =========================================================================

create or replace view fiado_saldo_por_cliente as
select
  c.id as cliente_id,
  c.empresa_id,
  c.nome,
  coalesce(sum(vp.valor), 0) as total_fiado,
  coalesce((select sum(fp.valor) from fiado_pagamentos fp where fp.cliente_id = c.id), 0) as total_pago,
  coalesce(sum(vp.valor), 0) - coalesce((select sum(fp.valor) from fiado_pagamentos fp where fp.cliente_id = c.id), 0) as saldo_em_aberto
from clientes c
left join vendas v on v.cliente_id = c.id and v.status = 'finalizada' and v.empresa_id = c.empresa_id
left join venda_pagamentos vp on vp.venda_id = v.id and vp.forma = 'fiado'
group by c.id, c.empresa_id, c.nome;
