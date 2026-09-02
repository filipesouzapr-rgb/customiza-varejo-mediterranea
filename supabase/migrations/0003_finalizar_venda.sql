-- Finaliza uma venda de forma atomica: grava a venda, os itens, os
-- pagamentos e desconta o estoque, tudo ou nada. Evita gravacao parcial se
-- a conexao cair no meio do fluxo, e evita corrida de estoque entre
-- itens/pagamentos separados.
create or replace function finalizar_venda(
  p_caixa_sessao_id uuid,
  p_operador_id uuid,
  p_cliente_id uuid,
  p_itens jsonb, -- [{produto_id, quantidade, preco_unitario}]
  p_pagamentos jsonb, -- [{forma, valor}]
  p_desconto numeric default 0,
  p_desconto_autorizado_por uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_venda_id uuid;
  v_subtotal numeric(10, 2);
  v_total numeric(10, 2);
  v_total_pago numeric(10, 2);
  v_item jsonb;
  v_pagamento jsonb;
begin
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
    caixa_sessao_id, operador_id, cliente_id, status,
    subtotal, desconto, desconto_autorizado_por, total, finalizada_em
  )
  values (
    p_caixa_sessao_id, p_operador_id, p_cliente_id, 'finalizada',
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
