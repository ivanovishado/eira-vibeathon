# Expedientes EIRA

PWA para que el personal médico de las brigadas de [EIRA](https://eiraac.org/) consulte y capture
expedientes de pacientes sin conexión, y sincronice cuando haya wifi.

## Cómo funciona

- Toda lectura y escritura va contra la base local del dispositivo (IndexedDB con Dexie). La pantalla nunca espera a la red.
- El service worker precarga la app: después de la primera visita abre sin conexión y se puede instalar.
- Cada escritura clínica pasa por `src/db/repo.ts`, que guarda el registro y lo anota en la cola de salida (`colaSalida`) en la misma transacción. La sincronización vacía esa cola.
- Con Supabase configurado, la médica inicia sesión una vez (con internet, antes de la brigada) y la app sincroniza sola en segundo plano cuando hay red. Sin red, todo sigue funcionando y la sesión no se vuelve a pedir.
- Las consultas no se editan; una corrección es una consulta nueva con `corrigeA`.

## Desarrollo

Requiere Node 24 (ver `.nvmrc`).

```sh
npm install
npm run dev        # servidor de desarrollo
npm test           # pruebas (Vitest + fake-indexeddb)
npm run lint
npm run typecheck
npm run build && npm run preview   # para probar el modo sin conexión
```

El service worker solo se activa en el build de producción (`npm run preview`), no en `npm run dev`.

En **Ajustes** se pueden cargar 2,000 pacientes ficticias para desarrollo y demo.

## Cuenta y sincronización (Supabase)

Sin `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` la app funciona en **modo solo local**, igual que antes.

### Conectar un proyecto

1. Crea un proyecto en Supabase y aplica las migraciones de `supabase/migrations`:

   ```sh
   supabase db push --db-url "postgresql://postgres:<contraseña>@<host>:5432/postgres"
   # o: supabase link --project-ref <ref> && supabase db push
   ```

   También se puede pegar el SQL de cada migración, en orden, en el SQL Editor del panel.

2. En **Authentication → Sign In / Providers** desactiva «Allow new users to sign up»: cualquier usuario autenticado puede leer todos los expedientes, así que las cuentas deben crearlas las coordinadoras en **Authentication → Users → Add user** (con «Auto Confirm User»). La médica pone su nombre en la pantalla **Cuenta** de la app; se guarda en su cuenta y prellena el campo médico de cada consulta.

3. Copia `.env.example` a `.env.local` con la URL del proyecto y la llave publishable (o `anon`) de **Project Settings → API**. Son públicas por diseño; nunca uses la llave secreta ni `service_role` en la app. Para el despliegue, define las mismas variables en el entorno de build.

### Cómo sincroniza

- **Subida**: la cola `colaSalida` se envía por lotes con `upsert` por `id` (los UUID se generan en el dispositivo), así reenviar tras un corte no duplica nada. Las consultas se envían con «ignorar duplicados»: son append-only también en el servidor (no hay permiso de `update`). En pacientes gana el `updated_at` más reciente. Un registro que el servidor rechaza se aísla y no detiene a los demás.
- **Descarga**: la función `cambios_desde` entrega los cambios de cada tabla después de un cursor `(servidor_xid, id)`, por páginas. Cada página y su cursor se guardan en una sola transacción local, así un corte retoma donde iba. Un cambio local aún sin subir no se sobrescribe.
- **Cuándo**: al abrir la app, al volver la red o la pestaña, unos segundos después de cada captura, cada 5 minutos y con «Sincronizar ahora» en **Cuenta**. Tras un fallo reintenta con espera exponencial (5 s a 5 min). Las peticiones tienen tiempo límite de 20 s y nunca bloquean la pantalla.
- **Sesión**: la cuenta se guarda en el dispositivo; sin red la app no pide login. Si el token venció sin red, se renueva solo al volver la conexión; solo si el servidor lo rechaza se pide iniciar sesión de nuevo para sincronizar.
- **Tablas**: la lista vive en `src/sync/tablas.ts`. Para sincronizar una tabla nueva, agrégala a `TablaSincronizada`, crea su migración (columnas comunes, trigger `marcar_cambio` y RLS, ver la migración inicial) y añade su entrada en `TABLAS_SINCRONIZADAS`; el compilador verifica que estén todos sus campos.

### Probar contra Supabase local

Requiere Docker y la CLI de Supabase.

```sh
supabase start      # aplica supabase/migrations; muestra la URL y la llave publishable
# Crea una usuaria de prueba en Studio (http://127.0.0.1:54323) o con la API admin.
SUPABASE_PRUEBA_URL=http://127.0.0.1:54321 \
SUPABASE_PRUEBA_LLAVE=<publishable> \
SUPABASE_PRUEBA_CORREO=<correo> SUPABASE_PRUEBA_CONTRASENA=<contraseña> \
npx vitest run src/sync/supabase.integration.test.ts
```

Sin esas variables la prueba de integración se omite; `npm test` cubre la sincronización con un servidor simulado (`src/sync/servidorSimulado.ts`). Para usar la app contra Supabase local, pon su URL y llave en `.env.local`.

## Estructura

- `src/db/schema.ts`: tipos y tablas locales.
- `src/db/repo.ts`: escrituras (con cola de salida).
- `src/db/seed.ts`: datos ficticios.
- `src/sync/`: sincronización (tablas, motor, programador de reintentos, cliente Supabase).
- `src/cuenta/`: configuración, cliente Supabase y cuenta de la médica.
- `supabase/migrations/`: esquema del servidor con RLS.
- `src/lib/normalize.ts`: normalización de nombres y teléfonos para búsqueda.
- `src/pages/`: pantallas. `src/components/`: piezas compartidas.

## Fases

0. Base del proyecto (hecha).
1. Pacientes y búsqueda por nombre o celular.
2. Expediente y captura de consulta.
3. Cuenta del médico y sincronización con Supabase.
4. Lectura de hojas en papel con revisión humana.
5. PIN, respaldo y demo.
