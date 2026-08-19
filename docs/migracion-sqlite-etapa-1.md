# Migración local a SQLite — etapa 1

> **Estado:** documento histórico de la primera etapa. La decisión vigente es desplegar la interfaz estática en GitHub Pages y utilizar Supabase; consultar `docs/despliegue-github-supabase.md`. El modelo y el análisis de Excel de este documento siguen siendo referencia para la migración PostgreSQL.

## Alcance y regla de seguridad

Esta primera etapa **no reemplaza todavía** los repositorios ni las pantallas existentes: establece el modelo normalizado, el analizador previo a una importación y sus validadores. La base operativa debe crearse vacía; `db/custom.db` no se usó como fuente histórica y los tres Excel se inspeccionaron en modo lectura, sin reescribirlos.

La siguiente etapa debe exponer la previsualización por una API local, crear un `ImportRun` en estado `PENDING`, validar todo el archivo, respaldar la base y recién entonces confirmar todas las inserciones en una única transacción. Para stock, la transacción debe insertar la instantánea como `STAGED`, desmarcar la vigente anterior y marcar la nueva `CURRENT/isCurrent=true` al final. Un error debe revertir las tres operaciones juntas.

## Evidencia de los archivos originales

Análisis realizado el 18-08-2026 con lectura binaria y `xlsx` 0.18.5:

| Archivo | Formato real / tamaño / SHA-256 | Estructura comprobada |
|---|---|---|
| `stock al 18-8-26.xls` | OLE2/BIFF XLS; 379.540 bytes; `46a89fbd85c5c077c5d1686ff9c0c291e9335bda040eca73aec6703b577bb2b3` | `Sheet1`, `A1:M1791` (1.791 × 13), encabezado inicial exacto en fila 8 |
| `Ingresos a Frimaral desde 1-1-26 a 18-8-26.xlsx` | ZIP/OOXML XLSX; 2.023.783 bytes; `1899b9b399abcd85b4696ed600a86f3151dc088bd9047c9d48ef8776088bd0a9` | `Registros A1:BH277`, `Faena A1:E23753`, `Cláusulas A1:I15671`, `Contramarca A1:D1733`, `PapelSeguridad A1:D4` |
| `export desde frimaral 1-1-26 a 18-8-26.xlsx` | ZIP/OOXML XLSX; 1.978.729 bytes; `f535ec358743639c89f738bce6a38ff82d23b7246cb68304275674ebaca34311` | Las mismas cinco hojas auxiliares; `Registros A1:BH124` |

> El hash del archivo de exportaciones se debe volver a obtener al integrar la API y será la identidad definitiva de la importación. Los originales nunca deben normalizarse ni guardarse de nuevo.

### Ingresos y exportaciones (`Registros`)

* Hay 15 filas de título/filtros. La fila exacta de encabezados es la **16** y tiene **60 columnas**, desde `Nro. Trámite`, `Fecha del Trámite`, `Nro. de C.O.T.E.` hasta `Papel de Seguridad` y `Proceso`. Los datos empiezan en la 17.
* No existen celdas combinadas, columnas/filas ocultas ni fórmulas. Hay fechas seriales Excel con formatos mixtos `d/m/yy;@`, `m/d/yy` y `m/d/yy h:mm`; por eso se interpreta el valor serial y no el texto de presentación. Los códigos llegan mayoritariamente como texto rellenado con espacios y se recortan, nunca se convierten a número.
* Ingresos contiene 261 líneas activas, 237 trámites/COTE únicos y 21 trámites multilínea. No hay bajas `SI`, claves repetidas `(trámite, Id Linea)`, COTE o producto vacíos. Totales: 10 pallets, 116.937 envases, 2.204.415 kg brutos y 2.110.573 kg netos. El movimiento declarado es 255 `Depósito` y 6 `Recarga`.
* Exportaciones contiene 108 líneas activas, 103 trámites, 102 COTE y 4 trámites multilínea. No hay bajas, claves `(trámite, Id Linea)` repetidas, COTE o producto vacíos. Totales: 581 pallets, 92.851 envases, 1.818.290 kg brutos y 1.730.553 kg netos. El archivo llamado “export” mezcla 68 `Exportación`, 37 `Depósito` y 3 `Recarga`; el importador debe reportarlo y no cambiar el tipo silenciosamente.
* Las columnas `Lote USA - Canadá` están vacías en ambos extractos; `Lotes China` aparece en 11 líneas de ingresos y 16 de salidas. Varios COTE de ingreso relacionados con una salida están escritos en `Observaciones` como texto libre, no en el COTE principal de la salida. No hay intersección directa entre los COTE principales de ambos archivos, por lo que esa relación requiere extracción explícita y revisión humana.
* Las hojas auxiliares son grandes y no deben cargarse en el navegador: `Faena` llega a 23.753 filas, `Cláusulas` a 15.671 y `Contramarca` a 1.733. Sus encabezados están en la fila 4. Se preservarán más adelante como datos relacionados o JSON auditado; no se deben confundir con las líneas de `Registros`.

