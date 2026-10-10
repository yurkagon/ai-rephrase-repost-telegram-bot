export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  telegramId: string | null;
  role: string;
};

export type Options = {
  language: 'uk' | 'en';
  tone: 'neutral' | 'formal' | 'friendly';
  length: 'preserve' | 'concise';
  rewriteStrength?: 'light' | 'balanced' | 'deep';
  removeSource: boolean;
  customInstructions?: string;
};

export const defaults: Options = {
  language: 'uk',
  tone: 'neutral',
  length: 'preserve',
  rewriteStrength: 'balanced',
  removeSource: true,
  customInstructions: '',
};

export type Channel = {
  id: string;
  title: string;
  chatId: string;
  username: string | null;
  canPublish: boolean;
};

export type Route = {
  id: string;
  name: string;
  sourceId: string;
  targetId: string;
  source: Channel;
  target: Channel;
  active: boolean;
  options: Options;
};

export type Media = {
  id: string;
  messageId: number;
  type: 'photo' | 'video';
  originalCaption: string;
};

export type Caption = { messageId: number; html: string };

export type Revision = {
  id: string;
  version: number;
  origin: string;
  html: string;
  captions: Caption[];
  createdAt: string;
};

export type Post = {
  id: string;
  route: Route;
  originalHtml: string;
  media: Media[];
  revisions: Revision[];
  revision: number;
  status: string;
  error: string | null;
  failureStage: string | null;
  publishedIds: number[];
  createdAt: string;
};

export type Metrics = {
  calls: number;
  failures: number;
  inputTokens: number | null;
  outputTokens: number | null;
  averageDurationMs: number | null;
};
