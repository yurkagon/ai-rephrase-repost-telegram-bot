import { getClientDevPort, getCorsOrigins, getPort } from './index';

describe('port config', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original };
  });

  afterAll(() => {
    process.env = original;
  });

  describe('getPort', () => {
    it('defaults to 3000 when PORT is unset', () => {
      delete process.env.PORT;

      expect(getPort()).toBe(3000);
    });

    it('defaults to 3000 when PORT is blank', () => {
      process.env.PORT = '   ';

      expect(getPort()).toBe(3000);
    });

    it('reads the configured port', () => {
      process.env.PORT = '3012';

      expect(getPort()).toBe(3012);
    });

    it.each(['0', '65536', '-1', '3012.5', 'abc'])('rejects %s', (value) => {
      process.env.PORT = value;

      expect(() => getPort()).toThrow(`Invalid PORT "${value}"`);
    });
  });

  describe('getClientDevPort', () => {
    it('defaults to 3001', () => {
      delete process.env.CLIENT_PORT;

      expect(getClientDevPort()).toBe(3001);
    });

    it('reads the configured port', () => {
      process.env.CLIENT_PORT = '4001';

      expect(getClientDevPort()).toBe(4001);
    });
  });

  describe('getCorsOrigins', () => {
    it('allows the local API and client ports by default', () => {
      delete process.env.CORS_ORIGIN;
      process.env.PORT = '3012';
      process.env.CLIENT_PORT = '3001';

      expect(getCorsOrigins()).toEqual(['http://localhost:3012', 'http://localhost:3001']);
    });

    it('replaces the list when CORS_ORIGIN is set', () => {
      process.env.CORS_ORIGIN = 'https://example.com';

      expect(getCorsOrigins()).toEqual(['https://example.com']);
    });

    it('trims entries and drops empty ones', () => {
      process.env.CORS_ORIGIN = 'https://a.example, https://b.example ,,';

      expect(getCorsOrigins()).toEqual(['https://a.example', 'https://b.example']);
    });

    it('falls back to the defaults when CORS_ORIGIN is blank', () => {
      process.env.CORS_ORIGIN = '  ';

      expect(getCorsOrigins()).toEqual(['http://localhost:3000', 'http://localhost:3001']);
    });
  });
});
