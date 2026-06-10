'use client';

import { useAppStore } from '@/store/useAppStore';
import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/dashboard/Dashboard';
import ShipmentTable from '@/components/shipments/ShipmentTable';
import TraceSearch from '@/components/traceability/TraceSearch';
import AnalyticsCharts from '@/components/analytics/AnalyticsCharts';
import ImportExportPanel from '@/components/import-export/ImportExportPanel';
import NewRecordForm from '@/components/new-record/NewRecordForm';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function Home() {
  const { activeTab } = useAppStore();

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'envios': return <ShipmentTable />;
      case 'trazabilidad': return <TraceSearch />;
      case 'analiticas': return <AnalyticsCharts />;
      case 'importar': return <ImportExportPanel />;
      case 'nuevo': return <NewRecordForm />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <ScrollArea className="h-screen">
          {renderContent()}
        </ScrollArea>
      </main>
    </div>
  );
}