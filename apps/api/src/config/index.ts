export const IS_DEV_ENV = process.env.NODE_ENV !== 'production';

const DEFAULT_PORT = 3000;
const DEFAULT_CLIENT_DEV_PORT = 3001;

const readPort = (name: string, value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${name} "${value}" — expected an integer between 1 and 65535.`);
  }

  return port;
};

/**
 * The port the app listens on — the API, and in production the client build too.
 * Read at call time so `load-env` has always run by then.
 */
export const getPort = () => readPort('PORT', process.env.PORT, DEFAULT_PORT);

/**
 * Vite's dev server port. The API only needs it to allow that origin through
 * CORS while developing; in production the client is served from `getPort()`.
 */
export const getClientDevPort = () =>
  readPort('CLIENT_PORT', process.env.CLIENT_PORT, DEFAULT_CLIENT_DEV_PORT);

/**
 * Origins allowed through CORS. CORS_ORIGIN replaces the local defaults.
 */
export const getCorsOrigins = (): string[] => {
  const configured = process.env.CORS_ORIGIN;

  if (configured !== undefined && configured.trim() !== '') {
    return configured
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== '');
  }

  return [`http://localhost:${getPort()}`, `http://localhost:${getClientDevPort()}`];
};
