import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { extname, join, sep } from 'node:path';

import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

import { API_PREFIX, OPENAPI_DOCS_PATH, OPENAPI_JSON_PATH } from '@/config/openapi';

export const CLIENT_INDEX_FILE = 'index.html';

const IMMUTABLE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Everything the server owns; the rest of the URL space belongs to the client. */
const SERVER_PREFIXES = [`/${API_PREFIX}`, OPENAPI_DOCS_PATH, OPENAPI_JSON_PATH];

const isServerPath = (path: string) =>
  SERVER_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/** Where `apps/client` puts its build. Override with CLIENT_DIST_PATH when deploying. */
export const getClientDistPath = () =>
  process.env.CLIENT_DIST_PATH ?? join(process.cwd(), '..', 'client', 'dist');

export const hasClientBuild = (clientDist = getClientDistPath()) =>
  existsSync(join(clientDist, CLIENT_INDEX_FILE));

/**
 * Serves the client build next to the API: files by path, and `index.html` for
 * anything outside the server's own prefixes, so client-side routes survive a
 * reload. Nothing is registered when there is no build — dev runs on Vite.
 */
export const useClientApp = (app: NestExpressApplication, clientDist = getClientDistPath()) => {
  const logger = new Logger('ClientApp');
  const indexPath = join(clientDist, CLIENT_INDEX_FILE);

  if (!hasClientBuild(clientDist)) {
    logger.warn(`No client build at ${clientDist} — serving the API only.`);

    return false;
  }

  app.useStaticAssets(clientDist, {
    // index.html is owned by the fallback below, never served as a directory index.
    index: false,
    setHeaders: (res: ServerResponse, filePath: string) => {
      // Vite fingerprints everything under assets/, so those can be cached forever.
      const isFingerprinted = filePath.includes(`${sep}assets${sep}`);

      res.setHeader(
        'Cache-Control',
        isFingerprinted ? `public, max-age=${IMMUTABLE_MAX_AGE_SECONDS}, immutable` : 'no-cache',
      );
    },
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    // Let the API and docs answer for themselves — including their 404s.
    if (isServerPath(req.path)) {
      next();

      return;
    }

    // A missing file (/logo.png) should stay a 404 instead of returning the shell.
    if (req.method !== 'GET' || extname(req.path)) {
      next();

      return;
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexPath);
  });

  logger.log(`Serving client build from ${clientDist}`);

  return true;
};
