export interface JWTAccessTokenPayload {
  userId: string;
  tokenType: 'access' | 'refresh';
}
