import { memo, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

/** Self-contained search box: holds its own input state and only notifies the parent with the *debounced* value, so typing re-renders just this small component — never the whole page on every keystroke.
 * `initialValue` solo siembra el estado interno al MONTAR (ej. desde un filtro
 * persistido) — no vuelve el input controlado; para "limpiar" desde el padre,
 * remonta este componente con una `key` distinta (ver ClearFiltersButton). */
export const DebouncedSearch = memo(function DebouncedSearch({
  onChange, placeholder, delay = 200, className = 'w-64', initialValue = '',
}: { onChange: (v: string) => void; placeholder?: string; delay?: number; className?: string; initialValue?: string }) {
  const [local, setLocal] = useState(initialValue);
  const debounced = useDebouncedValue(local, delay);
  useEffect(() => { onChange(debounced); }, [debounced, onChange]);
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-2.5 top-2.5 size-3.5 text-text-faint" />
      <Input placeholder={placeholder} value={local} onChange={(e) => setLocal(e.target.value)} className="pl-8" />
    </div>
  );
});
