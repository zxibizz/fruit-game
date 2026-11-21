// A worker of run.mjs: takes the scenarios of one variant of the data (the same overrides, the same draw of the
// waves), gives the data and the options to the native bot in one batch (sim/js/play.mjs), and reads what came of
// every party. One worker per variant: the overrides change the data for good.
// record: the parties go back too (every action and the hash of the state after every step), with the data they were
// played on, for sim/js/verify.mjs to replay.
import { parentPort, workerData } from 'node:worker_threads';
import { resolve, summarize } from './scenario.mjs';
import { exportData } from '../sim/js/export.mjs';
import { play } from '../sim/js/play.mjs';

try {
  const { bin, jobs, tasks, record } = workerData, opts = tasks.map(resolve), data = exportData();
  const out = play(tasks.map((t, k) => ({ level: t.level, opts: opts[k], record: !!record, random: !!t.random })), { jobs, bin, data });
  parentPort.postMessage({ ok: true, res: out.map((x, k) => summarize(x.res, opts[k], tasks[k].level, Math.round(x.ms))), ...(record ? { data, opts, ops: out.map((x) => x.ops) } : {}) });
} catch (e) { parentPort.postMessage({ ok: false, err: String(e.stack || e) }); }
