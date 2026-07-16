import { describe, expect, test } from 'bun:test';
import type { ExpRecord } from './types';
import { buildExportacionesAnalytics, ensureUniqueExpRecordIds } from './exportaciones';

function record(overrides: Partial<ExpRecord> = {}): ExpRecord {
  return {
    id: 'exp_1',
    nroTramite: 1,
    fechaTramite: '2026-01-01T00:00:00.000Z',
    nroCote: 'P1',
    nombreEstablecimientoDestino: 'Destino',
    paisDestino: 'Uruguay',
    denominacionMercaderia: 'Producto',
    corte: 'Corte',
    tipo: 'exportacion',
    ...overrides,
  };
}

describe('ensureUniqueExpRecordIds', () => {
  test('preserva todas las líneas y asigna IDs únicos y estables', () => {
    const result = ensureUniqueExpRecordIds([
      record(),
      record({ denominacionMercaderia: 'Producto 2' }),
      record({ id: 'exp_1_2' }),
    ]);

    expect(result).toHaveLength(3);
    expect(result.map(item => item.id)).toEqual(['exp_1', 'exp_1_2', 'exp_1_2_2']);
  });
});

describe('buildExportacionesAnalytics', () => {
  test('calcula KPIs y series desde los registros visibles', () => {
    const result = buildExportacionesAnalytics([
      record({ pesoNeto: 100, pesoBruto: 110, cantidadEnvases: 5 }),
      record({
        id: 'exp_2',
        nroTramite: 2,
        fechaTramite: '2026-02-01T00:00:00.000Z',
        paisDestino: 'Brasil',
        denominacionMercaderia: 'Producto 2',
        pesoNeto: 50,
        pesoBruto: 60,
        cantidadEnvases: 3,
      }),
    ]);

    expect(result.total).toBe(2);
    expect(result.pesoNetoTotal).toBe(150);
    expect(result.pesoBrutoTotal).toBe(170);
    expect(result.envasesTotal).toBe(8);
    expect(result.uniquePaisCount).toBe(2);
    expect(result.byPais).toEqual([
      { pais: 'Uruguay', pesoNeto: 100 },
      { pais: 'Brasil', pesoNeto: 50 },
    ]);
    expect(result.byProducto).toHaveLength(2);
    expect(result.lastDate).toBe('2026-02-01T00:00:00.000Z');
  });
});
