import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeRefresh, EMPLOYEE_POLL_INTERVAL_MS } from './employeeRefresh.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('polling and sync events share one request and publish amounts and history together', async () => {
  const request = deferred();
  const published = [];
  let calls = 0;
  const refresh = createEmployeeRefresh({
    load: () => { calls += 1; return request.promise; },
    apply: (result) => published.push(result),
    onError: assert.fail,
  });
  const first = refresh.refresh();
  assert.equal(first, refresh.refresh());
  await Promise.resolve();
  assert.equal(calls, 1);
  const paired = { employees: [{ adelantos: 20 }], novedades: [{ id: 1 }, { id: 2 }] };
  request.resolve(paired);
  await first;
  assert.deepEqual(published, [paired]);
  assert.equal(EMPLOYEE_POLL_INTERVAL_MS, 4000);
});

test('saving cancels an older read and refreshes immediately after confirmation', async () => {
  const oldRequest = deferred();
  const newRequest = deferred();
  const signals = [];
  const published = [];
  const requests = [oldRequest, newRequest];
  const refresh = createEmployeeRefresh({
    load: (signal) => { signals.push(signal); return requests.shift().promise; },
    apply: (result) => published.push(result), onError: assert.fail,
  });
  const oldPending = refresh.refresh();
  await Promise.resolve();
  refresh.pause();
  assert.equal(signals[0].aborted, true);
  await refresh.refresh();
  assert.equal(signals.length, 1);
  refresh.resume();
  const newPending = refresh.refresh();
  await Promise.resolve();
  const paired = { employees: [{ adelantos: 30 }], novedades: [{ id: 1 }, { id: 2 }, { id: 3 }] };
  newRequest.resolve(paired);
  await newPending;
  oldRequest.resolve({ employees: [{ adelantos: 20 }], novedades: [{ id: 1 }, { id: 2 }] });
  await oldPending;
  assert.deepEqual(published, [paired]);
});

test('responses from a previous local cannot overwrite the selected local', async () => {
  const oldRequest = deferred();
  const published = [];
  const oldLocal = createEmployeeRefresh({ load: () => oldRequest.promise, apply: (value) => published.push(value), onError: assert.fail });
  const oldPending = oldLocal.refresh();
  await Promise.resolve();
  oldLocal.dispose();
  oldLocal.resume();
  await oldLocal.refresh();
  const newLocal = createEmployeeRefresh({ load: async () => 'new local', apply: (value) => published.push(value), onError: assert.fail });
  await newLocal.refresh();
  oldRequest.resolve('old local');
  await oldPending;
  assert.deepEqual(published, ['new local']);
});

test('connection errors retain existing data and allow the next refresh', async () => {
  const published = [];
  const errors = [];
  let fail = true;
  const refresh = createEmployeeRefresh({
    load: async () => { if (fail) throw new Error('offline'); return { employees: [], novedades: [] }; },
    apply: (value) => published.push(value), onError: (error) => errors.push(error.message),
  });
  await refresh.refresh();
  assert.deepEqual(errors, ['offline']);
  assert.deepEqual(published, []);
  fail = false;
  await refresh.refresh();
  assert.deepEqual(published, [{ employees: [], novedades: [] }]);
});

test('a cancelled request does not show a stale error or revive deleted history', async () => {
  const oldRequest = deferred();
  const errors = [];
  const published = [];
  const refresh = createEmployeeRefresh({ load: () => oldRequest.promise, apply: (value) => published.push(value), onError: (error) => errors.push(error) });
  const pending = refresh.refresh();
  await Promise.resolve();
  refresh.dispose();
  oldRequest.reject(new Error('aborted'));
  await pending;
  assert.deepEqual(errors, []);
  assert.deepEqual(published, []);
});
