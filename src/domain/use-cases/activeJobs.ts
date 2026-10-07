// Jobs this server process is working on right now. Kept on globalThis so every
// Next.js bundle (routes and the startup hook) shares the same set.
const g = globalThis as unknown as { __samesayActiveJobs?: Set<string> };
const active = (g.__samesayActiveJobs ??= new Set<string>());

export const activeJobs = {
  add: (id: string) => void active.add(id),
  remove: (id: string) => void active.delete(id),
  has: (id: string) => active.has(id),
};
