import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { Hono } from 'hono';
import type { Env } from './index';

export type Bindings = Env & {
  OAUTH_PROVIDER: OAuthHelpers;
};

const app = new Hono<{ Bindings: Bindings }>();

// Root — health check
app.get('/', (c) => {
  return c.text('NEXUS Knowledge MCP — connect at /mcp');
});

// /authorize — single-tenant auto-approve
// No login screen shown. Immediately completes the OAuth flow.
// Multi-tenant: replace this with a real login form + identity check.
app.get('/authorize', async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

  if (!oauthReqInfo) {
    return c.text('Invalid OAuth request', 400);
  }

  // Single-tenant: auto-approve as nexus-admin
  // Multi-tenant: validate user identity here before completing
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: 'nexus-admin',
    metadata: { label: 'NEXUS Orchestrator' },
    scope: oauthReqInfo.scope,
    props: {
      userId: 'nexus-admin',
      // Single-tenant: always 'default'
      // Multi-tenant: derive from authenticated user session
      tenantId: 'default',
    },
  });

  return Response.redirect(redirectTo, 302);
});

export default app;
