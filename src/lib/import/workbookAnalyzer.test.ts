import { describe, expect, test } from 'bun:test';
import { makeDedupKey, normalizeHeader, parseDecimal, parseUruguayanDate, preserveCode } from './normalization';
import { analyzeRows, detectHeader } from './workbookAnalyzer';

describe('normalización de importaciones', () => {
  test('normaliza encabezados reales sin perder semántica', () => expect(normalizeHeader('Nro. de C.O.T.E.')).toBe('numero_de_cote'));
  test('conserva códigos y ceros iniciales cuando llegan como texto', () => expect(preserveCode('00127 ')).toBe('00127'));
  test('interpreta fechas uruguayas y rechaza fechas imposibles', () => {
    expect(parseUruguayanDate('18/08/2026')?.toISOString()).toBe('2026-08-18T00:00:00.000Z');
    expect(parseUruguayanDate('31/02/2026')).toBeNull();
  });
  test('acepta separadores decimales locales e internacionales', () => {
    expect(parseDecimal('1.234,56')).toBe(1234.56); expect(parseDecimal('1,234.56')).toBe(1234.56);
  });
  test('crea claves deterministas', () => expect(makeDedupKey([' p1 ', 'L  01'])).toBe('P1|L 01'));
});

describe('detección y validación', () => {
  const rows = [['Reporte'], [], ['Nro. Trámite','Fecha del Trámite','Nro. de C.O.T.E.','Denominación de Mercadería','Corte','Id Linea','Peso Neto'], ['0001','18/08/2026','P001','CARNE','Falda',1,'1.234,5'], ['0001','18/08/2026','P001','CARNE','Falda',1,'1.234,5'], ['Totales:', '', '', '', '', '', '1234,5']];
  test('encuentra encabezados tras títulos', () => expect(detectHeader(rows, 'INBOUND').row).toBe(2));
  test('informa válidas, duplicadas, desconocidas e ignora totales', () => {
    const result = analyzeRows(rows, 'INBOUND', 'Registros');
    expect(result.headerRow).toBe(3); expect(result.validRows).toBe(1); expect(result.duplicateRows).toBe(1);
    expect(result.unknown).toEqual([]); expect(result.rejectedRows).toEqual([]);
  });

  test('reconoce las 60 columnas del registro real', async () => {
    const { analyzeWorkbook } = await import('./workbookAnalyzer');
    const buffer = await Bun.file('public/data/Ingresos a Frimaral desde 1-1-26 a 18-8-26.xlsx').arrayBuffer();
    const result = analyzeWorkbook(buffer, 'INBOUND');
    expect(result.headerRow).toBe(16); expect(result.headers).toHaveLength(60);
    expect(result.unknown).toEqual([]); expect(result.validRows).toBe(261);
  });

  test('detecta exactamente las líneas duplicadas del stock real', async () => {
    const { analyzeWorkbook } = await import('./workbookAnalyzer');
    const buffer = await Bun.file('public/data/stock al 18-8-26.xls').arrayBuffer();
    const result = analyzeWorkbook(buffer, 'STOCK');
    expect(result.headerRow).toBe(8); expect(result.validRows).toBe(1420);
    expect(result.rejectedRows).toEqual([]); expect(result.duplicateRows).toBe(2);
  });
});
