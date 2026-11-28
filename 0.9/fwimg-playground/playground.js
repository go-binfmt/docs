// fwimg playground page. Everything happens in this browser: the file is read
// with FileReader, handed to a Worker running fwimg built for WebAssembly, and
// the result is offered as a download from a blob: URL. The page makes no
// request that carries the file (its CSP, in index.html, forbids any other
// origin), and it writes into the DOM with textContent only.
"use strict";

(function () {
  const MAX_INPUT = 32 * 1024 * 1024;
  const $ = (id) => document.getElementById(id);
  const EXT = { binary: ".bin", srec: ".srec", ihex: ".hex", uimage: ".uimg", uf2: ".uf2", verilog: ".vh" };

  let worker = null;
  let ready = false;
  let nextId = 1;
  let pending = null; // {id, name}
  let blobURL = null;

  function setStatus(text, isError) {
    const s = $("status");
    s.textContent = text;
    s.className = isError ? "error" : "";
  }

  function startWorker() {
    ready = false;
    $("convert").disabled = true;
    $("cancel").disabled = true;
    setStatus("Loading fwimg.wasm...");
    worker = new Worker("worker.js");
    worker.onmessage = onMessage;
    worker.onerror = () => setStatus("The engine failed to load (is fwimg.wasm published next to this page?).", true);
    worker.postMessage({ type: "init" });
  }

  function onMessage(e) {
    const m = e.data;
    if (m.type === "ready") {
      ready = true;
      $("convert").disabled = false;
      setStatus("Ready. Choose a file; it never leaves this browser.");
    } else if (m.type === "error") {
      pending = null;
      $("convert").disabled = !ready;
      $("cancel").disabled = true;
      setStatus(m.message, true);
    } else if (m.type === "done" && pending && m.id === pending.id) {
      show(m.result, pending.name);
      pending = null;
      $("convert").disabled = false;
      $("cancel").disabled = true;
    }
  }

  function pretty(json) {
    if (!json) return "";
    try {
      return JSON.stringify(JSON.parse(json), null, 2);
    } catch (_) {
      return json;
    }
  }

  function show(r, name) {
    $("args").textContent = "fwimg " + r.args.join(" ");
    $("info").textContent = r.info ? pretty(r.info) : (r.infoError || "(no info)");
    $("outinfo").textContent = r.outputInfo ? pretty(r.outputInfo) : "";
    $("stderr").textContent = r.stderr || "";
    const dl = $("download");
    if (blobURL) URL.revokeObjectURL(blobURL);
    blobURL = null;
    dl.hidden = true;
    if (r.ok) {
      const fmt = $("format").value;
      const base = name.replace(/\.[^.]*$/, "") || "image";
      blobURL = URL.createObjectURL(new Blob([r.output], { type: "application/octet-stream" }));
      dl.href = blobURL;
      dl.download = base + (EXT[fmt] || ".bin");
      dl.textContent = "Download " + dl.download + " (" + r.output.byteLength + " bytes)";
      dl.hidden = false;
      setStatus("Converted: " + r.output.byteLength + " bytes.");
    } else {
      setStatus("fwimg refused the conversion (exit " + r.code + "): see the message below.", true);
    }
  }

  function options() {
    const o = {
      format: $("format").value,
      inputFormat: $("inputFormat").value,
      base: $("base").value.trim(),
      load: $("load").value.trim(),
      entry: $("entry").value.trim(),
      name: $("imgname").value,
      uimageComp: $("uimageComp").value,
      uf2Family: $("uf2Family").value.trim(),
      verilogWidth: $("verilogWidth").value.trim(),
      verilogEndian: $("verilogEndian").value,
      useVaddr: $("useVaddr").checked,
    };
    return o;
  }

  function convert() {
    const f = $("file").files[0];
    if (!f) return setStatus("Choose a file first.", true);
    if (f.size === 0) return setStatus("The file is empty.", true);
    if (f.size > MAX_INPUT) return setStatus("The file is " + f.size + " bytes; the playground takes at most " + MAX_INPUT + " (32 MiB). Use the command-line tool for larger files.", true);
    const rd = new FileReader();
    rd.onerror = () => setStatus("The file could not be read.", true);
    rd.onload = () => {
      const id = nextId++;
      pending = { id, name: f.name };
      $("convert").disabled = true;
      $("cancel").disabled = false;
      setStatus("Converting...");
      worker.postMessage({ type: "convert", id, input: rd.result, options: options(), name: f.name }, [rd.result]);
    };
    rd.readAsArrayBuffer(f);
  }

  function cancel() {
    if (!pending) return;
    worker.terminate();
    pending = null;
    setStatus("Cancelled.");
    startWorker();
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
      setStatus("This browser has no WebAssembly or Web Workers.", true);
      return;
    }
    $("convert").addEventListener("click", convert);
    $("cancel").addEventListener("click", cancel);
    startWorker();
  });
})();
