// ============================================================
// MessageList — Lista de mensajes del chat
// ------------------------------------------------------------
// Renderiza el historial de mensajes + estado de carga + empty state.
// Sin lógica: solo presentación.
// ============================================================

'use client';
import { Bot, Sparkles } from 'lucide-react';
import type { RefObject } from 'react';
import type { ChatMessage } from '../types';

interface MessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  puterReady: boolean;
  activeTab: string;
  onQuickAction: (q: string) => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}

const QUICK_ACTIONS = [
  'Verifica errores', 'P14702', 'borrar P14702', 'corregir P14702 1888 cajas', 'bugs',
];

export function MessageList({
  messages, loading, puterReady, activeTab, onQuickAction, messagesEndRef,
}: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 min-h-[300px] max-h-[400px]">
      {messages.length === 0 ? (
        <div className="text-center text-slate-400 py-8">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium">Hola! Soy tu asistente de trazabilidad</p>
          <p className="text-xs mt-1">{puterReady ? 'Conectado a GPT-5.4' : 'Análisis local activo'}</p>
          <p className="text-[10px] mt-1 text-violet-500">Viendo: {activeTab}</p>
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {QUICK_ACTIONS.map(q => (
              <button
                key={q}
                className="text-[11px] px-2 py-1 rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                onClick={() => onQuickAction(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : (
        messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg p-3 text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-violet-600 text-white' : 'bg-white border text-slate-700'}`}>
              {msg.content}
            </div>
          </div>
        ))
      )}
      {loading && (
        <div className="flex justify-start">
          <div className="bg-white border rounded-lg p-3 text-sm text-slate-400 flex items-center gap-2">
            <Bot className="h-4 w-4 animate-pulse" />
            {puterReady ? 'Consultando GPT-5.4...' : 'Analizando datos...'}
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
