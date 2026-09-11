import { useCallback, useRef, useState } from 'react';
import { Calculator, X, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePersistedState } from '@/hooks/usePersistedState';

type Operator = '+' | '-' | '×' | '÷';

interface CalcState {
  display: string;
  prevValue: number | null;
  operator: Operator | null;
  waitingForOperand: boolean;
  memory: number;
}

const INITIAL_STATE: CalcState = { display: '0', prevValue: null, operator: null, waitingForOperand: false, memory: 0 };

function apply(a: number, b: number, op: Operator): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? NaN : a / b;
  }
}

/** Formats a number for the display, trimming float noise (e.g. 0.1 + 0.2)
 * without permanently rounding the underlying value used in calculations. */
function formatDisplay(n: number): string {
  if (Number.isNaN(n)) return 'Error';
  if (!Number.isFinite(n)) return 'Error';
  const rounded = Math.round(n * 1e10) / 1e10;
  return rounded.toLocaleString('es-MX', { maximumFractionDigits: 10, useGrouping: true });
}

/** Widget de calculadora flotante, montado una sola vez en AppShell — visible
 * (y arrastrable) sobre cualquier reporte, abre/cierra con un FAB y recuerda
 * si estaba abierta entre navegaciones (usePersistedState) porque el
 * componente vive fuera del <Outlet> que se remonta por ruta. */
