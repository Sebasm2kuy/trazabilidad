// ============================================================
// useChat — Hook con toda la lógica de conversación
// ------------------------------------------------------------
// Encapsula:
//   - Estado de mensajes + persistencia en localStorage
//   - askAI(): orquesta local analysis vs Puter AI
//   - processPendingImages(): extracción con vision AI
//   - clearChat(): limpia historial
//   - Detección de Puter disponible
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { ChatMessage, ImageExtractionResult, ExtractedLot, NewIngresoRecord } from '../types';
import {
  loadChatHistory, saveChatHistory, clearChatHistory,
  loadDepNewRecords, saveDepNewRecords, notifyDataChanged,
  type IngresoRecord,
} from '../storage';
import {
  isPuterAvailable, waitForPuter, extractImageWithVision, chatWithAI,
} from '../puterService';
import {
  buildSystemPrompt, buildVisionPrompt, localAnalysis, isLocalQuery,
} from '../promptBuilder';

interface UseChatOptions {
  activeTab: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  imageProcessing: boolean;
  pendingImages: File[];
  puterReady: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  setInput: (v: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  askAI: (question: string) => Promise<void>;
  handleSubmit: () => void;
  clearChat: () => void;
  addImageToPending: (file: File) => void;
  removePendingImage: (index: number) => void;
  processPendingImages: () => Promise<void>;
}

export function useChat(opts: UseChatOptions): UseChatReturn {
  const { activeTab } = opts;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [puterReady, setPuterReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Cargar historial al montar
  useEffect(() => {
    setMessages(loadChatHistory());
  }, []);

  // Persistir mensajes cuando cambian
  useEffect(() => {
    saveChatHistory(messages);
  }, [messages]);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Detectar disponibilidad de Puter
  useEffect(() => {
    const cleanup = waitForPuter(() => setPuterReady(true));
    return cleanup;
  }, []);

  // --- askAI ---

  const askAI = useCallback(async (question: string) => {
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: question }]);

    // Queries locales: más rápido + más preciso para detección de bugs
    if (isLocalQuery(question)) {
      await new Promise(r => setTimeout(r, 300));
      const answer = localAnalysis(question);
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
      setLoading(false);
      return;
    }

    // Queries conceptuales: intentar GPT-4o
    if (puterReady && isPuterAvailable()) {
      try {
        const systemPrompt = buildSystemPrompt(activeTab);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('GPT timeout')), 25000),
        );
        const chatPromise = chatWithAI(systemPrompt, messages, question);
        const answer = await Promise.race([chatPromise, timeoutPromise]);
        const finalAnswer = answer || 'No pude procesar la consulta.';
        setMessages(prev => [...prev, { role: 'assistant', content: finalAnswer }]);
        setLoading(false);
        return;
      } catch (err) {
        console.warn('Puter AI failed, using local:', err);
      }
    }

    // Fallback a análisis local
    await new Promise(r => setTimeout(r, 400));
    const answer = localAnalysis(question);
    setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    setLoading(false);
  }, [activeTab, messages, puterReady]);

  // --- Gestión de imágenes pendientes ---

  const addImageToPending = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se admiten imágenes');
      return;
    }
    setPendingImages(prev => [...prev, file]);
  }, []);

  const removePendingImage = useCallback((index: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const processPendingImages = useCallback(async () => {
    if (pendingImages.length === 0) return;
    const imagesToProcess = [...pendingImages];
    setPendingImages([]);
    setImageProcessing(true);

    // 1. Extraer datos de cada imagen
    const extractedData: ImageExtractionResult[] = [];
    const visionPrompt = buildVisionPrompt();

    for (const file of imagesToProcess) {
      try {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        let extractedText = '';
        if (isPuterAvailable()) {
          try {
            extractedText = await extractImageWithVision(dataUrl, visionPrompt);
          } catch (err) {
            console.warn('Puter vision failed:', err);
          }
        }

        const parsedItems = parseVisionResponse(extractedText);
        extractedData.push({ fileName: file.name, items: parsedItems, raw: extractedText });
      } catch (err) {
        extractedData.push({
          fileName: file.name,
          items: [],
          raw: 'Error: ' + (err as Error).message,
        });
      }
    }

    // 2. Agrupar todos los lotes por COTE
    const coteGroups: Record<string, ExtractedLot[]> = {};
    const noCoteImages: { fileName: string; raw: string }[] = [];

    for (const item of extractedData) {
      if (item.items && item.items.length > 0) {
        for (const lot of item.items) {
          const cote = lot.nroCote;
          if (cote && cote !== 'null' && cote !== null) {
            const coteUpper = String(cote).trim().toUpperCase();
            if (!coteGroups[coteUpper]) coteGroups[coteUpper] = [];
            coteGroups[coteUpper].push(lot);
          }
        }
      } else {
        noCoteImages.push({ fileName: item.fileName, raw: item.raw });
      }
    }

    // 3. Procesar cada grupo de COTE — sumar cajas de todos los lotes
    for (const [cote, lots] of Object.entries(coteGroups)) {
      const result = buildIngresoRecord(cote, lots);
      if (result.record) {
        // Persistir
        const existing = loadDepNewRecords();
        existing.push(result.record as unknown as IngresoRecord);
        saveDepNewRecords(existing);

        // Mensaje de confirmación
        setMessages(prev => [...prev, { role: 'user', content: `📷 ${lots.length} lote(s) → ${cote}` }]);
        setMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
      }
    }

    // 4. Imágenes sin COTE detectado
    for (const item of noCoteImages) {
      setMessages(prev => [...prev, { role: 'user', content: `📷 ${item.fileName}` }]);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ No pude identificar el COTE en esta imagen.\n\nDatos extraídos:\n${item.raw}`,
      }]);
    }

    notifyDataChanged();
    setImageProcessing(false);
  }, [pendingImages]);

  // --- Submit ---

  const handleSubmit = useCallback(() => {
    if (pendingImages.length > 0) {
      void processPendingImages();
      setInput('');
      return;
    }
    if (!input.trim() || loading) return;
    const q = input;
    setInput('');
    void askAI(q);
  }, [pendingImages, input, loading, askAI, processPendingImages]);

  // --- Clear ---

  const clearChat = useCallback(() => {
    setMessages([]);
    clearChatHistory();
  }, []);

  return {
    messages, input, loading, imageProcessing, pendingImages, puterReady,
    messagesEndRef, setInput, setMessages,
    askAI, handleSubmit, clearChat,
    addImageToPending, removePendingImage, processPendingImages,
  };
}

// --- Helpers internos ---

/** Parsea la respuesta de vision AI: puede ser JSON único o array, con o sin markdown. */
function parseVisionResponse(text: string): ExtractedLot[] {
  try {
    const cleanText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleanText.match(/[\[{][\s\S]*[\]}]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed)) return parsed as ExtractedLot[];
    return [parsed as ExtractedLot];
  } catch {
    return [];
  }
}

/** Construye el registro de ingreso + el mensaje de respuesta a partir de los lotes extraídos. */
function buildIngresoRecord(
  cote: string,
  lots: ExtractedLot[],
): { record: NewIngresoRecord | null; response: string } {
  let totalCajas = 0;
  let totalPesoBruto = 0;
  let totalPesoNeto = 0;
  let nroTramite = 0;
  let fecha = '';
  let producto = '';
  let paisDestino = '';
  let establecimiento = '';
  const lineas: Array<{ id: string; producto: string; corte: string; cajas: number }> = [];

  for (const lot of lots) {
    const cajas = parseInt(lot.cantidadEnvases ?? '0') || 0;
    const pb = parseFloat(lot.pesoBruto ?? '0') || 0;
    const pn = parseFloat(lot.pesoNeto ?? '0') || 0;
    totalCajas += cajas;
    totalPesoBruto += pb;
    totalPesoNeto += pn;
    if (!nroTramite) nroTramite = parseInt(lot.nroTramite ?? '0') || 0;
    if (!fecha && lot.fecha) fecha = lot.fecha;
    if (!producto && lot.producto) producto = lot.producto;
    if (!paisDestino && lot.paisDestino) paisDestino = lot.paisDestino;
    if (!establecimiento && lot.establecimiento) establecimiento = lot.establecimiento;
    lineas.push({
      id: String(Date.now() + Math.random()),
      producto: lot.producto || producto,
      corte: lot.corte || 'Varios',
      cajas,
    });
  }

  const cajas = totalCajas;
  const pesoNeto = totalPesoNeto;

  // Detectar alucinación: si todos los lotes tienen las mismas cajas, GPT falló
  let warning = '';
  if (cajas === 1 && lots.length > 1) {
    warning = '\n\n⚠️ ATENCIÓN: Solo detecté 1 caja total. Si las capturas muestran cantidades mayores, cargá el ingreso manualmente.';
  }
  if (lots.length > 1) {
    const allSame = lots.every(l => parseInt(l.cantidadEnvases ?? '0') === parseInt(lots[0].cantidadEnvases ?? '0'));
    if (allSame && parseInt(lots[0].cantidadEnvases ?? '0') > 1) {
      warning = `\n\n⚠️ ALUCINACIÓN DETECTADA: Todos los cortes tienen ${lots[0].cantidadEnvases} cajas. GPT probablemente no pudo leer la tabla correctamente.\nLas cantidades reales pueden ser diferentes. Revisá y corregí manualmente en A Depósitos.`;
    }
  }

  const safeDateStr = safeDate(fecha);
  const record: NewIngresoRecord = {
    id: `img_ing_${Date.now()}_${cote}_${Math.random().toString(36).substr(2, 5)}`,
    nroTramite,
    fechaTramite: safeDateStr,
    nroCote: cote,
    nombreEstablecimientoDestino: 'CALIRAL S.A.',
    nombreEstablecimientoProd: establecimiento || 'SAN JACINTO',
    paisDestino: paisDestino || 'URUGUAY',
    denominacionMercaderia: producto || '',
    corte: lots.length > 1 ? `${lots.length} cortes` : (lots[0]?.corte || 'Varios'),
    tipo: 'INGRESO',
    cantidadEnvases: cajas,
    pesoBruto: totalPesoBruto,
    pesoNeto: pesoNeto,
    fechaEmitidoCote: safeDateStr,
    lineas,
  };

  let resp = `📷 ${lots.length} lote${lots.length > 1 ? 's' : ''} procesado${lots.length > 1 ? 's' : ''} para ${cote}\n\n✅ DATOS EXTRAÍDOS Y SUMADOS:\n`;
  resp += `• COTE: ${cote}\n`;
  resp += `• Trámite: ${nroTramite}\n`;
  resp += `• Producto: ${producto}\n`;
  resp += `• Total Cajas: ${cajas.toLocaleString('es-UY')}\n`;
  resp += `• Peso Bruto: ${totalPesoBruto.toLocaleString('es-UY')} kg\n`;
  resp += `• Peso Neto: ${pesoNeto.toLocaleString('es-UY')} kg\n`;
  resp += `• País: ${paisDestino || 'URUGUAY'}\n`;
  if (lots.length > 1) {
    resp += `\nDETALLE DE CORTES (${lots.length}):\n`;
    for (const l of lineas) {
      resp += `  • ${l.corte}: ${l.cajas} cajas\n`;
    }
  }
  resp += `\n💾 Ingreso guardado en A Depósitos con ${lots.length} línea(s).`;
  if (warning) resp += warning;

  return { record, response: resp };
}

/** Parseo seguro de fecha: DD/MM/YY, DD/MM/YYYY, ISO, etc. */
function safeDate(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr === 'null') return new Date().toISOString();
  try {
    const m = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      const [, d, mo, y] = m;
      const year = y.length === 2 ? '20' + y : y;
      const dt = new Date(parseInt(year), parseInt(mo) - 1, parseInt(d));
      if (!isNaN(dt.getTime())) return dt.toISOString();
    }
    const dt = new Date(dateStr);
    if (!isNaN(dt.getTime())) return dt.toISOString();
  } catch { /* fallback */ }
  return new Date().toISOString();
}