### Stock

* El primer bloque tiene fila 4 `Cliente: | 311 | FRIGORIFICO CENTENARIO S.A.`, fila 5 `Fecha: | 18/08/2026`, fila 6 fecha hasta, fila 7 reporte y fila 8 encabezados: `Fec Com`, `Fec Ent`, `Contenedor`, `Pallets`, `Cajas`, `Kilos`, `Contenido`, columna H vacía, `Nro Lote`, `DUA`, `F. Venc.`, `L/E`, columna M vacía. El patrón se repite para **17 bloques/clientes** (por ejemplo, cliente 435 `ANTIC S.A.` desde fila 65); el importador debe propagar el cliente vigente a cada línea y no tratarlo como metadato único del archivo.
* No tiene combinaciones, ocultamiento ni fórmulas. Fechas son texto `dd/mm/aaaa`. Los kilos son números binarios con formato `#,##0.00` (punto decimal en el valor; coma de miles solamente en la presentación).
* Se detectaron 1.422 líneas de datos, 17 encabezados repetidos por paginación, 281 filas `Totales:` y 2 líneas exactamente repetidas. Totales de líneas: 2.360 pallets, 73.452 cajas y 2.235.753,509 kg. No hay lote ni contenedor vacío en las líneas válidas.
* `Contenido` incorpora datos no estructurados: 784 líneas contienen `COTE ...` y 20 `PASE SANITARIO ...`. Se encontraron al menos 38 tokens de stock que coinciden con COTE principales del histórico de ingresos. Producto, corte y COTE no tienen columnas propias, de modo que toda extracción debe conservar también `Contenido` original y exponer ambigüedades para revisión.

## Incompatibilidades de los parsers anteriores

1. `parseExcelRegistro.ts` acierta para estos dos ejemplares al asumir fila 16/17 y 60 posiciones, pero no verifica encabezados, hoja ni columnas; un cambio de exportación desplazaría datos silenciosamente. Además, descarta bajas en vez de auditarlas y usa `Number`, que puede destruir ceros iniciales.
2. Su modelo único `Shipment` mezcla ciclos de vida de ingresos y salidas. Tampoco conserva todos los precintos/recepción/inspección en persistencia ni relaciona las hojas auxiliares.
3. `parseStockXls.ts` busca cliente en la fila 1 y fecha en la 2, pero están en filas 4 y 5: devuelve ambos metadatos vacíos. Empieza a recorrer en la fila 7 y depende de índices. Ignora los encabezados repetidos por casualidad y crea IDs con `Date.now()`, que no sirven para deduplicar. Su parser numérico interpreta siempre la coma como separador de miles, por lo que no tolera decimales uruguayos.

El nuevo analizador detecta encabezados por nombres normalizados, recorre hojas, informa columnas desconocidas, valida fechas/números, ignora totales, conserva códigos de texto, obtiene claves deterministas y separa vista previa de persistencia.

## Decisiones del modelo

