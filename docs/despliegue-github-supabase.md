# Despliegue en GitHub Pages con Supabase

## Arquitectura

GitHub Pages publica únicamente la exportación estática de Next.js. El navegador usa Supabase Auth y realiza lecturas protegidas por Row Level Security (RLS). Las futuras escrituras e importaciones transaccionales se implementarán en Supabase Edge Functions; Pages nunca recibe `service_role`, la contraseña PostgreSQL ni una URL de conexión directa.

## 1. Crear el esquema

En un entorno de prueba de Supabase, abrir **SQL Editor**, copiar y ejecutar `supabase/migrations/20260819000000_initial_traceability.sql`. Revisar que se hayan creado las tablas, índices, tipos, triggers y políticas RLS. Repetir mediante un flujo de migraciones versionado para producción; no editar las tablas manualmente después.

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

## 4. Verificación

1. Abrir la URL de Pages terminada en `/trazabilidad/`.
2. Iniciar sesión con el correo creado en Supabase; las contraseñas antiguas deben fallar.
3. Confirmar en Supabase Auth que se registró el inicio de sesión.
4. Probar con otro usuario de ensayo y comprobar que no puede leer filas del usuario principal.
5. No cargar todavía los Excel a producción. La UI continúa leyendo parte de sus datos históricos/locales hasta completar los repositorios Supabase y la Edge Function de importación.

## Siguiente etapa

Implementar una Edge Function autenticada para previsualizar y confirmar importaciones, incluyendo hash, deduplicación, validación completa y transacción. Después, migrar cada pantalla de `localStorage` a consultas paginadas de Supabase. Drive puede guardar Excel originales y exportaciones, pero no es la base de datos.
