// ============================================================
// puterService.ts — Servicio para interactuar con Puter AI
// ------------------------------------------------------------
// Aísla TODO el acceso a window.puter del componente React.
// Tipado estricto de la API de Puter (chat con texto y con imagen).
// ============================================================

import type { ChatMessage } from './types';

// --- Tipado de la API de Puter ---

/** Mensaje en formato que acepta Puter. */
interface PuterTextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PuterChatOptions {
  model?: string;
}

/** Respuesta de Puter.ai.chat: estructura variable (string u objeto con message). */
interface PuterChatResponse {
  message?: { content?: string } | string;
}

/** Forma mínima del SDK de Puter que usamos. */
interface PuterAI {
  chat: {
    (
      prompt: string,
      imageUrl: string,
      options?: PuterChatOptions,
    ): Promise<PuterChatResponse>;
    (
      messages: PuterTextMessage[],
      options?: PuterChatOptions,
    ): Promise<PuterChatResponse>;
  };
}

interface PuterSDK {
  ai: PuterAI;
}

// --- Declaración global tipada ---

declare global {
  interface Window {
    puter?: PuterSDK;
  }
}

// --- Helpers ---

/** Devuelve true si Puter AI está disponible y tiene el método chat. */
export function isPuterAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.puter?.ai?.chat;
}

/**
 * Extrae datos de una imagen usando Puter AI Vision.
 * Devuelve el texto crudo de la respuesta (puede ser JSON o texto libre).
 */
export async function extractImageWithVision(
  imageBase64: string,
  prompt: string,
  model = 'gpt-5.4-nano',
): Promise<string> {
  if (!window.puter?.ai?.chat) {
    throw new Error('Puter AI no disponible');
  }
  const response = await window.puter.ai.chat(prompt, imageBase64, { model });
  return extractContent(response);
}

/**
 * Chat con texto usando Puter AI.
 * @param systemPrompt Prompt del sistema (contexto)
 * @param history Últimos mensajes de la conversación (se trunca a 6)
 * @param question Pregunta actual del usuario
 * @param model Modelo a usar (default gpt-4o-mini)
 */
export async function chatWithAI(
  systemPrompt: string,
  history: ChatMessage[],
  question: string,
  model = 'gpt-4o-mini',
): Promise<string> {
  if (!window.puter?.ai?.chat) {
    throw new Error('Puter AI no disponible');
  }
  const messages: PuterTextMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ];
  const response = await window.puter.ai.chat(messages, { model });
  return extractContent(response);
}

/** Extrae el contenido textual de una respuesta de Puter. */
function extractContent(response: PuterChatResponse | undefined): string {
  if (!response?.message) return '';
  const msg = response.message;
  if (typeof msg === 'string') return msg;
  return msg.content ?? '';
}

/** Espera a que Puter esté disponible, con timeout de 10s. */
export function waitForPuter(onReady: () => void): () => void {
  if (isPuterAvailable()) {
    onReady();
    return () => {};
  }
  const interval = setInterval(() => {
    if (isPuterAvailable()) {
      clearInterval(interval);
      onReady();
    }
  }, 500);
  const timeout = setTimeout(() => clearInterval(interval), 10000);
  return () => {
    clearInterval(interval);
    clearTimeout(timeout);
  };
}
