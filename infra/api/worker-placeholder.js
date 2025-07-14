// This is a placeholder Workers script that will be replaced by the actual TypeScript code
// during deployment via Wrangler. Terraform creates this to set up the infrastructure,
// but the actual code is deployed separately.

export default {
  async fetch(request, env, ctx) {
    return new Response('Hang API - Deploy via Wrangler to update code', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  },
};
