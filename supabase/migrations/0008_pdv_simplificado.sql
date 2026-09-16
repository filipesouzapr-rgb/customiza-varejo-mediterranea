-- Fase 2 do redesenho combinado com o cliente (Mediterranea):
--
-- 1. O /caixa deixa de mostrar QUALQUER valor pro operador (preco, subtotal,
--    total, desconto, troco) e perde o conceito de sessao de caixa fisico
--    (abrir/fechar caixa, sangria/suprimento, forma de pagamento com valor).
--    O operador so lanca itens (produto + quantidade), vincula um cliente
--    (agora obrigatorio) e finaliza.
-- 2. Pagamento/forma/desconto deixam de ser decididos no momento da venda -
--    toda venda nasce "pendente de conciliacao" e o admin (supervisor/dono)
--    decide depois, na tela Fiado (Fase 3), a forma de pagamento real e
--    pode editar itens/preco/desconto do pedido.
--
-- NAO apaga caixa_sessoes/caixa_movimentos (ficam como historico morto) -
-- so para de exigir vinculo com elas nas vendas novas.

alter table vendas alter column caixa_sessao_id drop not null;

-- Seguro hoje: 0 linhas com cliente_id nulo neste projeto.
alter table vendas alter column cliente_id set not null;

alter table vendas add column conciliado_em timestamptz;
alter table vendas add column conciliado_por uuid references operadores (id);
alter table vendas add column editado_em timestamptz;
alter table vendas add column editado_por uuid references operadores (id);

-- Assinatura antiga (0005_multitenant) recebia caixa/pagamentos/desconto -
-- sai de cena, substituida pela versao simplificada abaixo.
drop function if exists finalizar_venda(uuid, uuid, uuid, jsonb, jsonb, numeric, uuid);

-- finalizar_venda agora: sem caixa, sem pagamento, sem desconto. O preco de
-- cada item vem do cadastro de produtos NESTE MOMENTO (nao confia em preco
-- mandado pelo cliente/app) - reforca que o operador nunca precisa (nem
-- consegue) influenciar valor nenhum.
create or replace function finalizar_venda(
  p_operador_id uuid,
  p_cliente_id uuid,
  p_itens jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid;
  v_venda_id uuid;
  v_subtotal numeric(10, 2);
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade numeric(10, 3);
  v_preco numeric(10, 2);
begin
  v_empresa_id := empresa_do_usuario_atual();
  if v_empresa_id is null then
    raise exception 'Operador sem empresa associada';
  end if;

  if p_cliente_id is null then
    raise exception 'Venda exige um cliente vinculado';
  end if;

  if not exists (
    select 1 from clientes where id = p_cliente_id and empresa_id = v_empresa_id
  ) then
    raise exception 'Cliente nao encontrado para esta empresa';
  end if;

  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Venda sem itens';
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

  select coalesce(sum(p.preco * (item->>'quantidade')::numeric), 0)
  into v_subtotal
  from jsonb_array_elements(p_itens) as item
  join produtos p on p.id = (item->>'produto_id')::uuid;

  insert into vendas (
    empresa_id, operador_id, cliente_id, status,
    subtotal, desconto, total, finalizada_em
  )
  values (
    v_empresa_id, p_operador_id, p_cliente_id, 'finalizada',
    v_subtotal, 0, v_subtotal, now()
  )
  returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric;

    select preco into v_preco from produtos where id = v_produto_id;

    insert into venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal)
    values (v_venda_id, v_produto_id, v_quantidade, v_preco, v_quantidade * v_preco);

    update produtos
    set estoque_atual = estoque_atual - v_quantidade,
        atualizado_em = now()
    where id = v_produto_id;
  end loop;

  return v_venda_id;
end;
$$;
