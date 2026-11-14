export function defineResolvers(resolver) {
  resolver.define('getSettings', async () => {
    return { ok: true, data: null };
  });
}
