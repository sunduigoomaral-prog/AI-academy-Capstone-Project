'use client';

import { useCallback, useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ACCEPTED = '.xlsx,.xls';

function hasSupportedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls');
}

export function FileDropzone({
  onFileSelected,
  disabled,
}: {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!hasSupportedExtension(file.name)) {
        setLocalError(`Дэмжигдээгүй өргөтгөл: ${file.name}. Зөвхөн .xlsx, .xls хүлээн авна.`);
        return;
      }
      setLocalError(null);
      onFileSelected(file);
    },
    [onFileSelected],
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) accept(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
          dragging ? 'border-primary bg-accent' : 'border-input',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        <FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm font-medium">Excel файлаа энд чирж оруулна уу</p>
          <p className="mt-1 text-xs text-muted-foreground">Дэмжих формат: .xlsx, .xls</p>
        </div>
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={disabled}>
          <Upload className="h-4 w-4" aria-hidden />
          Файл сонгох
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>

      {localError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {localError}
        </p>
      )}
    </div>
  );
}
