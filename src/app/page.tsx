'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import Sidebar from '@/components/Sidebar';
import ShipmentTable from '@/components/shipments/ShipmentTable';
import ExportacionesTable from '@/components/exportaciones/ExportacionesTable';
import CruceCaliral from '@/components/cruce-caliral/CruceCaliral';
import CrucosXCote from '@/components/cruces-x-cote/CrucosXCote';
import MercadoNacional from '@/components/mercado-nacional/MercadoNacional';
import Hallazgos from '@/components/hallazgos/Hallazgos';
import TrazabilidadExplorer from '@/components/trazabilidad-explorer/TrazabilidadExplorer';
import TraceSearch from '@/components/traceability/TraceSearch';
import ImportExportPanel from '@/components/import-export/ImportExportPanel';
import NewRecordForm from '@/components/new-record/NewRecordForm';
import AIAssistant from '@/components/AIAssistant';
import { CentroInteligencia } from '@/components/centro/CentroInteligencia';
import { CentroDeDatos } from '@/components/centro-datos/CentroDeDatos';
import { OperacionCaliral } from '@/components/operacion-caliral/OperacionCaliral';
import { ClientesEstrategicos } from '@/components/clientes-estrategicos/ClientesEstrategicos';
import { CopilotPage } from '@/components/copilot/CopilotPage';
import { initialPull } from '@/lib/googleSheets';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function Home() {
  const activeTab = useAppStore(s => s.activeTab);

  // Firebase pull runs in background — app renders immediately with local data
  useEffect(() => {
    initialPull().catch(() => { /* Firebase not available, use local data */ });
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'operacion': return <OperacionCaliral />;
      case 'copilot': return <CopilotPage />;
      case 'centro': return <CentroInteligencia />;
      case 'centro-datos': return <CentroDeDatos />;
      case 'nirea': return <ClientesEstrategicos />;
      case 'depositos': return <ShipmentTable />;
      case 'exportaciones': return <ExportacionesTable />;
      case 'cruce-caliral': return <CruceCaliral />;
      case 'cruces-x-cote': return <CrucosXCote />;
      case 'mercado-nacional': return <MercadoNacional />;
      case 'hallazgos': return <Hallazgos />;
      case 'trazabilidad-explorer': return <TrazabilidadExplorer />;
      case 'trazabilidad': return <TraceSearch />;
      case 'importar': return <ImportExportPanel />;
      case 'nuevo': return <NewRecordForm />;
      default: return <OperacionCaliral />;
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <ErrorBoundary>
            {renderContent()}
          </ErrorBoundary>
        </main>
      </div>
      <AIAssistant />
    </ErrorBoundary>
  );
}
