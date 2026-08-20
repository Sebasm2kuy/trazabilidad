# Despliegue en GitHub Pages con Supabase

## Arquitectura

GitHub Pages publica únicamente la exportación estática de Next.js. El navegador usa Supabase Auth y realiza lecturas protegidas por Row Level Security (RLS). Las futuras escrituras e importaciones transaccionales se implementarán en Supabase Edge Functions; Pages nunca recibe `service_role`, la contraseña PostgreSQL ni una URL de conexión directa.

## 1. Crear el esquema

En un entorno de prueba de Supabase, abrir **SQL Editor** y crear una consulta nueva.

> **Importante:** `supabase/migrations/20260819000000_initial_traceability.sql` es la ruta de un archivo del repositorio, **no es una sentencia SQL**. No hay que escribir ni ejecutar esa ruta en el editor. Si se ejecuta solo el nombre del archivo, PostgreSQL responde `ERROR 42601: syntax error at or near "supabase"`.

Para aplicarla manualmente:

1. Abrir [`supabase/migrations/20260819000000_initial_traceability.sql`](../supabase/migrations/20260819000000_initial_traceability.sql) en GitHub.
2. Pulsar **Raw** o abrir la vista completa del archivo.
3. Copiar **todo el contenido**, desde la primera línea que comienza con `-- Supabase/PostgreSQL foundation` hasta la última línea que termina en `Edge Functions.`.
4. Pegar ese contenido en la consulta nueva de Supabase SQL Editor.
5. Pulsar **Run** una sola vez y comprobar que aparece `Success. No rows returned`.

No pegar ninguno de estos textos en SQL Editor:

```text
supabase/migrations/20260819000000_initial_traceability.sql
../supabase/migrations/20260819000000_initial_traceability.sql
https://github.com/.../20260819000000_initial_traceability.sql
```

Después de ejecutarla, abrir otra consulta y verificar el resultado con SQL real:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'import_runs', 'inbound_movements', 'inbound_lines',
    'outbound_movements', 'outbound_lines', 'stock_snapshots',
    'stock_lines', 'audit_events'
  )
order by table_name;
```

La comprobación debe devolver nueve filas. Revisar además que se hayan creado índices, tipos, triggers y políticas RLS. Para producción, repetir mediante un flujo de migraciones versionado; no editar las tablas manualmente después.

La migración permite a cada usuario autenticado leer solamente sus registros. No concede escrituras operativas al navegador: eso es intencional hasta implementar la Edge Function transaccional.

## 2. Crear el usuario

1. En **Authentication > Users**, desactivar el alta pública si solamente utilizará la aplicación una persona.
2. Crear el usuario desde el panel o enviarle una invitación.
3. Confirmar que el trigger creó una fila en `public.profiles`.
4. Para otorgar acceso completo, cambiar su rol con SQL desde el panel administrativo:

```sql
update public.profiles
set role = 'supervisor'
where id = '<uuid-del-usuario>';
```

No se aceptan nuevamente las credenciales locales `comercial/comercial` o `supervisor/supervisor`; fueron eliminadas del frontend.

## 3. Configurar GitHub

En **Repository > Settings > Secrets and variables > Actions**, crear:

- `NEXT_PUBLIC_SUPABASE_URL`: el **Project URL**, con forma `https://<proyecto>.supabase.co`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: la clave pública `anon`/publishable del proyecto.

Aunque GitHub los denomine secrets, ambos valores se incorporan a la aplicación estática y son observables en el navegador. Esto es seguro solo con RLS correctamente configurado. No crear variables `NEXT_PUBLIC_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_DATABASE_URL` ni equivalentes.

En **Settings > Pages**, seleccionar **GitHub Actions** como origen. El workflow valida las variables, compila `out/` y lo publica. Se puede iniciar desde **Actions > Deploy to GitHub Pages > Run workflow** o mediante un push a `main`.

Después del deploy, el job `Verify deployed site and Supabase` comprueba automáticamente que la página y sus recursos respondan, que Supabase Auth esté accesible y que las tablas principales existan sin exponer filas a un visitante anónimo. El mismo control puede ejecutarse localmente, con las dos variables públicas configuradas, mediante `npm run smoke:deployment -- https://sebasm2kuy.github.io/trazabilidad/`.

## 4. Verificación

1. Abrir la URL de Pages terminada en `/trazabilidad/`.
2. Iniciar sesión con el correo creado en Supabase; las contraseñas antiguas deben fallar.
3. Confirmar en Supabase Auth que se registró el inicio de sesión.
4. Probar con otro usuario de ensayo y comprobar que no puede leer filas del usuario principal.
5. No cargar todavía los Excel a producción. La UI continúa leyendo parte de sus datos históricos/locales hasta completar los repositorios Supabase y la Edge Function de importación.

## Siguiente etapa

Implementar una Edge Function autenticada para previsualizar y confirmar importaciones, incluyendo hash, deduplicación, validación completa y transacción. Después, migrar cada pantalla de `localStorage` a consultas paginadas de Supabase. Drive puede guardar Excel originales y exportaciones, pero no es la base de datos.

## Confirmación transaccional de stock

Para habilitar el botón de confirmación después de desplegar esta etapa:

1. Ejecutar en **SQL Editor** el contenido completo de `supabase/migrations/20260820000000_commit_stock_import.sql` del mismo modo que la migración inicial. Esta función RPC valida el rol supervisor, detecta el mismo hash, inserta importación/snapshot/líneas, verifica totales, cambia la instantánea vigente y registra auditoría dentro de una única transacción.
2. Instalar e iniciar sesión en Supabase CLI en un equipo de administración compatible.
3. Vincular el repositorio al proyecto correcto y desplegar la función:

```bash
supabase link --project-ref <project-ref>
supabase functions deploy stock-import
```

No usar `--no-verify-jwt`. La función requiere el token del usuario, recalcula el SHA-256 del archivo recibido, valida todas las líneas normalizadas y recién entonces llama a la RPC. Los secretos `SUPABASE_URL` y `SUPABASE_ANON_KEY` son proporcionados por el entorno de Edge Functions; no se agregan a GitHub Pages.

Después, hacer un deploy de Pages, previsualizar el XLS de stock y confirmar una sola vez. Verificar en Supabase que `import_runs.status = 'COMMITTED'`, que existe exactamente una fila `stock_snapshots.is_current = true`, que el conteo de `stock_lines` coincide con la vista previa y que `audit_events` contiene `COMMIT`.

## Pantallas disponibles durante la migración

Hasta que todos los repositorios hayan sido migrados, el supervisor solo verá **Dashboard**, **A Depósitos**, **Exportaciones** e **Importar / Exportar**. Las pantallas Trazabilidad Explorer, Búsqueda, Mercado Nacional, Clientes Estratégicos, Comparativa, Analíticas y Cruces se ocultan porque todavía leen archivos JSON/XLSX incluidos o claves heredadas de `localStorage`; mostrarlas daría la impresión incorrecta de que esos registros ya existen en Supabase.

No se borran los Excel originales ni se elimina código histórico en esta etapa. Cada pantalla se volverá a habilitar solamente después de sustituir sus lectores por consultas Supabase/RPC paginadas y agregar pruebas con una base vacía. El render principal también rechaza una pestaña heredada guardada en preferencias y muestra Dashboard, evitando que una URL o estado anterior salte la restricción del menú.
