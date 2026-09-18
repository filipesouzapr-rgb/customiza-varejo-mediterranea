-- Libera edicao de pedido (itens/quantidade/desconto/data) mesmo depois de
-- conciliado - pedido do cliente, junto com a tela de Vendas (historico).
-- Antes (0009), editar_venda_admin bloqueava qualquer edicao apos a
-- conciliacao pra nao ter que reconciliar venda_pagamentos com split de
-- forma. Agora, quando o total muda num pedido ja conciliado, os valores em
-- venda_pagamentos sao reescalados proporcionalmente (mesma forma de
-- pagamento, valor ajustado na mesma razao da mudanca de total) -
-- automatico, sem pedir pro admin reinformar a divisao.

create or replace function editar_venda_admin(
  p_venda_id uuid,
  p_itens jsonb, -- [{produto_id, quantidade, preco_unitario}]
  p_desconto numeric default 0,
  p_finalizada_em timestamptz default null
)
returns void
language plpgsql
as $$
declare
  v_empresa_id uuid;
  v_editor_id uuid;
  v_editor_papel text;
  v_venda_empresa_id uuid;
  v_status text;
  v_total_antigo numeric(10, 2);
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade numeric;
  v_preco numeric;
  v_subtotal numeric(10, 2);
  v_total numeric(10, 2);
  v_pagamento record;
  v_novo_valor numeric(10, 2);
  v_soma_ja_ajustada numeric(10, 2) := 0;
  v_qtd_pagamentos int;
  v_i int := 0;
begin
  v_editor_id := auth.uid();
  v_empresa_id := empresa_do_usuario_atual();

  select papel into v_editor_papel from operadores where id = v_editor_id;
  if v_editor_papel is null or v_editor_papel not in ('supervisor', 'dono') then
    raise exception 'Somente supervisor ou dono pode editar um pedido';
  end if;

  select empresa_id, status, total
  into v_venda_empresa_id, v_status, v_total_antigo
  from vendas where id = p_venda_id;

  if v_venda_empresa_id is null or v_venda_empresa_id is distinct from v_empresa_id then
    raise exception 'Pedido nao encontrado';
  end if;

  if v_status <> 'finalizada' then
    raise exception 'Pedido nao esta finalizado (status atual: %)', v_status;
  end if;

  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido precisa ter ao menos 1 item';
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

  -- reverte estoque dos itens atuais antes de trocar pelos novos
  for v_item in
    select jsonb_build_object('produto_id', produto_id, 'quantidade', quantidade)
    from venda_itens where venda_id = p_venda_id
  loop
    update produtos
    set estoque_atual = estoque_atual + (v_item->>'quantidade')::numeric,
        atualizado_em = now()
    where id = (v_item->>'produto_id')::uuid;
  end loop;

  delete from venda_itens where venda_id = p_venda_id;

  select coalesce(sum((item->>'quantidade')::numeric * (item->>'preco_unitario')::numeric), 0)
  into v_subtotal
  from jsonb_array_elements(p_itens) as item;

  v_total := greatest(v_subtotal - coalesce(p_desconto, 0), 0);

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;

    insert into venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal)
    values (p_venda_id, v_produto_id, v_quantidade, v_preco, v_quantidade * v_preco);

    update produtos
    set estoque_atual = estoque_atual - v_quantidade,
        atualizado_em = now()
    where id = v_produto_id;
  end loop;

  update vendas
  set subtotal = v_subtotal,
      desconto = coalesce(p_desconto, 0),
      desconto_autorizado_por = v_editor_id,
      total = v_total,
      finalizada_em = coalesce(p_finalizada_em, finalizada_em),
      editado_em = now(),
      editado_por = v_editor_id
  where id = p_venda_id;

  -- reescala proporcionalmente os pagamentos ja registrados (se o pedido ja
  -- estava conciliado) pra continuarem somando o novo total. Ajusta o
  -- ultimo pagamento pra absorver o resto do arredondamento.
  select count(*) into v_qtd_pagamentos from venda_pagamentos where venda_id = p_venda_id;

  if v_qtd_pagamentos > 0 then
    for v_pagamento in
      select id, valor from venda_pagamentos where venda_id = p_venda_id order by id
    loop
      v_i := v_i + 1;
      if v_i = v_qtd_pagamentos then
        v_novo_valor := v_total - v_soma_ja_ajustada;
      elsif v_total_antigo > 0 then
        v_novo_valor := round(v_pagamento.valor / v_total_antigo * v_total, 2);
      else
        v_novo_valor := round(v_total / v_qtd_pagamentos, 2);
      end if;

      update venda_pagamentos set valor = greatest(v_novo_valor, 0) where id = v_pagamento.id;
      v_soma_ja_ajustada := v_soma_ja_ajustada + greatest(v_novo_valor, 0);
    end loop;
  end if;
end;
$$;
