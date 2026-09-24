-- Primeiro módulo do Voz da Direita. Realizadora: Tr@de Tecnologia.
-- Aplicar depois das migrações 0001–0003 do próprio Voz da Direita.
-- Usa public.is_admin() e os perfis existentes neste repositório.
create table if not exists public.integration_elections (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2026 and 2100),
  kind text not null check (kind in ('general', 'municipal')),
  label text not null,
  status text not null default 'preparation' check (status in ('preparation', 'active', 'closed')),
  unique (year, kind)
);

create table if not exists public.integration_candidate_catalog (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.integration_elections(id),
  tse_candidate_id text not null,
  state_uf char(2) not null,
  municipality_code text,
  office text not null,
  ballot_name text not null,
  ballot_number text,
  party text,
  registration_status text,
  tse_photo_url text,
  tse_source_url text not null,
  source_checked_at timestamptz not null,
  source_payload jsonb not null default '{}'::jsonb,
  unique (election_id, tse_candidate_id)
);
create index if not exists integrated_candidates_lookup_idx
  on public.integration_candidate_catalog(election_id, state_uf, office, municipality_code);

create table if not exists public.integration_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state_uf char(2) not null,
  municipality_code text,
  administrative_region text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.integration_team_members (
  team_id uuid not null references public.integration_teams(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('supervisor', 'operator', 'auditor')),
  active boolean not null default true,
  primary key(team_id, user_id)
);

create table if not exists public.integration_studies (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.integration_elections(id),
  code text not null unique,
  title text not null,
  state_uf char(2) not null,
  municipality_code text,
  office text not null,
  sponsor_name text,
  performer_name text not null default 'Tr@de Tecnologia',
  methodology text,
  sampling_plan text,
  questionnaire jsonb not null default '[]'::jsonb,
  fieldwork_starts_at timestamptz,
  fieldwork_ends_at timestamptz,
  pesqele_registration text,
  disclosure_allowed_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'review', 'registered', 'closed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check(fieldwork_ends_at is null or fieldwork_starts_at is null or fieldwork_ends_at >= fieldwork_starts_at)
);

create table if not exists public.integration_contact_queue (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.integration_studies(id),
  assigned_team_id uuid references public.integration_teams(id),
  external_subject_ref text,
  phone text,
  origin text not null,
  contact_basis text,
  do_not_contact boolean not null default false,
  status text not null default 'pending' check(status in ('pending', 'in_progress', 'completed', 'refused', 'invalid')),
  created_at timestamptz not null default now(),
  check (phone is not null or external_subject_ref is not null)
);
create index if not exists integration_queue_study_status_idx
  on public.integration_contact_queue(study_id, status);
create table if not exists public.integration_call_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.integration_contact_queue(id),
  operator_id uuid references auth.users(id),
  provider_call_id text,
  outcome text not null check (outcome in ('no_answer', 'busy', 'invalid', 'callback', 'refused', 'completed')),
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

-- Proteção inicial: todas as gravações exigem autenticação administrativa.
-- Catálogo completo é objetivo de importação, não uma certificação editorial.
alter table public.integration_elections enable row level security;
alter table public.integration_candidate_catalog enable row level security;
alter table public.integration_teams enable row level security;
alter table public.integration_team_members enable row level security;
alter table public.integration_studies enable row level security;
alter table public.integration_contact_queue enable row level security;
alter table public.integration_call_events enable row level security;

create policy "admins elections" on public.integration_elections for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "admins catalog" on public.integration_candidate_catalog for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "admins teams" on public.integration_teams for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "admins team members" on public.integration_team_members for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "admins studies" on public.integration_studies for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "admins queue" on public.integration_contact_queue for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "admins call events" on public.integration_call_events for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.integration_elections(year, kind, label)
values (2026, 'general', 'Eleições gerais 2026'), (2028, 'municipal', 'Eleições municipais 2028')
on conflict (year, kind) do nothing;
