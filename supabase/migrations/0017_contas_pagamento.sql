-- Conta de pagamento (carteira com saldo) vinculavel a baixa de contas a
-- pagar, com aportes manuais. Saldo e' sempre derivado (view), nunca campo
-- solto - mesmo espirito de situacaoVenda.ts no front.

create table contas_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) default empresa_do_usuario_atual(),
  nome text not null,
  saldo_inicial numeric(10, 2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table movimentacoes_conta_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) default empresa_do_usuario_atual(),
  conta_pagamento_id uuid not null references contas_pagamento (id),
  tipo text not null check (tipo in ('entrada', 'saida')),
  valor numeric(10, 2) not null check (valor > 0),
  data date not null default current_date,
  conta_a_pagar_id uuid references contas_pagar (id),
  descricao text,
  criado_em timestamptz not null default now()
);

alter table contas_pagar add column conta_pagamento_id uuid references contas_pagamento (id);

-- Sem "Automatically expose new tables" - GRANT explicito obrigatorio.
grant select, insert, update, delete on contas_pagamento to authenticated;
grant select, insert, update, delete on movimentacoes_conta_pagamento to authenticated;

alter table contas_pagamento enable row level security;
alter table movimentacoes_conta_pagamento enable row level security;

create policy "admin da empresa" on contas_pagamento for all
  using (empresa_id = empresa_do_usuario_atual() and eh_admin_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual() and eh_admin_do_usuario_atual());

create policy "admin da empresa" on movimentacoes_conta_pagamento for all
  using (empresa_id = empresa_do_usuario_atual() and eh_admin_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual() and eh_admin_do_usuario_atual());

-- Saldo atual = saldo_inicial + entradas - saidas. security_invoker garante
-- que a view roda com RLS do usuario logado (nunca do owner); o join inclui
-- empresa_id como defesa em profundidade.
create view contas_pagamento_saldo
with (security_invoker = true) as
select
  cp.id,
  cp.empresa_id,
  cp.nome,
  cp.ativo,
  cp.saldo_inicial,
  cp.saldo_inicial
    + coalesce(sum(m.valor) filter (where m.tipo = 'entrada'), 0)
    - coalesce(sum(m.valor) filter (where m.tipo = 'saida'), 0) as saldo_atual
from contas_pagamento cp
left join movimentacoes_conta_pagamento m
  on m.conta_pagamento_id = cp.id and m.empresa_id = cp.empresa_id
group by cp.id, cp.empresa_id, cp.nome, cp.ativo, cp.saldo_inicial;

grant select on contas_pagamento_saldo to authenticated;

-- Confirma pagamento e, se houver conta de pagamento vinculada, grava a
-- saida na mesma transacao - evita o saldo dessincronizar se uma das duas
-- escritas falhasse separadamente.
create or replace function confirmar_pagamento_contas_pagar(
  p_conta_id uuid,
  p_data_pagamento date,
  p_forma_pagamento text,
  p_conta_pagamento_id uuid
)
returns void
language plpgsql
as $$
declare
  v_empresa_id uuid;
  v_valor numeric;
  v_desconto numeric;
begin
  v_empresa_id := empresa_do_usuario_atual();
  if v_empresa_id is null or not eh_admin_do_usuario_atual() then
    raise exception 'Somente supervisor ou dono pode confirmar pagamento';
  end if;

  select valor, desconto into v_valor, v_desconto
  from contas_pagar where id = p_conta_id and empresa_id = v_empresa_id;

  if v_valor is null then
    raise exception 'Conta nao encontrada';
  end if;

  if p_conta_pagamento_id is not null then
    if not exists (
      select 1 from contas_pagamento
      where id = p_conta_pagamento_id and empresa_id = v_empresa_id
    ) then
      raise exception 'Conta de pagamento invalida';
    end if;
  end if;

  update contas_pagar
  set status = 'conciliado',
      data_pagamento = p_data_pagamento,
      forma_pagamento = p_forma_pagamento,
      conta_pagamento_id = p_conta_pagamento_id,
      atualizado_em = now()
  where id = p_conta_id;

  if p_conta_pagamento_id is not null then
    insert into movimentacoes_conta_pagamento
      (empresa_id, conta_pagamento_id, tipo, valor, data, conta_a_pagar_id, descricao)
    values
      (v_empresa_id, p_conta_pagamento_id, 'saida', v_valor - coalesce(v_desconto, 0), p_data_pagamento, p_conta_id, 'Baixa de conta a pagar');
  end if;
end;
$$;
