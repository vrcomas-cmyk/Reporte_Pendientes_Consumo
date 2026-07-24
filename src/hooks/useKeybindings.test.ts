import { describe, it, expect } from 'vitest';
import { matchCombo } from './useKeybindings';

/** Build a synthetic KeyboardEvent with the mods/keys we want. */
function ev(opts: { key: string; ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean }): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: opts.key,
    ctrlKey: !!opts.ctrl,
    metaKey: !!opts.meta,
    altKey: !!opts.alt,
    shiftKey: !!opts.shift,
  });
}

describe('matchCombo', () => {
  it('matches bare keys when no modifier is required', () => {
    expect(matchCombo('/', ev({ key: '/' }))).toBe(true);
    expect(matchCombo('t', ev({ key: 't' }))).toBe(true);
    expect(matchCombo('T', ev({ key: 't' }))).toBe(true); // case-insensitive
    expect(matchCombo('enter', ev({ key: 'Enter' }))).toBe(true);
  });

  it('rejects bare-key combo when an unrelated modifier is held', () => {
    expect(matchCombo('/', ev({ key: '/', ctrl: true }))).toBe(false);
    expect(matchCombo('/', ev({ key: '/', alt: true }))).toBe(false);
  });

  it('matches ctrl/cmd chords regardless of platform', () => {
    expect(matchCombo('cmd+k', ev({ key: 'k', ctrl: true }))).toBe(true);
    expect(matchCombo('cmd+k', ev({ key: 'k', meta: true }))).toBe(true);
    expect(matchCombo('ctrl+k', ev({ key: 'k', ctrl: true }))).toBe(true);
    expect(matchCombo('cmd+k', ev({ key: 'k' }))).toBe(false);
    expect(matchCombo('cmd+k', ev({ key: 'K', shift: true, ctrl: true }))).toBe(false);
  });

  it('matches alt chords', () => {
    expect(matchCombo('alt+s', ev({ key: 's', alt: true }))).toBe(true);
    expect(matchCombo('alt+s', ev({ key: 's' }))).toBe(false);
  });

  it('matches shift-only chords', () => {
    expect(matchCombo('shift+/', ev({ key: '/', shift: true }))).toBe(true);
    expect(matchCombo('shift+/', ev({ key: '?' }))).toBe(false); // ? is a different key
  });

  it('rejects when extra modifiers are present that the combo does not require', () => {
    expect(matchCombo('cmd+k', ev({ key: 'k', ctrl: true, alt: true }))).toBe(false);
  });

  it('handles multi-mod combos', () => {
    expect(matchCombo('cmd+shift+p', ev({ key: 'p', ctrl: true, shift: true }))).toBe(true);
    expect(matchCombo('cmd+shift+p', ev({ key: 'p', ctrl: true }))).toBe(false);
  });

  it('case-insensitive on the key', () => {
    expect(matchCombo('k', ev({ key: 'K' }))).toBe(true);
    expect(matchCombo('K', ev({ key: 'k' }))).toBe(true);
  });
});
