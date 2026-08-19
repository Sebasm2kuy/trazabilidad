'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/dashboard/Dashboard';
import ShipmentTable from '@/components/shipments/ShipmentTable';
import ExportacionesTable from '@/components/exportaciones/ExportacionesTable';
import CruceCaliral from '@/components/cruce-caliral/CruceCaliral';
import CrucosXCote from '@/components/cruces-x-cote/CrucosXCote';
import MercadoNacional from '@/components/mercado-nacional/MercadoNacional';
import TrazabilidadExplorer from '@/components/trazabilidad-explorer/TrazabilidadExplorer';
import TraceSearch from '@/components/traceability/TraceSearch';
import AnalyticsCharts from '@/components/analytics/AnalyticsCharts';
import ProductoDestino from '@/components/comparativa/ProductoDestino';
import ImportExportPanel from '@/components/import-export/ImportExportPanel';
import NewRecordForm from '@/components/new-record/NewRecordForm';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Login } from '@/components/auth/Login';
import { ClientesEstrategicos } from '@/components/clientes-estrategicos/ClientesEstrategicos';
import { getSession, onAuthChange, getAllowedTabs, type AuthUser } from '@/lib/auth';

export default function Home() {
  const { activeTab, setActiveTab } = useAppStore();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getSession()
      .then(session => { if (mounted) setUser(session); })
      .catch(() => { if (mounted) setUser(null); })
      .finally(() => { if (mounted) setAuthChecked(true); });
    const unsub = onAuthChange(session => {
      if (mounted) setUser(session);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Si el rol no tiene acceso a la tab activa, forzar a la primera permitida
  useEffect(() => {
    if (!user) return;
    const allowed = getAllowedTabs(user.role);
    if (!allowed.includes(activeTab)) {
      setActiveTab(allowed[0] as any);
    }
  }, [user, activeTab, setActiveTab]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500" />
      </div>
    );
  }
  if (!user) {
    return <Login onLogin={setUser} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'depositos': return <ShipmentTable />;
      case 'exportaciones': return <ExportacionesTable />;
      case 'cruce-caliral': return <CruceCaliral />;
      case 'cruces-x-cote': return <CrucosXCote />;
      case 'mercado-nacional': return <MercadoNacional />;
      case 'trazabilidad-explorer': return <TrazabilidadExplorer />;
      case 'trazabilidad': return <TraceSearch />;
      case 'comparativa': return <ProductoDestino />;
      case 'analiticas': return <AnalyticsCharts />;
      case 'importar': return <ImportExportPanel />;
      case 'nuevo': return <NewRecordForm />;
      case 'clientes-estrategicos': return <ClientesEstrategicos />;
      default: return <Dashboard />;
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar user={user} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <ErrorBoundary>
            {renderContent()}
          </ErrorBoundary>
        </main>
      </div>
    </ErrorBoundary>
  );
}
