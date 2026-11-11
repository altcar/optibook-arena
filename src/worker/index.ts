import { ArenaEngine } from './engine';
import type { Env } from './env';

export { ArenaEngine };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws' || url.pathname.startsWith('/api/')) {
      const id = env.ARENA.idFromName('global-arena');
      return env.ARENA.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
