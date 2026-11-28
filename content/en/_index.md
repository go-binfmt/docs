---
title: "Home"
weight: 10
---

# go-binfmt {#go-binfmt}

Pure-Go tooling for **binary formats**, starting with **ELF**: read and edit
executables and shared objects without `patchelf`, `binutils` or a C toolchain.
No cgo, and static binaries that run on Linux, macOS, the BSDs and Windows.

The PE/COFF and UEFI side lives in [go-coff](https://github.com/go-coff); this
organisation takes the other formats, one repository per job.

## Components {#components}

| Module | Layer | What it does |
|--------|-------|--------------|
| [`elfpatch`]({{< relref "elfpatch.md" >}}) | library and CLI | Read and edit an ELF file's interpreter, `RUNPATH`/`RPATH` and `DT_NEEDED`, with patchelf's flag names. In-place, atomic, verified after the write. |
| [`fwimg`]({{< relref "fwimg.md" >}}) | library and CLI | Convert an ELF into a flat binary, Motorola S-record, Intel HEX, U-Boot uImage (gzip or lz4 too), FIT, UF2 or Verilog hex, refusing sizes and address ranges the input does not support. [Runs in your browser]({{< relref "fwimg.md#playground" >}}) as WebAssembly. Moved here from `go-coff/peln/fwimg`. |
| [`fdt`]({{< relref "fdt.md" >}}) | library and CLI | Read and write devicetree blobs (DTB v17), with output byte-identical to `dtc` and every bound of untrusted input checked. |

## Why not call patchelf? {#why-not-call-patchelf}

A package builder that relocates binaries needs `patchelf` on the build host, and
`patchelf` is a C++ program: one more thing to build, ship and trust on every
platform the builder runs on. `elfpatch` is a Go library and a single static
binary, so a Go tool can do the edit in-process and cross-compile anywhere Go
does. It keeps patchelf's flag names so a script moves over by changing the
program name, and it is tested against patchelf in CI rather than assumed to
agree with it.
