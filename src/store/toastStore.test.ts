import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore, toast } from './toastStore';

function reset() {
  useToastStore.setState({ toasts: [] });
}

describe('toastStore', () => {
  beforeEach(() => {
    reset();
    // nextId is module-private; clear it via getEngineState if needed but our
    // tests don't reference specific ids, only counts and stack ordering.
  });

  it('starts with empty queue', () => {
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('toast.success adds a single entry', () => {
    toast.success('Done');
    const s = useToastStore.getState().toasts;
    expect(s).toHaveLength(1);
    expect(s[0].level).toBe('success');
    expect(s[0].title).toBe('Done');
  });

  it('toast.error adds a longer-duration entry', () => {
    toast.error('Boom');
    const s = useToastStore.getState().toasts;
    expect(s[0].level).toBe('error');
    expect(s[0].duration).toBeGreaterThan(4000);
  });

  it('toast.fromError pulls message from Error', () => {
    toast.fromError(new Error('offline'));
    const s = useToastStore.getState().toasts;
    expect(s[0].title).toBe('Algo salió mal');
    expect(s[0].description).toBe('offline');
  });

  it('toast.fromError stringifies non-Error throws', () => {
    toast.fromError('string thrown');
    const s = useToastStore.getState().toasts;
    expect(s[0].description).toBe('string thrown');
  });

  it('dismiss by id removes one item', () => {
    toast.info('a');
    toast.info('b');
    const [first] = useToastStore.getState().toasts;
    toast.dismiss(first.id);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('clear empties the whole queue', () => {
    toast.info('a');
    toast.info('b');
    toast.info('c');
    toast.clear();
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
