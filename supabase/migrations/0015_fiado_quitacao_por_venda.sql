-- Quitacao de fiado por venda: cada pagamento passa a registrar a forma usada
-- (Pix, dinheiro...) e quais vendas fiado ele quitou (e quanto de cada uma).
-- Isso permite a tela de Vendas mostrar FIADO/PAGO e a forma real de quitacao.
-- O saldo por cliente (fiado_saldo_por_cliente) continua vindo da soma de
-- fiado_pagamentos, entao nao muda.

alter table fiado_pagamentos
  add column forma text check (forma in ('dinheiro', 'cartao_debito', 'cartao_credito', 'pix'));

create table fiado_pagamento_vendas (
  id uuid primary key default gen_random_uuid(),
  fiado_pagamento_id uuid not null references fiado_pagamentos (id) on delete cascade,
  venda_id uuid not null references vendas (id),
  valor numeric(10, 2) not null check (valor > 0)
);

create index fiado_pagamento_vendas_venda_id_idx on fiado_pagamento_vendas (venda_id);

alter table fiado_pagamento_vendas enable row level security;

-- sem empresa_id proprio (mesma decisao de venda_itens em 0005): isola via
-- join com fiado_pagamentos.
create policy "isolado por empresa via pagamento" on fiado_pagamento_vendas for all
  using (exists (
    select 1 from fiado_pagamentos fp
    where fp.id = fiado_pagamento_vendas.fiado_pagamento_id
      and fp.empresa_id = empresa_do_usuario_atual()
  ))
  with check (exists (
    select 1 from fiado_pagamentos fp
    where fp.id = fiado_pagamento_vendas.fiado_pagamento_id
      and fp.empresa_id = empresa_do_usuario_atual()
  ));

-- "auto expose" desligado: GRANT explicito (ver memoria supabase_grants_views).
grant select, insert, update, delete on fiado_pagamento_vendas to authenticated;

-- registrar_pagamento_fiado: grava o pagamento e as alocacoes por venda de
-- forma atomica. p_alocacoes = [{"venda_id": "...", "valor": 10.5}, ...].
-- Cada venda precisa ser do cliente, estar finalizada e ter fiado em aberto
-- suficiente (fiado da venda - o que ja foi alocado a ela).
create or replace function registrar_pagamento_fiado(
  p_cliente_id uuid,
  p_forma text,
  p_observacoes text,
  p_alocacoes jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_aloc jsonb;
  v_venda_id uuid;
  v_valor numeric(10, 2);
  v_total numeric(10, 2) := 0;
  v_pagamento_id uuid;
  v_fiado_venda numeric(10, 2);
  v_ja_alocado numeric(10, 2);
begin
  if p_forma is null or p_forma not in ('dinheiro', 'cartao_debito', 'cartao_credito', 'pix') then
    raise exception 'Forma de pagamento invalida';
  end if;

  if p_alocacoes is null or jsonb_typeof(p_alocacoes) <> 'array' or jsonb_array_length(p_alocacoes) = 0 then
    raise exception 'Selecione ao menos uma venda pra quitar';
  end if;

  for v_aloc in select * from jsonb_array_elements(p_alocacoes) loop
    v_total := v_total + round((v_aloc->>'valor')::numeric, 2);
  end loop;

  if v_total <= 0 then
    raise exception 'O valor do pagamento precisa ser maior que zero';
  end if;

  insert into fiado_pagamentos (cliente_id, valor, forma, observacoes, recebido_por)
  values (p_cliente_id, v_total, p_forma, nullif(trim(coalesce(p_observacoes, '')), ''), auth.uid())
  returning id into v_pagamento_id;

  for v_aloc in select * from jsonb_array_elements(p_alocacoes) loop
    v_venda_id := (v_aloc->>'venda_id')::uuid;
    v_valor := round((v_aloc->>'valor')::numeric, 2);

    if v_valor <= 0 then
      raise exception 'Valor invalido pra quitar uma das vendas';
    end if;

    select coalesce(sum(vp.valor), 0) into v_fiado_venda
    from vendas v
    join venda_pagamentos vp on vp.venda_id = v.id and vp.forma = 'fiado'
    where v.id = v_venda_id and v.cliente_id = p_cliente_id and v.status = 'finalizada';

    if v_fiado_venda = 0 then
      raise exception 'Venda % nao e uma venda fiado em aberto deste cliente', v_venda_id;
    end if;

    select coalesce(sum(valor), 0) into v_ja_alocado
    from fiado_pagamento_vendas where venda_id = v_venda_id;

    if v_valor > v_fiado_venda - v_ja_alocado then
      raise exception 'Valor maior que o fiado em aberto da venda (em aberto: %)', v_fiado_venda - v_ja_alocado;
    end if;

    insert into fiado_pagamento_vendas (fiado_pagamento_id, venda_id, valor)
    values (v_pagamento_id, v_venda_id, v_valor);
  end loop;

  return v_pagamento_id;
end;
$$;
