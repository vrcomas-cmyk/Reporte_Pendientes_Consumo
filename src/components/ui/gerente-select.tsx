import { Select } from '@/components/ui/select';
import type { EnrichIndex } from '@/core/enrich';

/** Dropdown "Gerente (todos)" del catálogo (pestaña GERENCIA DE MARCA). Al
 * elegir uno, cada reporte acota a los sectores a su cargo vía
 * `enrich.sectorDeGerente`. No se pinta si el catálogo no trae gerentes. */
export function GerenteSelect({ enrich, value, onChange }: { enrich: EnrichIndex; value: string; onChange: (v: string) => void }) {
  if (!enrich.gerentes.length) return null;
  return (
    <Select value={value} onChange={(ev) => onChange(ev.target.value)} className="w-auto" aria-label="Gerente de marca">
      <option value="">Gerente (todos)</option>
      {enrich.gerentes.map((g) => <option key={g} value={g}>{g}</option>)}
    </Select>
  );
}
