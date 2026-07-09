// ============================================================
// ChatWindow — Ventana flotante del asistente
// ------------------------------------------------------------
// Contiene: header draggable, body (MessageList + MessageInput).
// Sin lógica de negocio: todo viene por props.
// ============================================================

'use client';
import { Bot, Minus, Trash2, X } from 'lucide-react';
import type { RefObject } from 'react';
import type { ChatMessage } from '../types';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

interface ChatWindowProps {
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  imageProcessing: boolean;
  pendingImages: File[];
  puterReady: boolean;
  minimized: boolean;
  activeTab: string;
  position: { x: number; y: number };
  dragRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onToggleMinimize: () => void;
  onClose: () => void;
  onClearChat: () => void;
  onInputChange: (v: string) => void;
  onSubmit: () => void;
  onAddImages: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
  onAskAI: (q: string) => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function ChatWindow(props: ChatWindowProps) {
  const {
    messages, input, loading, imageProcessing, pendingImages,
    puterReady, minimized, activeTab, position, dragRef, messagesEndRef,
    onToggleMinimize, onClose, onClearChat,
    onInputChange, onSubmit, onAddImages, onRemoveImage, onAskAI, onMouseDown,
  } = props;

  return (
    <div
      ref={dragRef}
      className="fixed z-50 bg-white rounded-lg shadow-2xl border border-slate-200 flex flex-col"
      style={{
        left: position.x,
        top: position.y,
        width: 400,
        height: minimized ? 'auto' : 520,
        maxHeight: minimized ? 'auto' : '80vh',
      }}
    >
      {/* Header (draggable) */}
      <div
        className="flex items-center justify-between bg-violet-600 text-white px-3 py-2 rounded-t-lg cursor-move select-none"
        onMouseDown={onMouseDown}
      >
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <span className="text-sm font-semibold">Asistente IA</span>
          {puterReady ? (
            <span className="text-[9px] bg-emerald-400 text-emerald-900 px-1.5 py-0.5 rounded-full">GPT-5.4</span>
          ) : (
            <span className="text-[9px] bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-full">Local</span>
          )}
          <span className="text-[9px] text-violet-200">{activeTab}</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button className="p-1 hover:bg-violet-700 rounded transition-colors" onClick={onClearChat} title="Borrar conversación">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button className="p-1 hover:bg-violet-700 rounded transition-colors" onClick={onToggleMinimize} title={minimized ? "Maximizar" : "Minimizar"}>
            {minimized ? <span className="text-xs">□</span> : <Minus className="h-3.5 w-3.5" />}
          </button>
          <button className="p-1 hover:bg-red-500 rounded transition-colors" onClick={onClose} title="Cerrar">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body (oculto cuando minimizado) */}
      {!minimized && (
        <>
          <MessageList
            messages={messages}
            loading={loading}
            puterReady={puterReady}
            activeTab={activeTab}
            onQuickAction={onAskAI}
            messagesEndRef={messagesEndRef}
          />
          <MessageInput
            input={input}
            loading={loading}
            imageProcessing={imageProcessing}
            pendingImages={pendingImages}
            onInputChange={onInputChange}
            onSubmit={onSubmit}
            onAddImages={onAddImages}
            onRemoveImage={onRemoveImage}
          />
        </>
      )}
    </div>
  );
}
