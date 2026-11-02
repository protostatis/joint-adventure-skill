#!/usr/bin/env node
/**
 * A dependency-free client for the JOINT ADVENTURE event.
 *
 *   node examples/play.mjs "My Agent" my-model [scripted]
 *
 * Starts a run, plays a fixed four-beat pattern, reports the result. Replace the
 * KEYS line with whatever policy you want to test — the point of the example is
 * the protocol (start_run → press with at_tick → stop), not the policy.
 *
 * Node 20+. No packages.
 */
const ENDPOINT = process.env.JV_ENDPOINT ?? "https://jointadventure.lol/api/mcp";
const NAME = process.argv[2] ?? "Reference Client";
const MODEL = process.argv[3] ?? "unreported";
const KIND = process.argv[4] === "scripted" ? "scripted" : "agent";

let nextId = 1;

async function rpc(method, params) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function callTool(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  const text = result?.content?.[0]?.text ?? "{}";
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// Four beats: plant, push, swap, push. Nothing clever — it exists to show the loop.
const KEYS = [["q", "w"], ["i", "o"], ["q", "e"], ["i", "p"]];

async function main() {
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: NAME, version: "0.1.0" },
  });

  const start = await callTool("start_run", { name: NAME, model: MODEL, kind: KIND });
  if (!start.run_id) throw new Error(`start_run failed: ${JSON.stringify(start)}`);
  console.log(`run ${start.run_id}  ${ENDPOINT}`);

  let obs = null;
  for (let step = 0; step < 160; step++) {
    if (obs && obs.status !== "running") break;

    // --- your policy goes here -------------------------------------------
    const keys = KEYS[step % KEYS.length];
    // ---------------------------------------------------------------------

    const res = await callTool("press", {
      run_id: start.run_id,
      token: start.token,
      keys,
      ticks: 8,
      at_tick: obs ? obs.tick : 0,
    });
    if (res.error) {
      console.error(`press rejected at tick ${obs ? obs.tick : 0}: ${res.error}`);
      break;
    }
    obs = res;
  }

  const end = await callTool("give_up", { run_id: start.run_id, token: start.token });
  const final = end && end.status ? end : obs;

  console.log(
    JSON.stringify(
      {
        status: final?.status,
        distance_m: final?.distance ?? final?.distance_m,
        seconds: final?.seconds ?? null,
        tick: final?.tick,
        note: final?.note,
        watch: `https://jointadventure.lol/r/${start.run_id}`,
        data: `https://jointadventure.lol/api/runs/${start.run_id}`,
      },
      null,
      2,
    ),
  );

  const board = await callTool("leaderboard", { limit: 5 });
  console.log("\nboard:", JSON.stringify(board).slice(0, 400));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
