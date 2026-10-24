create extension if not exists pgcrypto;

create type public.group_role as enum ('owner', 'admin', 'viewer');
create type public.challenge_status as enum ('draft', 'open', 'closed');
create type public.investment_type as enum ('UNITS', 'STOCK_MARKET');
create type public.transaction_status as enum ('pending', 'verified', 'rejected');
create type public.transaction_source as enum ('manual', 'import');

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_memberships (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.group_role not null default 'viewer',
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.investors (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  name_lower text not null,
  phone text not null default '',
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  portal_uid uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, name_lower),
  unique (group_id, id)
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2200),
  start_date date not null,
  end_date date not null,
  status public.challenge_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (group_id, id)
);

create unique index one_open_challenge_per_group
  on public.challenges(group_id) where status = 'open';

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete restrict,
  investor_id uuid not null references public.investors(id) on delete restrict,
  investor_name text not null,
  type public.investment_type not null,
  amount bigint not null check (amount > 0),
  date date not null,
  institution text not null default '',
  reference text not null default '',
  proof_url text not null default '',
  proof_path text not null default '',
  raw_message text not null default '',
  notes text not null default '',
  status public.transaction_status not null default 'pending',
  source public.transaction_source not null default 'manual',
  created_by uuid not null references auth.users(id) on delete restrict,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount <= 9007199254740991),
  foreign key (group_id, challenge_id) references public.challenges(group_id, id),
  foreign key (group_id, investor_id) references public.investors(group_id, id)
);

create unique index transactions_group_reference_idx
  on public.transactions(group_id, reference) where reference <> '';

