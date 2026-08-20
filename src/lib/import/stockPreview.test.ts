import { describe, expect, test } from 'bun:test';
import { previewStockFile } from './stockPreview';

describe('previewStockFile', () => {
  test('previews the original stock file without writing data', async () => {
    const path = `${process.cwd()}/public/data/stock al 18-8-26.xls`;
    const source = Bun.file(path);
    const file = new File([await source.arrayBuffer()], 'stock al 18-8-26.xls');
    const preview = await previewStockFile(file);

    expect(preview.sheetName).toBe('Sheet1');
    expect(preview.headerRow).toBe(8);
    expect(preview.stockDate).toBe('2026-08-18');
    expect(preview.validRows).toBe(1420);
    expect(preview.duplicateRows).toBe(2);
    expect(preview.rejectedRows).toHaveLength(0);
    expect(preview.lines.length).toBeLessThanOrEqual(25);
    expect(preview.allLines).toHaveLength(1420);
    expect(preview.sourceHash).toHaveLength(64);
  });
});
