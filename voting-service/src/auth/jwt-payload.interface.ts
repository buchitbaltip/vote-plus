/** What we sign into the JWT and get back on every authenticated request. */
export interface JwtPayload {
  /** user id (standard JWT "subject" claim) */
  sub: string;
  username: string;
}
