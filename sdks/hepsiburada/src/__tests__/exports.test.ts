import { describe, expect, it } from 'vitest';
import { paginate, paginateOffset } from '../index.js';

describe('@lonca/hepsiburada public re-exports', () => {
  it('re-exports the @lonca/core pagination helpers so consumers need not depend on core directly', () => {
    expect(typeof paginate).toBe('function');
    expect(typeof paginateOffset).toBe('function');
  });
});
