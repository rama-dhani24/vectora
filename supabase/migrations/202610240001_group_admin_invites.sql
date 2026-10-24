-- A group creator is the Super Admin in the application (database role: owner).
-- Each group can have at most two active Admin memberships.

create table public.group_admin_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  invite_code uuid not null unique default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  canceled_at timestamptz
);

create unique index one_pending_admin_invite_per_email
  on public.group_admin_invites (group_id, email)
  where accepted_at is null and canceled_at is null;
create index group_admin_invites_group_created_idx
  on public.group_admin_invites (group_id, created_at desc);

alter table public.group_admin_invites enable row level security;
revoke all on public.group_admin_invites from anon, authenticated;

create or replace function public.enforce_two_active_group_admins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_admin_count integer;
begin
  if new.role = 'admin' and new.status = 'active' then
    perform 1 from public.groups where id = new.group_id for update;
    select count(*) into active_admin_count
      from public.group_memberships m
      where m.group_id = new.group_id
        and m.role = 'admin'
        and m.status = 'active'
        and m.user_id <> new.user_id;
    if active_admin_count >= 2 then
      raise exception 'A group can have no more than two active admins.';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_two_active_group_admins
  before insert or update of group_id, user_id, role, status on public.group_memberships
  for each row execute function public.enforce_two_active_group_admins();

create or replace function public.create_group_admin_invite(target_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_group uuid;
  active_admin_count integer;
  pending_invite_count integer;
  normalized_email text := lower(trim(target_email));
  new_invite_code uuid := gen_random_uuid();
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  select m.group_id into target_group
    from public.group_memberships m
    where m.user_id = actor_id and m.status = 'active' and m.role = 'owner';
  if target_group is null then
    raise exception 'Only the group Super Admin can invite admins.';
  end if;

  -- Serialize invite creation and invite acceptance against the two-admin cap.
  perform 1 from public.groups where id = target_group for update;
  update public.group_admin_invites i
    set canceled_at = now()
    where i.group_id = target_group
      and i.accepted_at is null and i.canceled_at is null and i.expires_at <= now();
  if exists (
    select 1
      from public.group_memberships m
      join public.profiles p on p.id = m.user_id
      where m.group_id = target_group and lower(p.email) = normalized_email
  ) then
    raise exception 'That email already belongs to a group member.';
  end if;
  select count(*) into active_admin_count
    from public.group_memberships m
    where m.group_id = target_group and m.role = 'admin' and m.status = 'active';
  select count(*) into pending_invite_count
    from public.group_admin_invites i
    where i.group_id = target_group
      and i.accepted_at is null and i.canceled_at is null and i.expires_at > now();
  if active_admin_count + pending_invite_count >= 2 then
    raise exception 'This group already has two admins or pending admin invitations.';
  end if;

  insert into public.group_admin_invites (group_id, email, invite_code, created_by)
    values (target_group, normalized_email, new_invite_code, actor_id);
  return new_invite_code::text;
end;
$$;

create or replace function public.list_group_admin_invites()
returns table (
  invite_id uuid,
  invited_email text,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  canceled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_group uuid;
begin
  select m.group_id into target_group
    from public.group_memberships m
    where m.user_id = actor_id and m.status = 'active' and m.role = 'owner';
  if target_group is null then
    raise exception 'Only the group Super Admin can view admin invitations.';
  end if;
  return query
    select i.id, i.email, i.created_at, i.expires_at, i.accepted_at, i.canceled_at
    from public.group_admin_invites i
    where i.group_id = target_group
    order by i.created_at desc;
end;
$$;

create or replace function public.cancel_group_admin_invite(target_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_group uuid;
begin
  select m.group_id into target_group
    from public.group_memberships m
    where m.user_id = actor_id and m.status = 'active' and m.role = 'owner';
  if target_group is null then
    raise exception 'Only the group Super Admin can cancel admin invitations.';
  end if;
  update public.group_admin_invites i
    set canceled_at = now()
    where i.id = target_invite_id and i.group_id = target_group
      and i.accepted_at is null and i.canceled_at is null;
  return found;
end;
$$;

revoke all on function public.create_group_admin_invite(text) from public, anon;
revoke all on function public.list_group_admin_invites() from public, anon;
revoke all on function public.cancel_group_admin_invite(uuid) from public, anon;
grant execute on function public.create_group_admin_invite(text) to authenticated;
grant execute on function public.list_group_admin_invites() to authenticated;
grant execute on function public.cancel_group_admin_invite(uuid) to authenticated;

-- Signup with a valid invitation joins the inviter's group as an Admin. A normal
-- signup continues to create a new group and its first user as the owner.
create or replace function public.create_group_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_group_id uuid;
  user_name text;
  group_name text;
  invite_code text := new.raw_user_meta_data ->> 'admin_invite';
  invite_row public.group_admin_invites%rowtype;
begin
  user_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1)
  );
  insert into public.profiles (id, full_name, email)
    values (new.id, user_name, coalesce(new.email, ''));

  if invite_code is not null and invite_code <> '' then
    select * into invite_row
      from public.group_admin_invites i
      where i.invite_code::text = invite_code
        and i.accepted_at is null and i.canceled_at is null and i.expires_at > now()
      for update;
    if not found or lower(invite_row.email) <> lower(coalesce(new.email, '')) then
      raise exception 'This admin invitation is invalid, expired, or belongs to another email.';
    end if;
    perform 1 from public.groups where id = invite_row.group_id for update;
    insert into public.group_memberships (group_id, user_id, role)
      values (invite_row.group_id, new.id, 'admin');
    update public.group_admin_invites set accepted_at = now() where id = invite_row.id;
    return new;
  end if;

  group_name := nullif(trim(new.raw_user_meta_data ->> 'group_name'), '');
  if group_name is null or char_length(group_name) < 2 or char_length(group_name) > 120 then
    raise exception 'A valid group name is required to create an account.';
  end if;
  insert into public.groups (name, created_by)
    values (group_name, new.id) returning id into new_group_id;
  insert into public.group_memberships (group_id, user_id, role)
    values (new_group_id, new.id, 'owner');
  return new;
end;
$$;
