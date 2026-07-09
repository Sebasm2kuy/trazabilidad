// ============================================================
// ENTERPRISE BLUEPRINT — Estándares y Hoja de Ruta
// ------------------------------------------------------------
// ETI-12: Documento rector. Prioridad sobre cualquier implementación.
// Define principios, convenciones, pruebas y roadmap evolutivo.
// ============================================================

// --- Principios fundamentales ---

export const PRINCIPLES = {
  singleSourceOfTruth: 'Una única fuente de verdad',
  singleImplementation: 'Una única implementación por responsabilidad',
  separationOfConcerns: 'Separación estricta entre negocio y presentación',
  configOverCode: 'Configuración antes que código',
  explainabilityFirst: 'Explicabilidad antes que automatización',
  auditBeforeConvenience: 'Auditoría antes que comodidad',
  performanceOverMicro: 'Rendimiento antes que microoptimización',
  incrementalEvolution: 'Evolución incremental antes que reescritura',
} as const;

// --- Flujo de dependencias (siempre descendente) ---

export const ARCHITECTURE_FLOW = [
  'Presentation Engine',
  'Business Intelligence Engine',
  'Risk Engine',
  'KPI Engine',
  'Integrity Engine',
  'Conciliation Engine',
  'TraceGraph',
  'Repositories',
  'ETL',
  'Data Sources',
] as const;

// --- Reglas de desarrollo ---

export const DEV_RULES = {
  singleResponsibility: true,
  clearInterfaces: true,
  lowCoupling: true,
  highCohesion: true,
  reusableCode: true,
  documentationRequired: true,
  automatedTests: true,
  observability: true,
  versioning: true,
} as const;

// --- Criterios de aceptación ---

export interface AcceptanceCriteria {
  implemented: boolean;
  tested: boolean;
  documented: boolean;
  performant: boolean;
  integrated: boolean;
  audited: boolean;
  codeReviewed: boolean;
}

export function isDone(criteria: AcceptanceCriteria): boolean {
  return Object.values(criteria).every(v => v === true);
}

// --- Estrategia de pruebas ---

export type TestLevel = 'unit' | 'integration' | 'functional' | 'regression' | 'performance';

export interface TestSpec {
  level: TestLevel;
  targets: string[];
  description: string;
}

export const TEST_STRATEGY: TestSpec[] = [
  { level: 'unit', targets: ['engines', 'rules', 'calculations', 'utils'], description: 'Motores, reglas, cálculos, utilidades' },
  { level: 'integration', targets: ['etl', 'repositories', 'traceGraph', 'engines'], description: 'ETL, Repositories, TraceGraph, motores' },
  { level: 'functional', targets: ['import', 'conciliation', 'kpis', 'alerts'], description: 'Importaciones, conciliaciones, KPIs, alertas' },
  { level: 'regression', targets: ['kpis_history', 'conciliation_stability', 'integrity_consistency', 'risk_stability'], description: 'KPIs históricos, conciliaciones previas, scores estables' },
  { level: 'performance', targets: ['10k', '100k', '500k', '1M'], description: 'Conjuntos crecientes: 10K, 100K, 500K, 1M registros' },
];

// --- Roadmap ---

export type RoadmapPhase = 1 | 2 | 3 | 4 | 5;

export interface RoadmapItem {
  phase: RoadmapPhase;
  title: string;
  items: string[];
  status: 'completed' | 'in_progress' | 'planned';
}

export const ROADMAP: RoadmapItem[] = [
  {
    phase: 1,
    title: 'Fase 1 — Arquitectura Core',
    items: ['ETL Unificado', 'Repositories', 'TraceGraph', 'Integrity Engine', 'KPI Engine', 'Risk Engine', 'Conciliation Engine', 'Business Intelligence', 'Presentation Engine', 'Platform Core'],
    status: 'completed',
  },
  {
    phase: 2,
    title: 'Fase 2 — Integración y Persistencia',
    items: ['Integración con APIs', 'Persistencia en base de datos', 'Sincronización incremental', 'Usuarios', 'Permisos'],
    status: 'planned',
  },
  {
    phase: 3,
    title: 'Fase 3 — Inteligencia Avanzada',
    items: ['Forecast', 'Modelos predictivos', 'Optimización logística', 'Digital Twin avanzado', 'Alertas inteligentes'],
    status: 'planned',
  },
  {
    phase: 4,
    title: 'Fase 4 — Machine Learning',
    items: ['Detección automática de anomalías', 'Predicción de demanda', 'Optimización de inventario', 'Asistentes inteligentes'],
    status: 'planned',
  },
  {
    phase: 5,
    title: 'Fase 5 — Integración Nacional',
    items: ['Múltiples empresas', 'Intercambio seguro de datos', 'Paneles regulatorios', 'Reportes automáticos'],
    status: 'planned',
  },
];

// --- Checklist final del proyecto ---

export interface ProjectChecklist {
  singleDataFlow: boolean;
  traceGraphAsTruth: boolean;
  enginesDecoupled: boolean;
  kpisConsistent: boolean;
  conciliationsExplainable: boolean;
  riskTraceable: boolean;
  insightsDataBacked: boolean;
  noBusinessLogicInUI: boolean;
  fullAudit: boolean;
  technicalDocs: boolean;
  automatedTests: boolean;
  evolvableWithoutRewrite: boolean;
}

export const FINAL_CHECKLIST: ProjectChecklist = {
  singleDataFlow: true,
  traceGraphAsTruth: true,
  enginesDecoupled: true,
  kpisConsistent: true,
  conciliationsExplainable: true,
  riskTraceable: true,
  insightsDataBacked: true,
  noBusinessLogicInUI: true,
  fullAudit: true,
  technicalDocs: true,
  automatedTests: false, // pendiente
  evolvableWithoutRewrite: true,
};

// --- Prohibiciones ---

export const PROHIBITIONS = [
  'duplicar lógica de negocio',
  'crear atajos que rompan la arquitectura',
  'acceder directamente a los datos ignorando el TraceGraph',
  'calcular KPIs fuera del KPI Engine',
  'implementar reglas fuera del Integrity Engine',
  'generar conciliaciones fuera del Conciliation Engine',
  'incorporar dependencias innecesarias',
  'sacrificar mantenibilidad por velocidad de desarrollo',
] as const;

// --- Preparación para IA ---

export const AI_READINESS = {
  explanationAutoAnomalies: 'Explicación automática de anomalías',
  intelligentAlertClassification: 'Clasificación inteligente de alertas',
  semanticSearch: 'Búsqueda semántica',
  naturalLanguageQueries: 'Consultas en lenguaje natural',
  auditAssistants: 'Asistentes para auditoría',
  deterministicEngines: 'Los motores actuales deben permanecer deterministas y explicables',
} as const;

// --- Migración tecnológica ---

export const MIGRATION_READY = {
  react: 'Motores no dependen de React',
  vue: 'Motores no dependen de Vue',
  angular: 'Motores no dependen de Angular',
  apiRest: 'Motores pueden exponerse como API REST',
  graphql: 'Motores pueden exponerse como GraphQL',
  database: 'Motores no dependen de una base de datos específica',
  persistence: 'Motores no dependen de localStorage',
} as const;

// --- Versión del blueprint ---

export const BLUEPRINT_VERSION = '1.0.0';
export const BLUEPRINT_DATE = '2026-07-09';
export const BLUEPRINT_DOCUMENTS = 12;
