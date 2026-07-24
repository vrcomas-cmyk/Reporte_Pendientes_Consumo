import { useCallback, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

// Exported so GenerarReportePage.tsx (fase B de la migración a API) reusa el
// mismo control en vez de duplicarlo.
export function DropZone({
  onFile,
  accept,
  label,
  sub,
}: {
  onFile: (f: File) => void;
  accept: string;
  label: string;
  sub: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
        dragOver ? 'border-accent bg-accent-soft/40' : 'border-border hover:border-border-strong hover:bg-bg-inset/50'
      }`}
    >
      <UploadCloud className="size-7 text-text-faint" />
      <p className="text-sm font-medium text-text">{label}</p>
      <p className="text-xs text-text-faint">{sub}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
