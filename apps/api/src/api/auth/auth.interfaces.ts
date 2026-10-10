export interface JWTAccessTokenPayload {
  userId: string;
  sessionId: string;
  tokenType: 'access' | 'refresh';
}
