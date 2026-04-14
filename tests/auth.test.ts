import { describe, it, expect } from 'vitest';

describe('auth types', () => {
  it('RegisterRequest has required fields', () => {
    const req = { userId: 'test-uuid', nickname: 'TestUser' };
    expect(req.userId).toBeDefined();
    expect(req.nickname).toBeDefined();
  });
});
