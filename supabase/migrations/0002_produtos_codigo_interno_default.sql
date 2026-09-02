-- Gera codigo_interno automaticamente (PLU sequencial), para produtos sem
-- codigo de barras de fabrica (producao propria: pao, salgado, etc.).
create sequence if not exists produtos_codigo_interno_seq;

alter table produtos
  alter column codigo_interno set default ('PLU' || lpad(nextval('produtos_codigo_interno_seq')::text, 6, '0'));
