// Decide whether this open page should load the newer deploy once.
export function shouldReload({ build, remote, already, pending }) {
  if (pending) return false;
  if (!build || build === 'dev' || build === '__VERSION__') return false;
  if (!remote || remote === build) return false;
  if (already === remote) return false;
  return true;
}
