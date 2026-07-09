// ============================================================
// MessageInput — Input de texto + botón de envío + uploader
// ------------------------------------------------------------
// Sin lógica: delega submit al padre.
// ============================================================

'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2 } from 'lucide-react';
import { ImageUploader } from './ImageUploader';

interface MessageInputProps {
  input: string;
  loading: boolean;
  imageProcessing: boolean;
  pendingImages: File[];
  onInputChange: (v: string) => void;
  onSubmit: () => void;
  onAddImages: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
}

export function MessageInput({
  input, loading, imageProcessing, pendingImages,
  onInputChange, onSubmit, onAddImages, onRemoveImage,
}: MessageInputProps) {
  return (
    <div className="p-3 border-t bg-white rounded-b-lg">
      <ImageUploader
        pendingImages={pendingImages}
        imageProcessing={imageProcessing}
        loading={loading}
        onAddImages={onAddImages}
        onRemoveImage={onRemoveImage}
      />
      <div className="flex gap-2">
        <Input
          placeholder={pendingImages.length > 0
            ? `Presioná Enter para procesar ${pendingImages.length} imagen(es)...`
            : "Hacé tu pregunta o pegá capturas (Ctrl+V)..."}
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
          disabled={loading}
          className="text-sm"
        />
        <Button
          className="bg-violet-600 hover:bg-violet-700"
          onClick={onSubmit}
          disabled={loading || (!input.trim() && pendingImages.length === 0)}
          size="sm"
        >
          {imageProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      {imageProcessing && <p className="text-[10px] text-violet-600 mt-1">📷 Analizando imágenes con GPT-5.4 Vision...</p>}
    </div>
  );
}
