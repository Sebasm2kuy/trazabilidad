'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/dashboard/Dashboard';
import ShipmentTable from '@/components/shipments/ShipmentTable';
import ExportacionesTable from '@/components/exportaciones/ExportacionesTable';
import CruceCaliral from '@/components/cruce-caliral/CruceCaliral';
import TraceSearch from '@/components/traceability/TraceSearch';
import AnalyticsCharts from '@/components/analytics/AnalyticsCharts';
import ProductoDestino from '@/components/comparativa/ProductoDestino';
import ImportExportPanel from '@/components/import-export/ImportExportPanel';
import NewRecordForm from '@/components/new-record/NewRecordForm';
import { initialPull, isConfigured, getSheetUrl, schedulePush } from '@/lib/googleSheets';
import { toast } from 'sonner';

const ALL_DATA_KEYS = [
  'trazabilidad_new_records',
  'trazabilidad_exp_edits',
  'trazabilidad_exp_deleted',
  'trazabilidad_exp_ingresos',
  'trazabilidad_dep_edits',
  'trazabilidad_dep_new_records',
  'trazabilidad_dep_deleted',
  'cruce_caliral_edits',
  'trazabilidad_stock_data',
  'trazabilidad_imported_batches',
  'trazabilidad_recent_searches',
];

function factoryReset() {
  // 1. Clear all data from localStorage
  for (const key of ALL_DATA_KEYS) {
    localStorage.removeItem(key);
  }

  // 2. If Sheets is configured, also delete from remote
  const sheetUrl = getSheetUrl();
  if (sheetUrl) {
    for (const key of ALL_DATA_KEYS) {
      fetch(sheetUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete', key }),
      }).catch(() => {});
    }
  }

  localStorage.setItem('trazabilidad_sheets_last_sync', new Date().toISOString());
}

export default function Home() {
  const { activeTab } = useAppStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Check for ?reset URL parameter
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === '1') {
      factoryReset();
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      toast.success('Datos borrados. Recargando...');
      setTimeout(() => window.location.reload(), 1000);
      return;
    }

    setReady(true);
  }, []);

  // Pull from Google Sheets on first load (only after reset check)
  useEffect(() => {
    if (!ready) return;
    if (!isConfigured()) return;
    let mounted = true;
    (async () => {
      const result = await initialPull();
      if (!mounted) return;
      if (result.error) {
        console.warn('Sheets pull failed:', result.error);
      } else if (result.count > 0) {
        toast.success(`Datos sincronizados: ${result.count} campos de Google Sheets`);
      }
    })();
    return () => { mounted = false; };
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">Cargando...</p>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'depositos': return <ShipmentTable />;
      case 'exportaciones': return <ExportacionesTable />;
      case 'cruce-caliral': return <CruceCaliral />;
      case 'trazabilidad': return <TraceSearch />;
      case 'comparativa': return <ProductoDestino />;
      case 'analiticas': return <AnalyticsCharts />;
      case 'importar': return <ImportExportPanel />;
      case 'nuevo': return <NewRecordForm />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        {renderContent()}
      </main>
    </div>
  );
}