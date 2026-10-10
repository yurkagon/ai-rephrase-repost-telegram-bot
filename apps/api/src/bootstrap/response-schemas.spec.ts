import { documentResponses, responseSchemas } from './response-schemas';
it('documents session tokens without a JSON refresh token and exposes asynchronous operation IDs', () => {
  expect(responseSchemas.Session.required).toEqual(['accessToken', 'user']);
  expect(responseSchemas.Session.properties).not.toHaveProperty('refreshToken');
  expect(responseSchemas.Operation.required).toEqual(
    expect.arrayContaining(['id', 'kind', 'status', 'revision']),
  );
});
it('resolves the response references and fails rather than silently omitting renamed endpoints', () => {
  for (const match of JSON.stringify(responseSchemas).matchAll(
    /#\/components\/schemas\/([A-Za-z]+)/g,
  )) {
    expect([...Object.keys(responseSchemas), 'RewriteOptionsDto']).toContain(match[1]);
  }
  expect(() =>
    documentResponses({ openapi: '3.0.0', info: { title: 'Test', version: '1' }, paths: {} }),
  ).toThrow('OpenAPI contract missing');
});
