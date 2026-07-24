import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the reports repository so tests stay deterministic & offline.
const addLog = vi.fn<(e: { level: string; event: string; detail?: string; at: string }) => Promise<number>>();
addLog.mockResolvedValue(1);

vi.mock('@/repositories', () => ({
  reportRepository: { addLog },
}));

const { logInfo, logWarn, logError, logEvent, logRejection } = await import('./logError');

describe('logError', () => {
  beforeEach(() => {
    addLog.mockClear();
    addLog.mockResolvedValue(1);
  });

  it('logEvent writes a LogEntry with the requested level', async () => {
    await logEvent('info', 'ev', 'd');
    expect(addLog).toHaveBeenCalledOnce();
    const arg = addLog.mock.calls[0][0];
    expect(arg.level).toBe('info');
    expect(arg.event).toBe('ev');
    expect(arg.detail).toBe('d');
    expect(typeof arg.at).toBe('string');
  });

  it('logInfo / logWarn / logError set the right level', async () => {
    await logInfo('a', 'b');
    await logWarn('c', 'd');
    await logError('e', 'f');
    expect(addLog.mock.calls[0][0].level).toBe('info');
    expect(addLog.mock.calls[1][0].level).toBe('warn');
    expect(addLog.mock.calls[2][0].level).toBe('error');
  });

  it('logRejection extracts a message from an Error', async () => {
    await logRejection('error', 'ev', new Error('boom'));
    expect(addLog.mock.calls[0][0].detail).toBe('boom');
  });

  it('logRejection stringifies non-Error throws', async () => {
    await logRejection('warn', 'ev', { weird: 'value' });
    expect(addLog.mock.calls[0][0].detail).toBe('[object Object]');
  });

  it('swallows a repository rejection so callers never throw', async () => {
    addLog.mockRejectedValueOnce(new Error('offline'));
    await expect(logInfo('x')).resolves.toBeUndefined();
  });

  it('logInfo defaults detail to empty string', async () => {
    await logInfo('only-event');
    expect(addLog.mock.calls[0][0].detail).toBe('');
  });
});
