import { useEffect } from 'react';

// ---------------------------------------------------------------------------
// useKeybindings · tiny global keymap. Attaches one `keydown` listener at the
// document level and dispatches against a flat table of {combo, handler}.
//
// `combo` is "<Mod1>[-<Mod2>]…[-<Key>]" where ModOne is `cmd` (mac) or `ctrl`
// (other platforms), or `alt` / `shift`. Modifiers are case-insensitive; the
// bare key (e.g. `k`, `/`, `Enter`, `Escape`) is matched against `event.key`
// case-insensitively. Examples:
//
//   "cmd+k"     → Ctrl+K on Windows/Linux, ⌘K on macOS
//   "alt+s"     → Alt+S
//   "/"         → bare slash (no modifier) — focus search
//   "?"         → bare shift+/ (handled as "?")
//   "Escape"    → escape key
//
// Pass `enabled=false` to disable the whole map (e.g. when a modal is open
// that owns its own key handling). Handlers run in a stable order; the first
// matching combo wins and `preventDefault` is called on it.
// ---------------------------------------------------------------------------

export interface KeyHandler { combo: string; handler: (e: KeyboardEvent) => void; }
export interface KeybindingEntry { combo: string; label: string; group?: string; disabled?: boolean; }

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

function matchCombo(combo: string, ev: KeyboardEvent): boolean {
  // Combos are joined by `+` for modifiers: "cmd+k", "shift+/", "cmd+shift+p".
  // Within a single combo there is no `-` separator (keys like `/`, `?` are
  // bare). Split on `+`.
  const parts = combo.toLowerCase().split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return false;
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  const wantCmd = mods.includes('cmd') || mods.includes('ctrl') || mods.includes('mod');
  const wantAlt = mods.includes('alt') || mods.includes('option') || mods.includes('opt');
  const wantShift = mods.includes('shift');

  // `cmd` matches either the physical ⌘ (metaKey, macOS) or Ctrl on other
  // platforms. We accept EITHER to make chord literals portable across
  // platforms without forcing callers to vendor two combos per shortcut.
  const hasCmd = ev.metaKey || ev.ctrlKey;
  const hasAlt = ev.altKey;
  const hasShift = ev.shiftKey;

  if (wantCmd !== hasCmd) return false;
  if (wantAlt !== hasAlt) return false;
  if (wantShift !== hasShift) return false;
  if (wantCmd || wantAlt || wantShift) {
    // Modifier chord — compare the key case-insensitively against event.key.
    return ev.key.toLowerCase() === key;
  }
  // Bare key chord — only trigger when no modifier is held (so `/` doesn't
  // fire from cmd+/).
  if (hasCmd || hasAlt) return false;
  return ev.key.toLowerCase() === key;
}

/** Installs a global keymap. Pass an array of {combo, handler}. The map is
 *  rebuilt on every render — pass a stable array (useMemo) if you want to
 *  avoid churn, but the cost of reattaching the listener is microscopic. */
export function useKeybindings(handlers: KeyHandler[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (ev: KeyboardEvent) => {
      for (const h of handlers) {
        if (matchCombo(h.combo, ev)) {
          ev.preventDefault();
          h.handler(ev);
          return;
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handlers, enabled]);
}

export { isMac, matchCombo };