* `InboundMovement`/`InboundLine` y `OutboundMovement`/`OutboundLine` separan cabecera de líneas y permiten múltiples productos/cortes por trámite y COTE.
* `ImportRun` es el libro mayor de importaciones. `(kind, sourceHash)` impide cargar dos veces el mismo archivo; cada línea además tiene una clave única dentro de su importación. Los valores originales no modelados quedan en `rawExtraJson`/reporte para evitar pérdida.
* `StockSnapshot` es inmutable una vez confirmada. `StockLine` pertenece a una sola instantánea. `sourceHash` es único, y `isCurrent` se intercambia únicamente dentro de la transacción de confirmación.
* Pesos usan `Decimal`, fechas usan `DateTime`, identificadores/códigos usan `String`, y cantidades enteras usan `Int`. Nunca se usa `Float` para kilos persistidos.
* Bajas fuente y bajas locales son lógicas; `AuditEvent` registra confirmación, reversión y restauración. Deshacer una importación debe borrar lógicamente movimientos sin otra procedencia, borrar/invalidar sus líneas dentro de una transacción y registrar `ROLLED_BACK`; nunca se edita el Excel.
* Los índices cubren fecha, COTE, producto/corte, lote, contenedor, destino y vigencia. Las consultas de API deben ser paginadas (`take` limitado y cursor estable); agregaciones y filtros se ejecutan en SQLite.

## Plan incremental

1. **Incluido:** modelo Prisma/SQLite, analizador, normalización, validadores, deduplicación y pruebas unitarias.
2. Crear migración inicial sobre una base vacía, cliente Prisma singleton y API local de carga/preview sin escritura.
3. Implementar confirmación transaccional por lotes pequeños, reporte y backup previo; luego stock con intercambio atómico de vigencia.
4. Reemplazar lecturas estáticas/Excel/localStorage pantalla por pantalla con API paginada. Mantener preferencias visuales no críticas en `localStorage`.
5. Incorporar hojas auxiliares, vínculos extraídos de observaciones con estado “por revisar”, exportación y reversión administrativa.

## Respaldo y restauración

No se debe copiar el archivo `.db` con una escritura activa. Usar la API online backup de SQLite (`sqlite3 origen ".backup destino"`) o `VACUUM INTO` desde la misma conexión. Flujo recomendado:

1. Pausar nuevas importaciones con un bloqueo de aplicación.
2. Ejecutar `.backup` antes de cada confirmación y una vez al día; ejecutar `PRAGMA integrity_check` sobre la copia.
3. Nombrar `trazabilidad-AAAA-MM-DD_HHMMSS.sqlite`, conservar 30 días (configurable) y copiar **la copia ya cerrada** a pendrive/carpeta externa.
4. Para restaurar: cerrar la aplicación, conservar aparte la base actual, validar la copia con `PRAGMA integrity_check`, reemplazar la base y arrancar verificando conteos y la instantánea vigente. No restaurar mientras el proceso local esté abierto.

## Sistema operativo y consumo

Next.js 16 exige Node.js moderno (el paquete instalado declara Node `>=20.9.0`). Windows 7 no es un objetivo soportado por runtimes Node actuales ni una base segura para Prisma moderno. No se rebajarán dependencias para mantenerlo.

**Recomendación:** instalar Debian XFCE/LXQt, Linux Mint XFCE o Lubuntu de 64 bits, después de comprobar soporte de CPU/BIOS y periféricos. Alternativa: Windows 10/11 compatible con el hardware y con soporte vigente; el i5-2400 normalmente no satisface requisitos oficiales de Windows 11. En 4 GB, usar entorno ligero, sin contenedores ni servicios externos, producción standalone, límite de workers, importación por lotes y paginación. Antes del despliegue se deben volver a verificar las matrices oficiales de Next.js, Node y Prisma, ya que cambian por versión.

Referencias técnicas oficiales: [requisitos de instalación de Next.js](https://nextjs.org/docs/app/getting-started/installation), [releases de Node.js](https://nodejs.org/en/about/previous-releases), [requisitos de Prisma](https://www.prisma.io/docs/orm/reference/system-requirements) y [Online Backup API de SQLite](https://sqlite.org/backup.html).
