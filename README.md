# Trazabilidad - Frigorífico San Jacinto (Nirea S.A.)

App de trazabilidad para gestión de envíos de carne con dashboard, tablas, analíticas y import/export.

## Setup local

```bash
git clone https://github.com/Sebasm2kuy/trazabilidad.git
cd trazabilidad
bun install
bun run db:push
bun run db:generate
bun run dev
```

Abrir http://localhost:3000/

## Cargar datos históricos

Colocar el archivo Excel en `db/` y ejecutar:

```bash
# Convertir Excel a JSON (requiere Python con pandas y openpyxl)
python3 -c "
import pandas as pd
df_raw = pd.read_excel('db/envios.xlsx', header=None, skiprows=15)
headers = df_raw.iloc[0].tolist()
df = pd.read_excel('db/envios.xlsx', header=None, skiprows=16)
df.columns = headers
import json, os
cols = ['Nro. Trámite','Fecha del Trámite','Nro. de C.O.T.E.','Nombre Médico Veterinario','Nombre del Establecimiento Certificador','Nombre Establecimiento Productor','Nro. Establecimiento Productor','Fecha emitido COTE','Temperatura ºC','Tipo de Transporte','Contenedor - Serie y Nro.','Matrícula Camión','Precinto 1','Nombre Establecimiento Destino','Tipo de Movimiento','Observaciones','País de Destino','Baja','Id Linea','Código Envase','Denominación de Mercadería','Corte','Pallets','Cantidad de Envases','Peso Bruto','Peso Neto','Nro. Certificado Sanitario','Shipping','Lote USA - Canadá','Lotes China','Fecha Inicio Faena','Fecha Fin Faena','Fecha Inicio Producción','Fecha Fin de Producción','Fecha Inicio Congelación','Fecha Fin Congelación','Proceso']
df = df[cols]
for c in df.select_dtypes(include='object').columns:
    df[c] = df[c].apply(lambda x: str(x).strip().replace(chr(10),' ') if pd.notna(x) and str(x).strip() not in ['nan','None',''] else None)
for c in ['Nro. Trámite','Nro. Establecimiento Productor','Temperatura ºC','Pallets','Cantidad de Envases','Peso Bruto','Peso Neto','Id Linea','Código Envase']:
    if c in df.columns: df[c] = pd.to_numeric(df[c], errors='coerce')
for c in ['Fecha del Trámite','Fecha emitido COTE','Fecha Inicio Faena','Fecha Fin Faena','Fecha Inicio Producción','Fecha Fin de Producción','Fecha Inicio Congelación','Fecha Fin Congelación']:
    if c in df.columns: df[c] = pd.to_datetime(df[c], errors='coerce')
records = df.to_dict(orient='records')
for rec in records:
    for k in rec:
        if isinstance(rec[k], pd.Timestamp): rec[k] = rec[k].isoformat()
        elif rec[k] is None or (isinstance(rec[k], float) and pd.isna(rec[k])): rec[k] = None
with open('db/seed_data.json','w',encoding='utf-8') as f: json.dump(records, f, ensure_ascii=False, indent=2, default=str)
print(f'Generated {len(records)} records')
"

# Cargar a la base de datos
bun run db/seed.ts
```

## Deploy en Vercel

1. Ir a https://vercel.com/new
2. Conectar el repo `Sebasm2kuy/trazabilidad`
3. Framework Preset: Next.js
4. Variables de entorno: (ninguna necesaria para demo)
5. Deploy

> **Nota:** Para producción se recomienda usar PostgreSQL en vez de SQLite.

## Stack

- Next.js 16 (App Router)
- Prisma ORM + SQLite
- shadcn/ui + Tailwind CSS
- Recharts
- Zustand
- XLSX (import/export)