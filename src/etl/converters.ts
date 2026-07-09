// ============================================================
// ETL CONVERTERS — Conversión de registros a entidades del dominio
// ============================================================

import type { Converter as IConverter } from './interfaces';
import type { NacionalRecord, IngresoRecord, ExportacionRecord, PalletRecord } from './interfaces';
import type { Cote, Ingreso, Exportacion, StockPallet } from '@/domain';
import { Normalizer } from './normalizer';

let idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${Date.now()}_${idCounter++}`;
}

export const Converter: IConverter = {
  convertNacional(records: NacionalRecord[]): { cotes: Cote[]; ingresos: Ingreso[]; exportaciones: Exportacion[] } {
    const cotes: Cote[] = [];
    const ingresos: Ingreso[] = [];
    const exportaciones: Exportacion[] = [];

    for (const r of records) {
      const tipoMov = r.tipoMovimiento.toUpperCase();
      const isExport = tipoMov.includes('EXPORT');
      const isDep = tipoMov.includes('DEP') || tipoMov.includes('INGRESO');
      const tpd = Normalizer.normalizeTipoProducto(r.denominacion);

      const cote: Cote = {
        id: nextId('cote'),
        numero: r.cote,
        nroTramite: r.tramite,
        fechaTramite: r.fecha,
        fechaEmitido: null,
        certificadoraId: r.certificadora,
        productorId: r.productor,
        depositoId: isDep ? r.destino : null,
        clienteId: isExport ? r.destino : null,
        paisDestino: r.pais,
        corte: r.corte,
        producto: r.denominacion,
        denominacion: r.denominacion,
        pesoBruto: r.pesoBruto,
        pesoNeto: r.pesoNeto,
        cantidadEnvases: r.envases,
        pallets: r.pallets,
        tipoTransporte: r.tipoTransporte,
        contenedor: null,
        proceso: r.proceso,
        tipoProducto: tpd,
        tipoMovimiento: isExport ? 'EXPORTACION' : isDep ? 'DEPOSITO' : 'INGRESO',
        fechaInicioFaena: null,
        fechaFinFaena: null,
        fechaInicioProduccion: null,
        fechaFinProduccion: null,
        fechaInicioCongelacion: null,
        fechaFinCongelacion: null,
        estado: 'desconocido',
      };
      cotes.push(cote);

      if (isDep) {
        ingresos.push({
          id: nextId('ing'),
          coteId: cote.id,
          nroCote: r.cote,
          fecha: r.fecha,
          productorId: r.productor,
          depositoId: r.destino,
          pesoNeto: r.pesoNeto,
          cantidadEnvases: r.envases,
          corte: r.corte,
          producto: r.denominacion,
          nroTramite: r.tramite,
        });
      }

      if (isExport) {
        exportaciones.push({
          id: nextId('exp'),
          coteId: cote.id,
          nroCote: r.cote,
          fecha: r.fecha,
          certificadoraId: r.certificadora,
          productorId: r.productor,
          paisDestino: r.pais,
          destino: r.destino,
          pesoNeto: r.pesoNeto,
          cantidadEnvases: r.envases,
          corte: r.corte,
          producto: r.denominacion,
          contenedor: null,
          nroTramite: r.tramite,
        });
      }
    }

    return { cotes, ingresos, exportaciones };
  },

  convertIngresos(records: IngresoRecord[]): Ingreso[] {
    return records.map(r => ({
      id: nextId('ing'),
      coteId: `cote_${r.nroCote}`,
      nroCote: r.nroCote,
      fecha: r.fechaTramite,
      productorId: r.productor,
      depositoId: r.deposito,
      pesoNeto: r.pesoNeto,
      cantidadEnvases: r.cantidadEnvases,
      corte: r.corte,
      producto: r.denominacion,
      nroTramite: r.nroTramite,
    }));
  },

  convertExportaciones(records: ExportacionRecord[]): Exportacion[] {
    return records.map(r => ({
      id: nextId('exp'),
      coteId: `cote_${r.nroCote}`,
      nroCote: r.nroCote,
      fecha: r.fechaTramite,
      certificadoraId: r.certificadora,
      productorId: r.productor,
      paisDestino: r.paisDestino,
      destino: r.destino,
      pesoNeto: r.pesoNeto,
      cantidadEnvases: r.cantidadEnvases,
      corte: r.corte,
      producto: r.denominacion,
      contenedor: r.contenedor,
      nroTramite: r.nroTramite,
    }));
  },

  convertPallets(records: PalletRecord[]): StockPallet[] {
    return records.map(r => ({
      id: nextId('pal'),
      codigo: r.codigo,
      codigoTipo: r.codigoTipo,
      fechaComision: r.fechaComision || null,
      fechaEntrega: r.fechaEntrega || null,
      contenedor: r.contenedor,
      pallets: r.pallets,
      cajas: r.cajas,
      kilos: r.kilos,
      contenido: r.contenido,
      producto: r.contenido.split(' - ')[0]?.substring(0, 80) || r.contenido.substring(0, 80),
      nroLote: r.nroLote,
      dua: r.dua,
      fechaVencimiento: r.fechaVencimiento || null,
      le: r.le,
    }));
  },
};
