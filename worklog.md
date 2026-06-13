
## 2025-01-XX: Cargar Stock feature with Pase Sanitario support

### Files created:
- `src/lib/parseStockXls.ts` — New module for parsing warehouse stock XLS files
  - Parses .xls/.xlsx warehouse stock reports (e.g., movimientopallets*.xls)
  - Extracts COTE codes (P12345) via regex `/COTE\s+(P\d{4,8})/i`
  - Extracts Pase Sanitario codes (B44473) via regex `/PASE\s+SANITARIO\s+(B\d{4,8})/i`
  - Skips header rows (0-6), "Totales:" rows, and empty rows
  - Handles date formats: DD/MM/YYYY, Excel serial dates, null dates (30/12/1899)
  - Exports types: `StockPallet`, `StockLoad`, `StockCodigoAgg`
  - Exports `buildStockAggMap()` for aggregating pallets by code
  - Exports `parseStockXls(file)` async function

### Files modified:
- `src/components/cruce-caliral/CruceCaliral.tsx`
  - Added stock state: `stockData`, `stockAggMap`, `stockLoading`
  - Changed subTab type to include `'stock'`
  - Added `StockTable` component (new, ~250 lines) for the Stock sub-tab:
    - Cross-reference table: stock vs ingreso vs export cajas
    - Filter bar with search and dropdown filter (all/con ingreso/sin ingreso/con diff)
    - Expandable rows showing pallet-level detail with ingreso info
    - Color-coded difference badges (green=match, red=missing, blue=extra)
    - Export cajas tracking from manual COTE links across all exports
  - Added "Cargar Stock" button in header
  - Added `handleLoadStock()` file upload handler
  - Stock data loaded from and saved to localStorage (`trazabilidad_stock_data`)
  - Added `'trazabilidad_stock_data'` to `ALL_LS_KEYS` for backup/restore
  - Updated `SinCruceInlineRow` to accept and use `stockAggMap` prop
  - Updated SinCruce datalist to show stock codes (COTEs + Pases) as suggestions
  - Updated `extractIngresoCotes()` to also extract B codes (Pase Sanitario)
  - Added `Stock` sub-tab button with count badge

- `src/lib/googleSheets.ts`
  - Added `'trazabilidad_stock_data'` to `SYNC_KEYS` array

### Other fixes:
- Removed `src/app/api/` directory (API routes incompatible with `output: "export"` static build)
- Added `export const dynamic = 'force-static'` to all API routes before removal
- Installed `pdfjs-dist` package (was missing from node_modules)

### Deployment:
- Build succeeded with `npx next build` (output to `./out`)
- Pushed to `origin/main` on GitHub
- GitHub Actions CI will deploy to GitHub Pages at `/trazabilidad/`
