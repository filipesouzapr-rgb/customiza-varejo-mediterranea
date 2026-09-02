-- ROTEIRO DE TESTE MANUAL — nao e uma migration, nao aplicar em producao.
-- Roda isso no SQL Editor DEPOIS de aplicar 0005_multitenant.sql, num
-- projeto de teste/homologacao (nao em cima de dado real).
--
-- Pre-requisito: o SQL Editor conecta como superusuario, nao como um
-- usuario autenticado de verdade — pra testar RLS de forma realista,
-- precisamos simular a sessao de dois operadores. Como operadores.id tem
-- foreign key pra auth.users, os dois precisam ser usuarios de Auth reais.
--
-- PASSO 1 (fora do SQL Editor): no painel, Authentication → Users → Add
-- user, crie dois usuarios throwaway:
--   teste-a@exemplo.com
--   teste-b@exemplo.com
-- Copie o UUID de cada um (aparece na lista de usuarios) e substitua abaixo.

-- PASSO 2: monta o cenario (roda como superusuario, sem simulacao ainda).

insert into empresas (id, nome, slug) values
  ('00000000-0000-0000-0000-00000000000a', 'Empresa Teste A', 'empresa-teste-a'),
  ('00000000-0000-0000-0000-00000000000b', 'Empresa Teste B', 'empresa-teste-b');

-- Troque os dois UUIDs abaixo pelos que voce copiou no Passo 1.
insert into operadores (id, empresa_id, nome, papel) values
  ('<uuid-do-teste-a>', '00000000-0000-0000-0000-00000000000a', 'Operador A', 'dono'),
  ('<uuid-do-teste-b>', '00000000-0000-0000-0000-00000000000b', 'Operador B', 'dono');

insert into produtos (empresa_id, nome, unidade, preco) values
  ('00000000-0000-0000-0000-00000000000a', 'Produto exclusivo da Empresa A', 'unidade', 10.00),
  ('00000000-0000-0000-0000-00000000000b', 'Produto exclusivo da Empresa B', 'unidade', 20.00);

-- PASSO 3: simula a sessao do Operador A e confirma que so ve o produto dele.

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<uuid-do-teste-a>')::text, true);

select nome from empresas;              -- deve trazer so "Empresa Teste A"
select nome from produtos;              -- deve trazer so "Produto exclusivo da Empresa A"
select nome, empresa_id from operadores; -- deve trazer so o proprio Operador A

reset role;

-- PASSO 4: mesma coisa pro Operador B — deve ver exatamente o espelho
-- (so a Empresa B / produto B), nunca nada da Empresa A.

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<uuid-do-teste-b>')::text, true);

select nome from empresas;              -- deve trazer so "Empresa Teste B"
select nome from produtos;              -- deve trazer so "Produto exclusivo da Empresa B"
select nome, empresa_id from operadores; -- deve trazer so o proprio Operador B

reset role;

-- PASSO 4.1: exatamente o que o app de verdade faz - insere um produto SEM
-- mandar empresa_id nenhum (o insert do backoffice nao manda esse campo).
-- O default tem que preencher sozinho com a empresa do Operador B.

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<uuid-do-teste-b>')::text, true);

insert into produtos (nome, unidade, preco)
values ('Produto cadastrado sem empresa_id explicito', 'unidade', 5.00)
returning empresa_id; -- esperado: 00000000-0000-0000-0000-00000000000b (a empresa do Operador B, sozinho)

reset role;

-- PASSO 5: tenta o ataque direto — logado como A, tenta inserir um produto
-- "roubando" o empresa_id da empresa B. Isso TEM que falhar (a policy tem
-- "with check", entao um insert com empresa_id errado e rejeitado).

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<uuid-do-teste-a>')::text, true);

insert into produtos (empresa_id, nome, unidade, preco)
values ('00000000-0000-0000-0000-00000000000b', 'Produto injetado por A na empresa B', 'unidade', 1);
-- Esperado: erro "new row violates row-level security policy".

reset role;

-- PASSO 6: tenta finalizar uma venda referenciando um produto de outra
-- empresa (o cenario que a validacao explicita dentro de finalizar_venda
-- foi criada pra pegar, ja que FK nao e filtrada por RLS).

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<uuid-do-teste-a>')::text, true);

-- Primeiro abre um caixa como A (senao finalizar_venda nem chega a testar
-- o produto - falharia antes, no caixa).
insert into caixa_sessoes (empresa_id, operador_id, valor_abertura)
values ('00000000-0000-0000-0000-00000000000a', '<uuid-do-teste-a>', 100)
returning id;
-- Copie o id retornado e use como <caixa-id-a> abaixo.

select finalizar_venda(
  '<caixa-id-a>',
  '<uuid-do-teste-a>',
  null,
  jsonb_build_array(jsonb_build_object(
    'produto_id', (select id from produtos where nome = 'Produto exclusivo da Empresa B'),
    'quantidade', 1,
    'preco_unitario', 20.00
  )),
  jsonb_build_array(jsonb_build_object('forma', 'dinheiro', 'valor', 20.00)),
  0,
  null
);
-- Esperado: erro "Um ou mais produtos nao pertencem a esta empresa".

reset role;

-- PASSO 7: limpeza (roda como superusuario de novo).
-- delete from caixa_sessoes where empresa_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
-- delete from produtos where empresa_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
-- delete from operadores where empresa_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
-- delete from empresas where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
-- (E apagar os dois usuarios teste-a/teste-b em Authentication → Users.)
