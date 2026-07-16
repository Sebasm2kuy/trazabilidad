import type { ExpRecord } from './types';

export interface ExportacionesAnalytics {
  total: number;
  pesoNetoTotal: number;
  pesoBrutoTotal: number;
  envasesTotal: number;
  uniquePaisCount: number;
  uniqueProductoCount: number;
  uniqueDestinoCount: number;
  lastDate: string | null;
  byPais: Array<{ pais: string; pesoNeto: number }>;
  byProducto: Array<{ producto: string; pesoNeto: number }>;
  byDestino: Array<{ destino: string; pesoNeto: number }>;
}

export function ensureUniqueExpRecordIds(records: ExpRecord[]): ExpRecord[] {
  const usedIds = new Set<string>();

  return records.map((record, index) => {
    const baseId = record.id.trim() || `exp_${record.nroTramite}_${record.idLinea ?? index + 1}`;
    let id = baseId;
    let suffix = 2;

    while (usedIds.has(id)) {
      id = `${baseId}_${suffix}`;
      suffix++;
    }

    usedIds.add(id);
    return id === record.id ? record : { ...record, id };
  });
}

export function buildExportacionesAnalytics(records: ExpRecord[]): ExportacionesAnalytics {
  const byPais = new Map<string, number>();
  const byProducto = new Map<string, number>();
  const byDestino = new Map<string, number>();
  let pesoNetoTotal = 0;
  let pesoBrutoTotal = 0;
  let envasesTotal = 0;
  let lastDate: string | null = null;

  for (const record of records) {
    const pesoNeto = record.pesoNeto ?? 0;
    pesoNetoTotal += pesoNeto;
    pesoBrutoTotal += record.pesoBruto ?? 0;
    envasesTotal += record.cantidadEnvases ?? 0;

    if (record.fechaTramite && (!lastDate || record.fechaTramite > lastDate)) {
      lastDate = record.fechaTramite;
    }
    if (record.paisDestino) {
      byPais.set(record.paisDestino, (byPais.get(record.paisDestino) ?? 0) + pesoNeto);
    }
    if (record.denominacionMercaderia) {
      byProducto.set(
        record.denominacionMercaderia,
        (byProducto.get(record.denominacionMercaderia) ?? 0) + pesoNeto,
      );
    }
    if (record.nombreEstablecimientoDestino) {
      byDestino.set(
        record.nombreEstablecimientoDestino,
        (byDestino.get(record.nombreEstablecimientoDestino) ?? 0) + pesoNeto,
      );
    }
  }

  return {
    total: records.length,
    pesoNetoTotal,
    pesoBrutoTotal,
    envasesTotal,
    uniquePaisCount: byPais.size,
    uniqueProductoCount: byProducto.size,
    uniqueDestinoCount: byDestino.size,
    lastDate,
    byPais: [...byPais].map(([pais, pesoNeto]) => ({ pais, pesoNeto })).sort((a, b) => b.pesoNeto - a.pesoNeto),
    byProducto: [...byProducto].map(([producto, pesoNeto]) => ({ producto, pesoNeto })).sort((a, b) => b.pesoNeto - a.pesoNeto),
    byDestino: [...byDestino].map(([destino, pesoNeto]) => ({ destino, pesoNeto })).sort((a, b) => b.pesoNeto - a.pesoNeto),
  };
}
