import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assertKnownTable, normalizeLimit } from './scope-map.ts';
Deno.test('limite de cursor nunca ultrapassa 500',()=>{assertEquals(normalizeLimit(900),500);assertEquals(normalizeLimit(0),1);assertEquals(normalizeLimit(undefined),500)});
Deno.test('tabela nova falha fechada',()=>{assertThrows(()=>assertKnownTable('nova_tabela',['quotes']),Error,'tabela nova_tabela sem regra de empresa')});
Deno.test('tabela conhecida é aceita',()=>assertEquals(assertKnownTable('quotes',['quotes']),undefined));
