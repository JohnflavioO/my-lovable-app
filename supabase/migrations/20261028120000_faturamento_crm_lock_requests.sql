-- Integração do CRM com o sistema de faturamento.
-- Esta migração é apenas um arquivo no GitHub; não foi aplicada ao banco.

alter table public.quotes
  add column if not exists billing_sent_at timestamptz,
  add column if not exists billing_order_number text,
  add column if not exists billing_send_status text not null default 'not_sent',
  add column if not exists billing_send_error text;

create table if not exists public.quote_edit_requests (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text
);

create index if not exists quote_edit_requests_quote_id_idx
  on public.quote_edit_requests (quote_id, requested_at desc);

alter table public.quote_edit_requests enable row level security;

drop policy if exists "Users can read their quote edit requests" on public.quote_edit_requests;
create policy "Users can read their quote edit requests"
  on public.quote_edit_requests
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    or exists (
      select 1
      from public.quotes q
      where q.id = quote_id
        and (q.created_by = (select auth.uid()) or q.salesperson_id = (select auth.uid()))
    )
  );

drop policy if exists "Users can request edits for their own quotes" on public.quote_edit_requests;
create policy "Users can request edits for their own quotes"
  on public.quote_edit_requests
  for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and length(trim(reason)) between 3 and 1000
    and exists (
      select 1
      from public.quotes q
      where q.id = quote_id
        and (q.created_by = (select auth.uid()) or q.salesperson_id = (select auth.uid()))
        and q.billing_sent_at is not null
    )
  );

-- Após o envio, só metadados da integração podem mudar na linha do orçamento.
create or replace function public.prevent_sent_quote_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.billing_sent_at is not null then
    if (to_jsonb(new) - array['billing_sent_at','billing_order_number','billing_send_status','billing_send_error'])
       is distinct from
       (to_jsonb(old) - array['billing_sent_at','billing_order_number','billing_send_status','billing_send_error']) then
      raise exception 'Este orçamento foi enviado ao faturamento e está bloqueado para edição. Solicite a edição ao setor de faturamento.'
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_sent_quote_edits on public.quotes;
create trigger prevent_sent_quote_edits
  before update on public.quotes
  for each row execute function public.prevent_sent_quote_edits();

create or replace function public.prevent_sent_quote_item_mutations()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_quote_id uuid;
  sent_at timestamptz;
begin
  target_quote_id := case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
  select q.billing_sent_at into sent_at
  from public.quotes q
  where q.id = target_quote_id;

  if sent_at is not null then
    raise exception 'Os itens deste orçamento foram bloqueados após o envio ao faturamento. Solicite a edição ao setor de faturamento.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists prevent_sent_quote_item_mutations on public.quote_items;
create trigger prevent_sent_quote_item_mutations
  before insert or update or delete on public.quote_items
  for each row execute function public.prevent_sent_quote_item_mutations();
