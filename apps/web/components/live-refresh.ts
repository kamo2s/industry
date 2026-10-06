// One refresh connection for the visible document. Hidden tabs must not occupy
// HTTP/1 connection slots or repeatedly recalculate the same public directories.
export function createLiveRefresh() {
  const watchers = new Set<() => void>();
  let stream: EventSource | undefined;
  const notify = () => watchers.forEach(fn => fn());
  const close = () => { stream?.close(); stream = undefined; };
  const open = () => {
    if (stream || !watchers.size || document.visibilityState === 'hidden') return;
    stream = new EventSource('/api/stream');
    // Subscribers fetch on mount / resume already. The server's first frame is
    // a handshake, not a data change; don't immediately duplicate every GET.
    let first = true;
    stream.addEventListener('refresh', () => {
      if (first) { first = false; return; }
      notify();
    });
  };
  const resume = () => {
    if (document.visibilityState === 'hidden') { close(); return; }
    if (!stream) { notify(); open(); }
  };
  return (fn: () => void) => {
    watchers.add(fn);
    if (watchers.size === 1) {
      document.addEventListener('visibilitychange', resume);
      window.addEventListener('pagehide', close);
      window.addEventListener('pageshow', resume);
      open();
    }
    return () => {
      watchers.delete(fn);
      if (!watchers.size) {
        // React replaces route subscribers in the same commit. Keep that
        // handoff on one connection without retaining idle connections.
        queueMicrotask(() => { if (!watchers.size) close(); });
        document.removeEventListener('visibilitychange', resume);
        window.removeEventListener('pagehide', close);
        window.removeEventListener('pageshow', resume);
      }
    };
  };
}