create index transactions_group_date_idx on public.transactions(group_id, date desc);
create index transactions_challenge_idx on public.transactions(group_id, challenge_id);
create index transactions_investor_idx on public.transactions(group_id, investor_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  entity text not null check (entity in ('user', 'investor', 'challenge', 'transaction')),
  entity_id text not null,
  action text not null,
  before jsonb,
  after jsonb,
  user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index audit_logs_group_created_idx on public.audit_logs(group_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger investors_set_updated_at before update on public.investors
  for each row execute function public.set_updated_at();
create trigger challenges_set_updated_at before update on public.challenges
  for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

create or replace function public.is_group_member(target_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_memberships m
    where m.group_id = target_group and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create or replace function public.has_group_role(target_group uuid, allowed public.group_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_memberships m
    where m.group_id = target_group and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role = any(allowed)
  );
$$;
revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.has_group_role(uuid, public.group_role[]) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.has_group_role(uuid, public.group_role[]) to authenticated;

create or replace function public.create_group_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_group_id uuid;
  user_name text;
  group_name text;
begin
  user_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
  group_name := nullif(trim(new.raw_user_meta_data ->> 'group_name'), '');
  if group_name is null or char_length(group_name) < 2 or char_length(group_name) > 120 then
    raise exception 'A valid group name is required to create an account.';
  end if;

  insert into public.profiles (id, full_name, email)
  values (new.id, user_name, coalesce(new.email, ''));
  insert into public.groups (name, created_by)
  values (group_name, new.id) returning id into new_group_id;
  insert into public.group_memberships (group_id, user_id, role)
  values (new_group_id, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_group_for_new_user();

alter table public.groups enable row level security;
alter table public.profiles enable row level security;
alter table public.group_memberships enable row level security;
alter table public.investors enable row level security;
alter table public.challenges enable row level security;
alter table public.transactions enable row level security;
alter table public.audit_logs enable row level security;

grant usage on schema public to authenticated;
grant select on public.groups, public.profiles, public.group_memberships to authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update, delete on public.investors, public.challenges, public.transactions to authenticated;
grant select, insert on public.audit_logs to authenticated;

create policy "members read their groups" on public.groups for select to authenticated
  using (public.is_group_member(id));
create policy "users read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "users update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "users read their memberships" on public.group_memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.has_group_role(group_id, array['owner','admin']::public.group_role[]));

create policy "members read investors" on public.investors for select to authenticated
  using (public.is_group_member(group_id));
create policy "admins manage investors" on public.investors for all to authenticated
  using (public.has_group_role(group_id, array['owner','admin']::public.group_role[]))
  with check (public.has_group_role(group_id, array['owner','admin']::public.group_role[]));

create policy "members read challenges" on public.challenges for select to authenticated
  using (public.is_group_member(group_id));
create policy "admins manage challenges" on public.challenges for all to authenticated
  using (public.has_group_role(group_id, array['owner','admin']::public.group_role[]))
  with check (public.has_group_role(group_id, array['owner','admin']::public.group_role[]));

create policy "members read transactions" on public.transactions for select to authenticated
  using (public.is_group_member(group_id));
create policy "admins manage transactions" on public.transactions for all to authenticated
  using (public.has_group_role(group_id, array['owner','admin']::public.group_role[]))
  with check (public.has_group_role(group_id, array['owner','admin']::public.group_role[]));

create policy "admins read audit logs" on public.audit_logs for select to authenticated
  using (public.has_group_role(group_id, array['owner','admin']::public.group_role[]));
create policy "admins create audit logs" on public.audit_logs for insert to authenticated
  with check (public.has_group_role(group_id, array['owner','admin']::public.group_role[]) and user_id = (select auth.uid()));

create or replace function public.import_challenge_sheet(
  p_group_id uuid,
  p_challenge_id uuid,
  p_rows jsonb,
  p_expected jsonb
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb;
  totals jsonb := '{}'::jsonb;
  aggregate jsonb;
  investor_uuid uuid;
  investor_label text;
  investor_lower text;
  item_units bigint;
  item_stock bigint;
  expected_units bigint;
  expected_stock bigint;
  expected_final bigint;
  actual_units bigint := 0;
  actual_stock bigint := 0;
  record_row record;
  investment_row record;
  transaction_uuid uuid;
  transaction_row jsonb;
begin
  if not public.has_group_role(p_group_id, array['owner','admin']::public.group_role[]) then
    raise exception 'You are not allowed to import into this group.' using errcode = '42501';
  end if;
  if coalesce(jsonb_typeof(p_rows), '') <> 'array' then
    raise exception 'The import rows must be an array.';
  end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 80 then
    raise exception 'The import must contain between 1 and 80 investor rows.';
  end if;
  if coalesce(jsonb_typeof(p_expected), '') <> 'object' then
    raise exception 'Expected totals are missing.';
  end if;
  if not exists (
    select 1 from public.challenges c where c.id = p_challenge_id and c.group_id = p_group_id and c.status = 'open'
  ) then
    raise exception 'Open the challenge before importing its transactions.';
  end if;

  expected_units := (p_expected ->> 'units')::bigint;
  expected_stock := (p_expected ->> 'stock')::bigint;
  expected_final := (p_expected ->> 'final')::bigint;
  if expected_units is null or expected_stock is null or expected_final is null
    or expected_units < 0 or expected_stock < 0 or expected_final < 0
    or expected_units > 9007199254740991 or expected_stock > 9007199254740991
    or expected_final > 9007199254740991 then
    raise exception 'Expected totals must be non-negative whole TZS amounts.';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    item_units := (item ->> 'units')::bigint;
    item_stock := (item ->> 'stock')::bigint;
    if item_units is null or item_stock is null or item_units < 0 or item_stock < 0
      or item_units > 9007199254740991 or item_stock > 9007199254740991 then
      raise exception 'Every investor row must have valid non-negative whole TZS amounts.';
    end if;
    if char_length(trim(coalesce(item ->> 'name', ''))) not between 2 and 120 then
      raise exception 'Every investor row must have a valid investor name.';
    end if;
    actual_units := actual_units + item_units;
    actual_stock := actual_stock + item_stock;
  end loop;
  if actual_units <> expected_units or actual_stock <> expected_stock or actual_units + actual_stock <> expected_final then
    raise exception 'The imported totals do not match the sheet totals. Correct the data before importing.';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    investor_label := trim(item ->> 'name');
    investor_lower := lower(investor_label);
    investor_uuid := nullif(item ->> 'investorId', '')::uuid;
    if investor_uuid is null then
      select i.id into investor_uuid from public.investors i
      where i.group_id = p_group_id and i.name_lower = investor_lower;
      if investor_uuid is null then
        insert into public.investors (group_id, name, name_lower)
        values (p_group_id, investor_label, investor_lower)
        on conflict (group_id, name_lower) do nothing
        returning id into investor_uuid;
        if investor_uuid is null then
          select i.id into investor_uuid from public.investors i
          where i.group_id = p_group_id and i.name_lower = investor_lower;
        else
          insert into public.audit_logs (group_id, entity, entity_id, action, before, after, user_id)
          values (p_group_id, 'investor', investor_uuid::text, 'import_create', null,
            jsonb_build_object('name', investor_label, 'name_lower', investor_lower, 'status', 'active'), auth.uid());
        end if;
      end if;
    end if;
    if not exists (
      select 1 from public.investors i where i.id = investor_uuid and i.group_id = p_group_id and i.status = 'active'
    ) then
      raise exception 'The selected investor % is unavailable or inactive.', investor_label;
    end if;

    item_units := (item ->> 'units')::bigint;
    item_stock := (item ->> 'stock')::bigint;
    aggregate := coalesce(totals -> investor_uuid::text, jsonb_build_object('name', investor_label, 'units', 0, 'stock', 0));
    totals := jsonb_set(totals, array[investor_uuid::text], jsonb_build_object(
      'name', aggregate ->> 'name',
      'units', (aggregate ->> 'units')::bigint + item_units,
      'stock', (aggregate ->> 'stock')::bigint + item_stock
    ), true);
  end loop;

  for record_row in select key as investor_id, value as amounts from jsonb_each(totals) loop
    select i.name into investor_label from public.investors i
    where i.id = record_row.investor_id::uuid and i.group_id = p_group_id;
    for investment_row in select * from (values
      ('UNITS'::public.investment_type, (record_row.amounts ->> 'units')::bigint),
      ('STOCK_MARKET'::public.investment_type, (record_row.amounts ->> 'stock')::bigint)
    ) as amounts(kind, value) loop
      if investment_row.value = 0 then continue; end if;
      insert into public.transactions (
        group_id, challenge_id, investor_id, investor_name, type, amount, date,
        status, source, created_by, verified_by, verified_at, notes
      ) values (
        p_group_id, p_challenge_id, record_row.investor_id::uuid, investor_label,
        investment_row.kind, investment_row.value,
        (select c.end_date from public.challenges c where c.id = p_challenge_id),
        'verified', 'import', auth.uid(), auth.uid(), now(), 'Imported from the challenge summary sheet'
      ) returning id into transaction_uuid;
      select to_jsonb(t) into transaction_row from public.transactions t where t.id = transaction_uuid;
      insert into public.audit_logs (group_id, entity, entity_id, action, before, after, user_id)
      values (p_group_id, 'transaction', transaction_uuid::text, 'import', null, transaction_row, auth.uid());
    end loop;
  end loop;
end;
$$;

revoke all on function public.import_challenge_sheet(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.import_challenge_sheet(uuid, uuid, jsonb, jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "group members read transaction proofs" on storage.objects for select to authenticated
  using (
    bucket_id = 'proofs' and
    public.is_group_member(((storage.foldername(name))[1])::uuid)
  );
create policy "group admins upload transaction proofs" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'proofs' and
    public.has_group_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::public.group_role[])
  );
create policy "group admins update transaction proofs" on storage.objects for update to authenticated
  using (
    bucket_id = 'proofs' and
    public.has_group_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::public.group_role[])
  ) with check (
    bucket_id = 'proofs' and
    public.has_group_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::public.group_role[])
  );
create policy "group admins delete transaction proofs" on storage.objects for delete to authenticated
  using (
    bucket_id = 'proofs' and
    public.has_group_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::public.group_role[])
  );
