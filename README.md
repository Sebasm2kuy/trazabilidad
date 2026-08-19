# Trazabilidad - Frigorífico San Jacinto (Nirea S.A.)

App de trazabilidad para gestión de envíos de carne con dashboard, tablas, analíticas y import/export.

## Setup local

```bash
git clone https://github.com/Sebasm2kuy/trazabilidad.git
cd trazabilidad
npm ci
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA npm run dev
```

Abrir http://localhost:3000/

## Cargar datos históricos

No ejecutar los scripts SQLite anteriores ni insertar los Excel manualmente. Primero aplica la migración Supabase y crea el usuario siguiendo [`docs/despliegue-github-supabase.md`](docs/despliegue-github-supabase.md). La importación productiva permanecerá deshabilitada hasta incorporar la Edge Function transaccional.

## Deploy en GitHub Pages + Supabase

1. Aplicar la migración de `supabase/migrations` en un proyecto de prueba.
2. Crear el usuario en Supabase Auth y asignar su rol en `public.profiles`.
3. Agregar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en los secrets de GitHub Actions.
4. Elegir **GitHub Actions** como origen en `Settings > Pages`.
5. Ejecutar el workflow `Deploy to GitHub Pages`.

Consulta el procedimiento y las advertencias de seguridad en [`docs/despliegue-github-supabase.md`](docs/despliegue-github-supabase.md). GitHub Pages no ejecuta Prisma ni conserva secretos de servidor.

## Stack

- Next.js 16 (App Router)
- Supabase Auth + PostgreSQL con RLS
- shadcn/ui + Tailwind CSS
- Recharts
- Zustand
- XLSX (import/export)
