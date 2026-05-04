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

// /authorize — auto-register + auto-approve
// Single-tenant: any connecting client is registered on first contact,
// then immediately approved as nexus-admin with no login screen.
//
// Multi-tenant migration path:
// 1. Validate client identity before auto-registering
// 2. Show a real login form before calling completeAuthorization
// 3. Derive tenantId from the authenticated user session
app.get('/authorize', async (c) => {
  const url = new URL(c.req.url);
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');

  if (!clientId) {
    return c.text('Missing client_id', 400);
  }

  // Auto-register the client in OAUTH_KV if it hasn't been seen before.
  // This allows Claude.ai and any other MCP client to connect without
  // needing to call /register first (some clients skip DCR).
  const clientKey = `client:${clientId}`;
  const existingClient = await c.env.OAUTH_KV.get(clientKey);

  if (!existingClient) {
    const clientRecord = {
      clientId,
      redirectUris: redirectUri ? [redirectUri] : [],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      // 'none' = public client using PKCE — no client secret required
      tokenEndpointAuthMethod: 'none',
      registrationDate: Math.floor(Date.now() / 1000),
    };
    await c.env.OAUTH_KV.put(clientKey, JSON.stringify(clientRecord));
  }

  // Client is now guaranteed to be registered — parse the OAuth request
  let oauthReqInfo;
  try {
    oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  } catch (err) {
    return c.text(`OAuth request error: ${String(err)}`, 400);
  }

  if (!oauthReqInfo) {
    return c.text('Invalid OAuth request', 400);
  }

  // Auto-approve — single-tenant, no login required
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: 'nexus-admin',
    metadata: { label: 'NEXUS Orchestrator' },
    scope: oauthReqInfo.scope,
    props: {
      userId: 'nexus-admin',
      tenantId: 'default',
    },
  });

  return Response.redirect(redirectTo, 302);
});

export default app;
