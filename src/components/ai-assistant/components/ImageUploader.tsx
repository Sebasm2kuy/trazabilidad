// ============================================================
// ImageUploader — Gestión de imágenes pendientes + upload
// ------------------------------------------------------------
// Muestra previews de imágenes pendientes y el botón de upload.
// Sin lógica de procesamiento (eso vive en useChat).
// ============================================================

'use client';
import { Button } from '@/components/ui/button';
import { ImagePlus, Loader2 } from 'lucide-react';

interface ImageUploaderProps {
  pendingImages: File[];
  imageProcessing: boolean;
  loading: boolean;
  onAddImages: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
}

export function ImageUploader({
  pendingImages, imageProcessing, loading, onAddImages, onRemoveImage,
}: ImageUploaderProps) {
  return (
    <>
      {pendingImages.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 p-2 bg-violet-50 rounded border border-violet-200">
          {pendingImages.map((img, i) => (
            <div key={i} className="relative group">
              <img src={URL.createObjectURL(img)} alt={img.name} className="h-16 w-16 object-cover rounded border" />
              <button
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full h-4 w-4 flex items-center justify-center text-[10px] hover:bg-red-600"
                onClick={() => onRemoveImage(i)}
              >×</button>
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 truncate rounded-b">{img.name}</span>
            </div>
          ))}
          <div className="flex items-center text-[11px] text-violet-700 font-medium ml-1">
            {pendingImages.length} imagen{pendingImages.length !== 1 ? 'es' : ''} → Enter para procesar
          </div>
        </div>
      )}
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          onAddImages(files);
          e.target.value = '';
        }}
        id="ai-image-upload"
      />
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => document.getElementById('ai-image-upload')?.click()}
        disabled={imageProcessing || loading}
        title="Subir capturas del MGAP (puede seleccionar múltiples)"
      >
        {imageProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      </Button>
    </>
  );
}
