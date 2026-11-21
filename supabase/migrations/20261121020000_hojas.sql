-- Hojas de papel fotografiadas para leerlas con un modelo y revisarlas a mano.
-- La fila lleva el estado y la lectura; la foto vive en el bucket privado `hojas`.

create table public.hojas (
  id uuid primary key,
  estado text not null
    check (estado in ('sin-enviar', 'leyendo', 'por-revisar', 'confirmada', 'descartada', 'error')),
  ruta_imagen text,
  capturada_por text,
  lectura jsonb,
  error_lectura text,
  paciente_id uuid,
  consulta_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  creado_por uuid default auth.uid(),
  servidor_xid xid8 not null default pg_current_xact_id(),
  servidor_actualizado_en timestamptz not null default now()
);

create index on public.hojas (servidor_xid, id);
create index on public.hojas (consulta_id);

create trigger marcar_cambio before insert or update on public.hojas
  for each row execute function public.marcar_cambio();

-- Una hoja confirmada ya generó una consulta: un dispositivo atrasado no puede
-- regresarla a otro estado (por ejemplo, al terminar tarde una lectura).
create function public.conservar_hoja_confirmada() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado = 'confirmada' and new.estado <> 'confirmada' then
    return null;
  end if;
  return new;
end;
$$;

create trigger conservar_confirmada before update on public.hojas
  for each row execute function public.conservar_hoja_confirmada();

alter table public.hojas enable row level security;
revoke all on table public.hojas from anon, authenticated;
grant select, insert, update on table public.hojas to authenticated;
create policy "autenticados leen" on public.hojas
  for select to authenticated using (true);
create policy "autenticados agregan" on public.hojas
  for insert to authenticated with check (true);
create policy "autenticados actualizan" on public.hojas
  for update to authenticated using (true) with check (true);

-- Fotos: bucket privado, solo usuarios autenticados; nadie borra. ----------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hojas', 'hojas', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "hojas: autenticados leen" on storage.objects
  for select to authenticated using (bucket_id = 'hojas');
create policy "hojas: autenticados suben" on storage.objects
  for insert to authenticated with check (bucket_id = 'hojas');
create policy "hojas: autenticados reemplazan" on storage.objects
  for update to authenticated using (bucket_id = 'hojas') with check (bucket_id = 'hojas');
