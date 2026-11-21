import { parentPort, workerData } from 'node:worker_threads';
import { runScenario } from './scenario.mjs';
try { parentPort.postMessage({ ok: true, res: runScenario(workerData) }); } catch (e) { parentPort.postMessage({ ok: false, err: String(e.stack || e) }); }
