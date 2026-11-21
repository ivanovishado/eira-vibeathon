-- Tablas sincronizadas con la app (equivalentes a src/db/schema.ts, en snake_case).
--
-- Columnas comunes de toda tabla sincronizada:
--   id                      uuid generado en el cliente (idempotencia).
--   creado_por              usuario que subió el registro por primera vez.
--   servidor_xid            transacción que hizo el último cambio; es el cursor de descarga.
--   servidor_actualizado_en hora del servidor del último cambio (informativo).
--
-- Sin llaves foráneas a propósito: los dispositivos suben cuando pueden y en cualquier
-- orden, y un registro huérfano temporal no debe atorar la cola de salida.

-- Pacientes ------------------------------------------------------------------
create table public.pacientes (
  id uuid primary key,
  folio text,
  nombres text not null,
  apellido_paterno text not null,
  apellido_materno text,
  fecha_nacimiento date,
  telefonos text[] not null default '{}',
  comunidad text,
  municipio text,
  curp text,
  nombre_busqueda text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  creado_por uuid default auth.uid(),
  servidor_xid xid8 not null default pg_current_xact_id(),
  servidor_actualizado_en timestamptz not null default now()
);

-- Brigadas -------------------------------------------------------------------
create table public.brigadas (
  id uuid primary key,
  fecha date not null,
  lugar text not null,
  responsable text,
  created_at timestamptz not null,
  creado_por uuid default auth.uid(),
  servidor_xid xid8 not null default pg_current_xact_id(),
  servidor_actualizado_en timestamptz not null default now()
);

-- Consultas (append-only: una corrección es una consulta nueva con corrige_a) ---
create table public.consultas (
  id uuid primary key,
  paciente_id uuid not null,
  brigada_id uuid,
  fecha date not null,
  medico text not null,
  motivo text not null,
  antecedentes text,
  signos_vitales jsonb,
  exploracion text,
  diagnostico text,
  plan text,
  corrige_a uuid,
  created_at timestamptz not null,
  creado_por uuid default auth.uid(),
  servidor_xid xid8 not null default pg_current_xact_id(),
  servidor_actualizado_en timestamptz not null default now()
);

-- Estudios -------------------------------------------------------------------
create table public.estudios (
  id uuid primary key,
  paciente_id uuid not null,
  consulta_id uuid,
  tipo text not null
    check (tipo in ('mastografia', 'ultrasonido', 'papanicolaou', 'nutricion', 'otro')),
  fecha date not null,
  resultado text,
  created_at timestamptz not null,
  creado_por uuid default auth.uid(),
  servidor_xid xid8 not null default pg_current_xact_id(),
  servidor_actualizado_en timestamptz not null default now()
);

create index on public.consultas (paciente_id);
create index on public.estudios (paciente_id);

-- Marca de cambio ------------------------------------------------------------
-- Toda escritura mueve servidor_xid; creado_por lo pone el servidor y no cambia. Si la
-- tabla tiene updated_at, una versión más vieja que la guardada se ignora (gana la
-- edición más reciente aunque llegue antes).
create function public.marcar_cambio() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) ->> 'updated_at') is not null
       and (to_jsonb(new) ->> 'updated_at')::timestamptz
         < (to_jsonb(old) ->> 'updated_at')::timestamptz then
      return null;
    end if;
    new.creado_por := old.creado_por;
  else
    new.creado_por := coalesce(auth.uid(), new.creado_por);
  end if;
  new.servidor_xid := pg_current_xact_id();
  new.servidor_actualizado_en := now();
  return new;
end;
$$;

-- Descarga incremental -------------------------------------------------------
-- Devuelve los cambios de una tabla posteriores al cursor (servidor_xid, id), en orden.
-- Solo entrega filas de transacciones anteriores a la más vieja todavía en curso, así
-- una transacción que confirma tarde nunca queda detrás de un cursor ya avanzado.
create function public.cambios_desde(
  tabla text,
  desde_xid text default '0',
  desde_id uuid default '00000000-0000-0000-0000-000000000000',
  limite integer default 500
) returns setof jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = tabla
      and c.column_name = 'servidor_xid'
  ) then
    raise exception 'La tabla % no se sincroniza', tabla using errcode = '42P01';
  end if;
  return query execute format(
    'select to_jsonb(t) from public.%I t
      where (t.servidor_xid, t.id) > ($1::xid8, $2)
        and t.servidor_xid < pg_snapshot_xmin(pg_current_snapshot())
      order by t.servidor_xid, t.id
      limit $3',
    tabla
  ) using desde_xid, desde_id, least(greatest(limite, 1), 1000);
end;
$$;

revoke all on function public.cambios_desde(text, text, uuid, integer) from public, anon;
grant execute on function public.cambios_desde(text, text, uuid, integer) to authenticated;

-- Permisos y RLS: solo usuarios autenticados leen y escriben; nadie borra. ------
do $$
declare
  t text;
begin
  foreach t in array array['pacientes', 'brigadas', 'consultas', 'estudios'] loop
    execute format('create index on public.%I (servidor_xid, id)', t);
    execute format(
      'create trigger marcar_cambio before insert or update on public.%I
         for each row execute function public.marcar_cambio()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert on table public.%I to authenticated', t);
    execute format(
      'create policy "autenticados leen" on public.%I for select to authenticated using (true)', t);
    execute format(
      'create policy "autenticados agregan" on public.%I for insert to authenticated with check (true)', t);
  end loop;

  -- Las consultas no se editan; lo demás sí.
  foreach t in array array['pacientes', 'brigadas', 'estudios'] loop
    execute format('grant update on table public.%I to authenticated', t);
    execute format(
      'create policy "autenticados actualizan" on public.%I for update to authenticated using (true) with check (true)', t);
  end loop;
end;
$$;
