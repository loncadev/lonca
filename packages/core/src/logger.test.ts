import { afterEach, describe, expect, it, vi } from 'vitest';
import { consoleLogger, noopLogger } from './logger.js';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('noopLogger swallows all calls', () => {
    expect(() => {
      noopLogger.debug('x');
      noopLogger.info('x');
      noopLogger.warn('x');
      noopLogger.error('x');
      noopLogger.child({ a: 1 }).info('y');
    }).not.toThrow();
  });

  it('consoleLogger emits info/debug via console.log', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleLogger().info('hello', { id: 1 });
    expect(log).toHaveBeenCalledOnce();
    const arg = log.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(arg) as Record<string, unknown>;
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('hello');
    expect(parsed.id).toBe(1);
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('consoleLogger emits warn/error via console.error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogger().error('bad', { code: 'X' });
    expect(err).toHaveBeenCalledOnce();
    const parsed = JSON.parse(err.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(parsed.level).toBe('error');
    expect(parsed.code).toBe('X');
  });

  it('child logger merges bindings and child overrides parent', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const parent = consoleLogger({ app: 'lonca', env: 'dev' });
    const child = parent.child({ env: 'test', requestId: 'r1' });
    child.info('msg');
    const parsed = JSON.parse(log.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(parsed.app).toBe('lonca');
    expect(parsed.env).toBe('test');
    expect(parsed.requestId).toBe('r1');
  });
});
