export const EMPLOYEE_POLL_INTERVAL_MS = 4000;

export function createEmployeeRefresh({ load, apply, onError }) {
  let disposed = false;
  let paused = false;
  let pending = null;

  const cancel = () => {
    pending?.controller.abort();
    pending = null;
  };

  return {
    refresh() {
      if (disposed || paused) return Promise.resolve();
      if (pending) return pending.promise;
      const request = { controller: new AbortController(), promise: null };
      pending = request;
      request.promise = Promise.resolve()
        .then(() => load(request.controller.signal))
        .then((result) => {
          if (!disposed && !paused && pending === request) apply(result);
        })
        .catch((error) => {
          if (!disposed && !paused && pending === request) onError(error);
        })
        .finally(() => {
          if (pending === request) pending = null;
        });
      return request.promise;
    },
    pause() {
      paused = true;
      cancel();
    },
    resume() {
      paused = false;
    },
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
