-- Aplicar depois de 20260924_integrated_political_core.sql.
-- Eventos de CRM sem conteúdo de mensagens ou respostas de pesquisas.
create table if not exists public.integration_crm_contacts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_contact_id text not null,
  display_name text,
  phone text,
  state_uf char(2),
  municipality text,
  conversation_status text not null default 'unknown'
    check(conversation_status in ('unknown', 'open', 'closed', 'handoff')),
  contact_permission text not null default 'unknown'
    check (contact_permission in ('unknown', 'granted', 'revoked')),
  permission_purpose text,
  permission_source text,
  permission_recorded_at timestamptz,
  last_conversation_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(provider, external_contact_id)
);

create table if not exists public.integration_crm_inbox (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  external_contact_id text not null,
  event_type text not null,
  event_details jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique(provider, external_event_id)
);

create table if not exists public.integration_crm_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_message_id text not null,
  external_contact_id text not null,
  direction text not null check(direction in ('incoming', 'outgoing')),
  content text not null check(length(content) <= 4000),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(provider, external_message_id),
  foreign key(provider, external_contact_id)
    references public.integration_crm_contacts(provider, external_contact_id)
);

create table if not exists public.integration_crm_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  subject_ref text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check(status in ('pending', 'sent', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  check(event_type in ('contact_opt_out', 'human_handoff', 'study_invitation_request'))
);
create index if not exists integration_crm_outbox_pending_idx
  on public.integration_crm_outbox(created_at) where status = 'pending';

alter table public.integration_crm_contacts enable row level security;
alter table public.integration_crm_inbox enable row level security;
alter table public.integration_crm_messages enable row level security;
alter table public.integration_crm_outbox enable row level security;

create policy "admins read crm contacts" on public.integration_crm_contacts
  for select to authenticated using (public.is_admin());
create policy "admins read crm inbox" on public.integration_crm_inbox
  for select to authenticated using (public.is_admin());
create policy "admins read crm messages" on public.integration_crm_messages
  for select to authenticated using (public.is_admin());
create policy "admins read crm outbox" on public.integration_crm_outbox
  for select to authenticated using (public.is_admin());

-- Atualização e deduplicação são uma transação indivisível. A rota valida o HMAC.
create or replace function public.ingest_integration_crm_event(
  p_provider text, p_event_id text, p_contact_id text, p_type text,
  p_purpose text default null, p_source text default null,
  p_recorded_at timestamptz default null, p_details jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_provider <> 'crm' or p_type not in
    ('opt_in', 'opt_out', 'contact_updated', 'conversation_started',
     'conversation_message', 'conversation_closed', 'human_handoff', 'delivery_status')
    or length(p_event_id) < 1 or length(p_event_id) > 120
    or length(p_contact_id) < 1 or length(p_contact_id) > 120
    or jsonb_typeof(p_details) <> 'object'
  then raise exception 'Invalid CRM event'; end if;

  if p_type = 'opt_in' and
    (nullif(trim(p_purpose), '') is null or nullif(trim(p_source), '') is null or p_recorded_at is null)
  then raise exception 'Opt-in requires purpose, source and time'; end if;

  insert into public.integration_crm_inbox(provider, external_event_id, external_contact_id, event_type, event_details)
    values (p_provider, p_event_id, p_contact_id, p_type, p_details)
    on conflict (provider, external_event_id) do nothing;
  if not found then return false; end if;

  insert into public.integration_crm_contacts(provider, external_contact_id)
    values (p_provider, p_contact_id) on conflict (provider, external_contact_id) do nothing;

  if p_type = 'opt_out' then
    update public.integration_crm_contacts set contact_permission = 'revoked',
      permission_purpose = null, permission_source = null,
      permission_recorded_at = now(), updated_at = now()
    where provider = p_provider and external_contact_id = p_contact_id;
  elsif p_type = 'opt_in' then
    update public.integration_crm_contacts set contact_permission = 'granted',
      permission_purpose = p_purpose, permission_source = p_source,
      permission_recorded_at = p_recorded_at, updated_at = now()
    where provider = p_provider and external_contact_id = p_contact_id
      and (permission_recorded_at is null or permission_recorded_at <= p_recorded_at);
  elsif p_type = 'conversation_started' then
    update public.integration_crm_contacts set last_conversation_at = now(),
      conversation_status = 'open', updated_at = now()
    where provider = p_provider and external_contact_id = p_contact_id;
  elsif p_type = 'conversation_closed' then
    update public.integration_crm_contacts set conversation_status = 'closed', updated_at = now()
    where provider = p_provider and external_contact_id = p_contact_id;
  elsif p_type = 'human_handoff' then
    update public.integration_crm_contacts set conversation_status = 'handoff', updated_at = now()
    where provider = p_provider and external_contact_id = p_contact_id;
  elsif p_type = 'contact_updated' then
    update public.integration_crm_contacts set
      display_name = coalesce(p_details->>'name', display_name),
      phone = coalesce(p_details->>'phone', phone),
      state_uf = coalesce(p_details->>'state_uf', state_uf),
      municipality = coalesce(p_details->>'municipality', municipality),
      updated_at = now()
    where provider = p_provider and external_contact_id = p_contact_id;
  elsif p_type = 'conversation_message' then
    insert into public.integration_crm_messages
      (provider, external_message_id, external_contact_id, direction, content, occurred_at)
    values (p_provider, p_details->>'message_id', p_contact_id,
      p_details->>'direction', p_details->>'content',
      (p_details->>'occurred_at')::timestamptz);
  end if;
  return true;
end; $$;
revoke all on function public.ingest_integration_crm_event(text,text,text,text,text,text,timestamptz,jsonb)
  from public, anon, authenticated;
grant execute on function public.ingest_integration_crm_event(text,text,text,text,text,text,timestamptz,jsonb)
  to service_role;
