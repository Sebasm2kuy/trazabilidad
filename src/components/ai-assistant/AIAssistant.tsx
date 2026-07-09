// ============================================================
// AIAssistant — Orquestador delgado del asistente de IA
// ------------------------------------------------------------
// REFACTOR: el archivo original tenía 965 líneas con lógica de
// UI, prompts, localStorage, Puter AI, drag, análisis local y
// procesamiento de imágenes todo mezclado.
//
// Ahora es un orquestador de ~80 líneas que:
//   1. Lee el activeTab del store
//   2. Inicializa useChat (mensajes, askAI, imágenes)
//   3. Inicializa useDrag (posición de la ventana)
//   4. Maneja estado de UI: open, minimized, paste handler
//   5. Renderiza el botón flotante o ChatWindow
//
// Toda la lógica de negocio está en:
//   - hooks/useChat.ts    — conversación + imágenes
//   - hooks/useDrag.ts    — drag & drop de la ventana
//   - promptBuilder.ts    — prompts + análisis local
//   - puterService.ts     — interacción con Puter AI
//   - storage.ts          — persistencia localStorage
// ============================================================

'use client';
import { useState, useEffect } from 'react';
import { Bot } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useChat } from './hooks/useChat';
import { useDrag } from './hooks/useDrag';
import { ChatWindow } from './components/ChatWindow';

export default function AIAssistant() {
  const activeTab = useAppStore(s => s.activeTab);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const chat = useChat({ activeTab });
  const { position, dragRef, handleMouseDown } = useDrag({ disabled: minimized });

  // Paste handler: acumula imágenes del portapapeles cuando el chat está abierto
  useEffect(() => {
    if (!open) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            chat.addImageToPending(file);
          }
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [open, chat.addImageToPending]);

  // Botón flotante (cuando está cerrado)
  if (!open) {
    return (
      <button
        className="fixed bottom-6 right-6 z-50 bg-violet-600 hover:bg-violet-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 group"
        onClick={() => setOpen(true)}
        title="Abrir asistente IA"
      >
        <Bot className="h-6 w-6" />
        <span className="hidden group-hover:inline text-sm font-medium pr-2">Asistente IA</span>
        {chat.messages.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-emerald-400 rounded-full h-3 w-3 border-2 border-violet-600"></span>
        )}
      </button>
    );
  }

  // Ventana del chat
  return (
    <ChatWindow
      messages={chat.messages}
      input={chat.input}
      loading={chat.loading}
      imageProcessing={chat.imageProcessing}
      pendingImages={chat.pendingImages}
      puterReady={chat.puterReady}
      minimized={minimized}
      activeTab={activeTab}
      position={position}
      dragRef={dragRef}
      messagesEndRef={chat.messagesEndRef}
      onToggleMinimize={() => setMinimized(m => !m)}
      onClose={() => { setOpen(false); setMinimized(false); }}
      onClearChat={chat.clearChat}
      onInputChange={chat.setInput}
      onSubmit={chat.handleSubmit}
      onAddImages={(files) => files.forEach(f => chat.addImageToPending(f))}
      onRemoveImage={chat.removePendingImage}
      onAskAI={chat.askAI}
      onMouseDown={handleMouseDown}
    />
  );
}