export function CalculatorWidget() {
  const [open, setOpen] = usePersistedState('calculator.open', false);
  const [pos, setPos] = usePersistedState('calculator.pos', { x: 24, y: 24 });
  const [calc, setCalc] = useState<CalcState>(INITIAL_STATE);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { startX, startY, origX, origY } = dragRef.current;
    // Position is stored as distance from the bottom-right corner, so it
    // stays anchored there as the window resizes — dragging still feels
    // natural in screen coordinates (drag left/up = increase x/y).
    const nextX = Math.max(0, origX - (e.clientX - startX));
    const nextY = Math.max(0, origY - (e.clientY - startY));
    setPos({ x: nextX, y: nextY });
  }, [setPos]);

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const inputDigit = (d: string) => {
    setCalc((s) => {
      if (s.waitingForOperand) return { ...s, display: d, waitingForOperand: false };
      return { ...s, display: s.display === '0' ? d : s.display + d };
    });
  };

  const inputDecimal = () => {
    setCalc((s) => {
      if (s.waitingForOperand) return { ...s, display: '0.', waitingForOperand: false };
      return s.display.includes('.') ? s : { ...s, display: s.display + '.' };
    });
  };

  const clearAll = () => setCalc(INITIAL_STATE);
  const clearEntry = () => setCalc((s) => ({ ...s, display: '0' }));

  const toggleSign = () => setCalc((s) => ({ ...s, display: s.display.startsWith('-') ? s.display.slice(1) : s.display === '0' ? s.display : '-' + s.display }));

  const inputPercent = () => setCalc((s) => ({ ...s, display: formatRaw(parseFloat(s.display.replace(/,/g, '')) / 100) }));

  function formatRaw(n: number): string {
    if (Number.isNaN(n) || !Number.isFinite(n)) return 'Error';
    return String(Math.round(n * 1e10) / 1e10);
  }

  const performOperation = (nextOperator: Operator | null) => {
    setCalc((s) => {
      const inputValue = parseFloat(s.display.replace(/,/g, ''));
      if (s.prevValue === null) {
        return { ...s, prevValue: inputValue, operator: nextOperator, waitingForOperand: true };
      }
      if (s.operator && !s.waitingForOperand) {
        const result = apply(s.prevValue, inputValue, s.operator);
        return { display: formatDisplay(result), prevValue: Number.isFinite(result) ? result : null, operator: nextOperator, waitingForOperand: true, memory: s.memory };
      }
      return { ...s, operator: nextOperator, waitingForOperand: true };
    });
  };

  const equals = () => performOperation(null);

  const memoryClear = () => setCalc((s) => ({ ...s, memory: 0 }));
  const memoryRecall = () => setCalc((s) => ({ ...s, display: formatDisplay(s.memory), waitingForOperand: true }));
  const memoryAdd = () => setCalc((s) => ({ ...s, memory: s.memory + parseFloat(s.display.replace(/,/g, '')) }));
  const memorySubtract = () => setCalc((s) => ({ ...s, memory: s.memory - parseFloat(s.display.replace(/,/g, '')) }));

  const KEY = 'flex-1 h-10 rounded-md text-sm font-medium transition-colors active:scale-[0.97]';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={open ? 'Ocultar calculadora' : 'Abrir calculadora'}
        className="fixed bottom-6 right-6 z-50 flex size-12 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <Calculator className="size-5" />
      </button>

      {open && (
        <div
          className="fixed z-50 w-64 select-none rounded-lg border border-border bg-bg-elevated shadow-2xl"
          style={{ right: pos.x, bottom: pos.y }}
        >
          <div
            className="flex cursor-grab items-center justify-between rounded-t-lg border-b border-border bg-bg-inset px-3 py-2 active:cursor-grabbing"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
              <GripHorizontal className="size-3.5" /> Calculadora
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-text-faint hover:text-text">
              <X className="size-4" />
            </button>
          </div>

          <div className="p-3">
            <div className="mb-2 flex items-center justify-between text-[10px] text-text-faint">
              <span>{calc.memory !== 0 ? 'M' : ''}</span>
              <span>{calc.operator ?? ''}</span>
            </div>
            <div className="mb-3 overflow-x-auto rounded-md bg-bg-inset px-3 py-2 text-right font-mono text-2xl text-text">
              {calc.display}
            </div>

            <div className="mb-1.5 grid grid-cols-4 gap-1.5">
              <button type="button" onClick={memoryClear} className={cn(KEY, 'bg-bg-inset text-text-muted hover:bg-border text-xs')}>MC</button>
              <button type="button" onClick={memoryRecall} className={cn(KEY, 'bg-bg-inset text-text-muted hover:bg-border text-xs')}>MR</button>
              <button type="button" onClick={memoryAdd} className={cn(KEY, 'bg-bg-inset text-text-muted hover:bg-border text-xs')}>M+</button>
              <button type="button" onClick={memorySubtract} className={cn(KEY, 'bg-bg-inset text-text-muted hover:bg-border text-xs')}>M-</button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              <button type="button" onClick={clearAll} className={cn(KEY, 'bg-danger/10 text-danger hover:bg-danger/20')}>C</button>
              <button type="button" onClick={clearEntry} className={cn(KEY, 'bg-bg-inset text-text hover:bg-border')}>CE</button>
              <button type="button" onClick={inputPercent} className={cn(KEY, 'bg-bg-inset text-text hover:bg-border')}>%</button>
              <button type="button" onClick={() => performOperation('÷')} className={cn(KEY, 'bg-bg-inset text-text hover:bg-border')}>÷</button>

              <button type="button" onClick={() => inputDigit('7')} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>7</button>
              <button type="button" onClick={() => inputDigit('8')} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>8</button>
              <button type="button" onClick={() => inputDigit('9')} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>9</button>
              <button type="button" onClick={() => performOperation('×')} className={cn(KEY, 'bg-bg-inset text-text hover:bg-border')}>×</button>

              <button type="button" onClick={() => inputDigit('4')} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>4</button>
              <button type="button" onClick={() => inputDigit('5')} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>5</button>
              <button type="button" onClick={() => inputDigit('6')} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>6</button>
              <button type="button" onClick={() => performOperation('-')} className={cn(KEY, 'bg-bg-inset text-text hover:bg-border')}>-</button>

              <button type="button" onClick={() => inputDigit('1')} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>1</button>
              <button type="button" onClick={() => inputDigit('2')} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>2</button>
              <button type="button" onClick={() => inputDigit('3')} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>3</button>
              <button type="button" onClick={() => performOperation('+')} className={cn(KEY, 'bg-bg-inset text-text hover:bg-border')}>+</button>

              <button type="button" onClick={toggleSign} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>±</button>
              <button type="button" onClick={() => inputDigit('0')} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>0</button>
              <button type="button" onClick={inputDecimal} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>,</button>
              <button type="button" onClick={equals} className={cn(KEY, 'bg-accent text-accent-fg hover:opacity-90')}>=</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
