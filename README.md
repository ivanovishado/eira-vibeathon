# Expedientes EIRA

PWA para que el personal médico de las brigadas de [EIRA](https://eiraac.org/) consulte y capture
expedientes de pacientes sin conexión, y sincronice cuando haya wifi.

## Cómo funciona

- Toda lectura y escritura va contra la base local del dispositivo (IndexedDB con Dexie). La pantalla nunca espera a la red.
- El service worker precarga la app: después de la primera visita abre sin conexión y se puede instalar.
- Cada escritura clínica pasa por `src/db/repo.ts`, que guarda el registro y lo anota en la cola de salida (`colaSalida`) en la misma transacción. La sincronización (fase 3) vacía esa cola.
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

## Estructura

- `src/db/schema.ts`: tipos y tablas locales.
- `src/db/repo.ts`: escrituras (con cola de salida).
- `src/db/seed.ts`: datos ficticios.
- `src/lib/normalize.ts`: normalización de nombres y teléfonos para búsqueda.
- `src/pages/`: pantallas. `src/components/`: piezas compartidas.

## Fases

0. Base del proyecto (hecha).
1. Pacientes y búsqueda por nombre o celular.
2. Expediente y captura de consulta.
3. Sincronización con Supabase.
4. Lectura de hojas en papel con revisión humana.
5. PIN, respaldo y demo.
