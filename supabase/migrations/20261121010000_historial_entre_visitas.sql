-- Historial entre visitas: antecedentes y atención recibida fuera de EIRA.
-- Igual que las consultas, solo se agregan: una corrección es un registro nuevo con
-- corrige_a, y quitar uno es una corrección con retirado.

create table public.antecedentes (
  id uuid primary key,
  paciente_id uuid not null,
  corrige_a uuid,
  retirado boolean,
  ambito text not null check (ambito in ('personal', 'familiar')),
  parentesco text,
  tipo text not null
    check (tipo in ('cancer', 'cronica', 'ginecoobstetrico', 'quirurgico', 'alergia', 'otro')),
  descripcion text not null,
  cuando text,
  notas text,
  created_at timestamptz not null,
  creado_por uuid default auth.uid(),
  servidor_xid xid8 not null default pg_current_xact_id(),
  servidor_actualizado_en timestamptz not null default now()
);

create table public.atenciones_externas (
  id uuid primary key,
  paciente_id uuid not null,
  corrige_a uuid,
  retirado boolean,
  tipo text not null
    check (tipo in ('consulta', 'estudio', 'diagnostico', 'tratamiento', 'hospitalizacion', 'otro')),
  especialidad text,
  fecha date not null,
  fecha_aproximada boolean,
  lugar text,
  resumen text not null,
  consulta_id uuid,
  created_at timestamptz not null,
  creado_por uuid default auth.uid(),
  servidor_xid xid8 not null default pg_current_xact_id(),
  servidor_actualizado_en timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['antecedentes', 'atenciones_externas'] loop
    execute format('create index on public.%I (paciente_id)', t);
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
end;
$$;
