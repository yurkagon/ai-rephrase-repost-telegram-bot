import type {
  SchemaObject,
  ReferenceObject,
  OpenAPIObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { Role, PostStatus, OperationStatus, OperationKind } from '@/infra/prisma/prisma.service';
import { API_PREFIX } from '@/config/openapi';
const string: SchemaObject = { type: 'string' };
const integer: SchemaObject = { type: 'integer' };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const nullableString: SchemaObject = { type: 'string', nullable: true };
const ref = (name: string): ReferenceObject => ({ $ref: `#/components/schemas/${name}` });
const array = (items: SchemaObject | ReferenceObject): SchemaObject => ({ type: 'array', items });
const object = (properties: Record<string, SchemaObject | ReferenceObject>): SchemaObject => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
});
const channel = object({
  id: string,
  ownerId: string,
  chatId: string,
  title: string,
  username: nullableString,
  canPublish: { type: 'boolean' },
  createdAt: date,
});
const caption = object({ messageId: integer, html: string });
export const responseSchemas: Record<string, SchemaObject> = {
  SafeUser: object({
    id: string,
    email: { type: 'string', format: 'email' },
    firstName: string,
    lastName: string,
    role: { type: 'string', enum: Object.values(Role) },
    telegramId: nullableString,
    createdAt: date,
    updatedAt: date,
  }),
  Session: object({
    accessToken: {
      type: 'string',
      description:
        'Keep in memory; the rotating refresh session is returned only as an HttpOnly cookie.',
    },
    user: ref('SafeUser'),
  }),
  MessageResult: object({ message: string }),
  Channel: channel,
  Route: object({
    id: string,
    ownerId: string,
    sourceId: string,
    targetId: string,
    name: string,
    active: { type: 'boolean' },
    options: ref('RewriteOptionsDto'),
    source: ref('Channel'),
    target: ref('Channel'),
    createdAt: date,
  }),
  PostMedia: object({
    id: string,
    postId: string,
    messageId: integer,
    type: { type: 'string', enum: ['photo', 'video'] },
    fileId: string,
    originalCaption: string,
  }),
  PostRevision: object({
    id: string,
    postId: string,
    version: integer,
    origin: { type: 'string', enum: ['ai', 'manual'] },
    html: string,
    captions: array(caption),
    createdAt: date,
  }),
  Operation: object({
    id: string,
    postId: string,
    kind: { type: 'string', enum: Object.values(OperationKind) },
    status: { type: 'string', enum: Object.values(OperationStatus) },
    revision: integer,
    options: ref('RewriteOptionsDto'),
    createdAt: date,
    updatedAt: date,
  }),
  PostDetail: object({
    id: string,
    routeId: string,
    sourceKey: string,
    originalHtml: string,
    status: { type: 'string', enum: Object.values(PostStatus) },
    revision: integer,
    publishedIds: array(integer),
    error: nullableString,
    failureStage: nullableString,
    rating: { ...integer, nullable: true },
    createdAt: date,
    lastReceivedAt: date,
    route: ref('Route'),
    media: array(ref('PostMedia')),
    revisions: array(ref('PostRevision')),
  }),
  PostList: object({ posts: array(ref('PostDetail')), nextCursor: nullableString }),
  Metrics: object({
    calls: integer,
    failures: integer,
    inputTokens: { ...integer, nullable: true },
    outputTokens: { ...integer, nullable: true },
    averageDurationMs: { type: 'number', nullable: true },
    averageRating: { type: 'number', nullable: true },
    todayUsed: integer,
    dailyLimit: integer,
  }),
  ResolvedPublication: object({ published: { type: 'boolean' } }),
  Health: object({ status: { type: 'string', enum: ['ok'] } }),
  TelegramLink: object({
    url: {
      type: 'string',
      format: 'uri',
      description: 'One-use /start link valid for ten minutes.',
    },
  }),
};
const contracts: [string, 'get' | 'post' | 'patch' | 'delete', number, string][] = [
  ...['register', 'logout'].map((action): [string, 'post', number, string] => [
    `auth/${action}`,
    'post',
    201,
    'MessageResult',
  ]),
  ['auth/login', 'post', 201, 'Session'],
  ['auth/refresh', 'post', 201, 'Session'],
  ['auth/me', 'get', 200, 'SafeUser'],
  ['user', 'get', 200, 'SafeUser[]'],
  ['user', 'post', 201, 'SafeUser'],
  ['user/{id}', 'get', 200, 'SafeUser'],
  ['user/{id}', 'delete', 200, 'SafeUser'],
  ['user/me', 'patch', 200, 'SafeUser'],
  ['user/{id}/role', 'patch', 200, 'SafeUser'],
  ['channels/connect', 'post', 201, 'TelegramLink'],
  ['channels', 'get', 200, 'Channel[]'],
  ['channels', 'post', 201, 'Channel'],
  ['channels/{id}', 'delete', 200, 'Channel'],
  ['channels/routes', 'get', 200, 'Route[]'],
  ['channels/routes', 'post', 201, 'RouteRecord'],
  ['channels/routes/{id}', 'patch', 200, 'RouteRecord'],
  ['channels/routes/{id}', 'delete', 200, 'RouteRecord'],
  ['posts', 'get', 200, 'PostList'],
  ['posts/{id}', 'get', 200, 'PostDetail'],
  ['posts/{id}', 'patch', 200, 'PostRevision'],
  ['posts/metrics', 'get', 200, 'Metrics'],
  ['posts/operations/{id}', 'get', 200, 'Operation'],
  ['posts/{id}/generate', 'post', 202, 'Operation'],
  ['posts/{id}/publish', 'post', 202, 'Operation'],
  ['posts/{id}/rating', 'post', 201, 'PostRecord'],
  ['posts/{id}/resolve', 'post', 201, 'ResolvedPublication'],
  ['health', 'get', 200, 'Health'],
];
// Mutation methods return scalar Prisma records; relations are only included in read views.
responseSchemas.RouteRecord = object(
  Object.fromEntries(
    Object.entries(responseSchemas.Route.properties!).filter(
      ([key]) => !['source', 'target'].includes(key),
    ),
  ),
);
responseSchemas.PostRecord = object(
  Object.fromEntries(
    Object.entries(responseSchemas.PostDetail.properties!).filter(
      ([key]) => !['route', 'media', 'revisions'].includes(key),
    ),
  ),
);
export function documentResponses(document: OpenAPIObject) {
  document.components ??= {};
  document.components.schemas = { ...document.components.schemas, ...responseSchemas };
  for (const [path, method, status, name] of contracts) {
    const operation = document.paths[`/${API_PREFIX}/${path}`]?.[method];
    if (!operation) throw new Error(`OpenAPI contract missing: ${method} ${path}`);
    operation.responses[String(status)] = {
      description:
        status === 202
          ? 'Durable operation accepted; poll the operation ID. Duplicate clicks return the same operation.'
          : 'Success',
      content: {
        'application/json': {
          schema: name.endsWith('[]') ? array(ref(name.slice(0, -2))) : ref(name),
        },
      },
    };
  }
}
