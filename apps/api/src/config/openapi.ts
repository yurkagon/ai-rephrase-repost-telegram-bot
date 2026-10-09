/** All endpoints live under this prefix so the rest of the URL space is the client's. */
export const API_PREFIX = 'api';

export const OPENAPI_TITLE = 'NestJS Starter API';
export const OPENAPI_DESCRIPTION = [
  'Starter REST API with authentication and user management.',
  'Authentication uses JWT bearer tokens: send the access token as `Authorization: Bearer <token>`.',
].join('\n\n');
export const OPENAPI_VERSION = '1.0.0';

export const OPENAPI_JSON_PATH = '/openapi.json';
export const OPENAPI_DOCS_PATH = '/docs';
export const OPENAPI_SERVER_URL = `/${API_PREFIX}`;
export const ACCESS_TOKEN_SECURITY_NAME = 'accessToken';
