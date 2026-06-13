'use client';

import { useEffect } from 'react';
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
import { initialPull, isConfigured } from '@/lib/googleSheets';
import { toast } from 'sonner';

export default function Home() {
  const { activeTab } = useAppStore();

  // Pull from Google Sheets on first load
  useEffect(() => {
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
  }, []);

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