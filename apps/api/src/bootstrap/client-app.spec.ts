import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { API_PREFIX } from '@/config/openapi';

import { useClientApp } from './client-app';

const INDEX_HTML = '<!doctype html><title>NestJS Starter</title><div id="root"></div>';
const ASSET_JS = 'console.log("bundle")';

@Controller('health')
class ProbeController {
  @Get()
  public check() {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeAppModule {}

describe('serving the client build', () => {
  let app: NestExpressApplication;
  let clientDist: string;

  beforeAll(async () => {
    clientDist = mkdtempSync(join(tmpdir(), 'client-dist-'));
    mkdirSync(join(clientDist, 'assets'));
    writeFileSync(join(clientDist, 'index.html'), INDEX_HTML);
    writeFileSync(join(clientDist, 'assets', 'index-abc123.js'), ASSET_JS);

    app = await NestFactory.create<NestExpressApplication>(ProbeAppModule, { logger: false });
    app.setGlobalPrefix(API_PREFIX);
    useClientApp(app, clientDist);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(clientDist, { recursive: true, force: true });
  });

  it('leaves API endpoints untouched', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200, { ok: true });
    await request(app.getHttpServer()).get('/api/nope').expect(404);
  });

  it('serves the client shell at the root', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);
    expect(response.text).toContain('<div id="root">');
  });

  it('serves fingerprinted assets as immutable', async () => {
    const response = await request(app.getHttpServer()).get('/assets/index-abc123.js').expect(200);
    expect(response.text).toBe(ASSET_JS);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('reports a missing build instead of serving one', () => {
    expect(useClientApp(app, join(clientDist, 'nope'))).toBe(false);
  });
});
