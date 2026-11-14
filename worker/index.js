import { handleApi } from '../api.js';
import { createD1Store } from '../d1-store.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return new Response('Thursday tennis API', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return handleApi(request, {
      store: createD1Store(env.DB),
      bootstrapPin: env.ADMIN_PIN || '',
      now: () => new Date(),
    });
  },
};
