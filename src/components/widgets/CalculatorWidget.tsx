import { useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePersistedState } from '@/hooks/usePersistedState';
import { isEditableTarget } from '@/hooks/useKeybindings';
import { FloatingWindow, Z_WIDGET } from './FloatingWindow';

function useClipboard() {
    const copy = useCallback(async (text: string) => {
      await navigator.clipboard.writeText(text);
    }, []);

    const paste = useCallback(async (): Promise<string | null> => {
      try {
        const text = await navigator.clipboard.readText();
        return text;
      } catch {
        return null;
      }
    }, []);

    return { copy, paste };
  }

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
  const [calc, setCalc] = useState<CalcState>(INITIAL_STATE);
  const { copy, paste } = useClipboard();

  // Alt+C abre/cierra la calculadora desde cualquier lado (incluso con un campo o diálogo enfocado).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyC') { e.preventDefault(); setOpen((o) => !o); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setOpen]);

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (isEditableTarget(e)) return;
      // Solo con el foco en la calculadora o en el fondo de la página: con un diálogo (o cualquier otro control) enfocado no se roban sus teclas.
      const target = e.target as HTMLElement | null;
      if (target && target !== document.body && !target.closest('[data-calc-root]')) return;
      const key = e.key;
      const esCtrl = (e.metaKey || e.ctrlKey) && (key === 'c' || key === 'v');
      if (!esCtrl && !/^[0-9+\-*xX/:=.]$|^(Enter|Escape|Backspace)$/.test(key)) return;
      e.preventDefault();

      if (key >= '0' && key <= '9') {
        inputDigit(key);
      } else if (key === '+' || key === '-') {
        const op: Operator = key === '+' ? '+' : '-';
        performOperation(op);
      } else if (key === '*' || key === 'x' || key === 'X') {
        performOperation('×');
      } else if (key === '/' || key === ':') {
        performOperation('÷');
      } else if (key === 'Enter' || key === '=') {
        equals();
      } else if (key === 'Escape') {
        setOpen(false);
      } else if (key === '.') {
        inputDecimal();
      } else if (key === 'Backspace') {
        clearEntry();
      } else if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
        copy(calc.display);
      } else if (e.key === 'v' && (e.metaKey || e.ctrlKey)) {
        paste().then((text) => {
          if (text) {
            const num = parseFloat(text.replace(/,/g, ''));
            if (!isNaN(num)) {
            const numStr = String(num);
            const digit = numStr.includes('.') ? num : numStr.replace(/[^0-9]/g, '');
            inputDigit(String(digit));
          }
          }
        });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const KEY = 'flex-1 h-10 rounded-md text-sm font-medium transition-colors active:scale-[0.97]';

  return (
    <>
      {createPortal(
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title={open ? 'Ocultar calculadora (Alt+C)' : 'Abrir calculadora (Alt+C)'}
          data-floating-widget
          className={cn('pointer-events-auto fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 flex size-11 items-center sm:bottom-6 sm:right-6 sm:size-12 justify-center rounded-full bg-accent text-accent-fg shadow-lg transition-transform hover:scale-105 active:scale-95', Z_WIDGET)}
        >
          <Calculator className="size-5" />
        </button>,
        document.body,
      )}

      {open && (
        <FloatingWindow titulo="Calculadora" posKey="calculator.pos" posInicial={{ x: 24, y: 24 }} onClose={() => setOpen(false)} className="w-64">
          <div className="p-3" data-calc-root>
            <div className="mb-2 flex items-center justify-between text-[11px] text-text-faint">
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
              <button type="button" onClick={() => copy(calc.display)} className={cn(KEY, 'bg-bg-inset text-text-muted hover:bg-border text-xs')}>Copiar</button>
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
              <button type="button" onClick={() => paste()} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>Pegar</button>
              <button type="button" onClick={inputDecimal} className={cn(KEY, 'bg-transparent text-text hover:bg-bg-inset')}>,</button>
              <button type="button" onClick={equals} className={cn(KEY, 'bg-accent text-accent-fg hover:opacity-90')}>=</button>
            </div>
          </div>
        </FloatingWindow>
      )}
    </>
  );
}