// ============================================================
// ai-assistant/index.ts — Barrel exports
// ============================================================

export { default } from './AIAssistant';
export { ChatWindow } from './components/ChatWindow';
export { MessageList } from './components/MessageList';
export { MessageInput } from './components/MessageInput';
export { ImageUploader } from './components/ImageUploader';
export { useChat } from './hooks/useChat';
export { useDrag } from './hooks/useDrag';
export * from './storage';
export * from './promptBuilder';
export * from './puterService';
export * from './types';
