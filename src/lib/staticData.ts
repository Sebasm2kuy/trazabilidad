import type { Shipment } from './types';

const shipmentsCache: { data: Shipment[]; loaded: boolean } = { data: [], loaded: false };

async function ensureLoaded() {
  if (!shipmentsCache.loaded) {
    const r = await fetch('data/shipments.json');
    shipmentsCache.data = await r.json();
    shipmentsCache.loaded = true;
  }
}

export async function getCotes(): Promise<string[]> {
  await ensureLoaded();
  const cotes = [...new Set(shipmentsCache.data.map(s => s.nroCote).filter(Boolean) as string[])].sort();
  return cotes;
}

export async function fetchAnalytics() {
  const r = await fetch('data/analytics.json');
  return r.json();
}

export async function fetchShipments(params: {
  page?: number;
  limit?: number;
  search?: string;
  pais?: string;
  producto?: string;
  destino?: string;
  tipo?: string;
  cote?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}) {
  await ensureLoaded();

  let filtered = [...shipmentsCache.data];
  const { page = 1, limit = 20, search = '', pais, producto, destino, tipo, cote, fechaDesde, fechaHasta } = params;

  if (search) {
    const s = search.toLowerCase();
    const num = Number(search);
    filtered = filtered.filter(sh =>
      sh.nroTramite === num ||
      sh.nroCote?.toLowerCase().includes(s) ||
      sh.nombreEstablecimientoDestino?.toLowerCase().includes(s) ||
      sh.denominacionMercaderia?.toLowerCase().includes(s) ||
      sh.matriculaCamion?.toLowerCase().includes(s) ||
      sh.precinto1?.toLowerCase().includes(s)
    );
  }
  if (pais) filtered = filtered.filter(sh => sh.paisDestino?.includes(pais));
  if (producto) filtered = filtered.filter(sh => sh.denominacionMercaderia?.includes(producto));
  if (destino) filtered = filtered.filter(sh => sh.nombreEstablecimientoDestino?.includes(destino));
  if (tipo) filtered = filtered.filter(sh => sh.tipo === tipo);
  if (cote) filtered = filtered.filter(sh => sh.nroCote === cote);
  if (fechaDesde) filtered = filtered.filter(sh => sh.fechaTramite >= new Date(fechaDesde).toISOString());
  if (fechaHasta) filtered = filtered.filter(sh => sh.fechaTramite <= new Date(fechaHasta + 'T23:59:59').toISOString());

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const data = filtered.slice((page - 1) * limit, page * limit);

  return { data, total, page, limit, totalPages };
}