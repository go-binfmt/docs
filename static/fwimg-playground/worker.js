// fwimg playground worker: the conversion runs here, off the page's thread,
// so a large input cannot freeze the tab and the Cancel button can end it
// (the page terminates this worker).
//
// Every file is same-origin and loaded by this worker only: engine.js BEFORE
// wasm_exec.js (see the head of engine.js), then fwimg.wasm. No request carries
// the user's file; the bytes arrive by postMessage and leave the same way.
"use strict";

importScripts("engine.js", "wasm_exec.js");

let module = null;

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      const r = await fetch("fwimg.wasm");
      if (!r.ok) throw new Error("fwimg.wasm: HTTP " + r.status);
      module = await self.FwimgEngine.compile(await r.arrayBuffer());
      self.postMessage({ type: "ready", limits: self.FwimgEngine.limits });
    } else if (m.type === "convert") {
      if (!module) throw new Error("the engine is not loaded");
      const res = await self.FwimgEngine.convert(module, new Uint8Array(m.input), m.options, m.name);
      const transfer = [];
      if (res.output) {
        const buf = res.output.buffer.slice(res.output.byteOffset, res.output.byteOffset + res.output.byteLength);
        res.output = buf;
        transfer.push(buf);
      }
      self.postMessage({ type: "done", id: m.id, result: res }, transfer);
    }
  } catch (err) {
    self.postMessage({ type: "error", id: m.id, message: String(err && err.message ? err.message : err) });
  }
};
