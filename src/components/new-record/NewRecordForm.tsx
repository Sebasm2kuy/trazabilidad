'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';

export default function NewRecordForm() {
  return (
    <div className="p-6 space-y-6 max-w-[900px]">
      <h2 className="text-2xl font-bold text-slate-800">Nuevo Registro</h2>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Cargar Ingreso / Egreso</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 p-4 rounded-lg bg-amber-50 text-amber-700 text-sm"><Info className="h-5 w-5 shrink-0"/>
            <div><p className="font-medium">Disponible solo en modo local</p><p className="text-amber-600 mt-1">Para agregar registros ejecutá <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">bun run dev</code>. La versión estática es de solo lectura.</p></div>
          </div>
        </CardContent></Card>
    </div>
  );
}
