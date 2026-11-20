---
title: "elfpatch"
weight: 20
---

# elfpatch {#elfpatch}

`github.com/go-binfmt/elfpatch` is a pure-Go replacement for the subset of
[NixOS patchelf](https://github.com/NixOS/patchelf) that package builders use:
read and edit the **interpreter**, **RPATH/RUNPATH** and **DT_NEEDED** of ELF
files. It is a library and a command.

```sh
go install github.com/go-binfmt/elfpatch/cmd/elfpatch@latest

elfpatch --print-rpath bin/tool
elfpatch --set-rpath '$ORIGIN/../lib' bin/tool
elfpatch --set-interpreter /lib/ld-musl-x86_64.so.1 bin/tool
elfpatch --remove-needed libm.so.6 --shrink-rpath bin/tool
elfpatch --dry-run --set-rpath '$ORIGIN/lib' bin/tool     # prints the change, writes nothing
```

The library is `github.com/go-binfmt/elfpatch`: `Open`, `Parse`, `Patch`, and the
`File` methods `Interpreter`, `Needed`, `Soname`, `Rpath`, `Runpath`,
`SetInterpreter`, `SetRpath`, `RemoveRpath`, `RemoveNeeded`, `ReplaceNeeded` and
`ShrinkRpath`.

## Phase 1: in place, verified {#phase-1}

Phase 1 edits **in place**: a new value is written into the slot the linker
reserved and zero-padded. A value that does not fit is **refused** (`ErrNoSpace`,
exit 1, naming phase 2) and nothing is written. It is never truncated.

| patchelf flag | elfpatch phase 1 |
|---------------|------------------|
| `--print-interpreter`, `--print-rpath`, `--print-needed`, `--print-soname` | same output |
| `--set-interpreter` | in place, must fit `p_filesz` |
| `--set-rpath` (`--force-rpath`) | in place, must fit the existing string; converts `DT_RPATH` to `DT_RUNPATH` like patchelf; no entry yet is `ErrNoRpath` |
| `--remove-rpath` | removes the entry (later dynamic entries shift down, as patchelf does) |
| `--shrink-rpath` | drops directories that provide no `DT_NEEDED` library, and duplicates |
| `--remove-needed` | removes the entries; no match is not an error |
| `--replace-needed OLD NEW` | in place, `NEW` must fit `OLD`'s string |
| `--add-needed`, `--set-soname`, `--add-rpath`, `--page-size`, … | **phase 2**: refused, naming it |
| `--version`, `--output FILE`, `--dry-run` | yes (`--dry-run` is ours) |

## What every write checks {#checks}

- **Parsing is by program headers** (`PT_INTERP`, `PT_DYNAMIC`, `PT_LOAD`), for
  32-bit and 64-bit files in both byte orders, so it works on stripped files with
  no section headers. Every offset and size is checked against the file length
  without overflowing `uint64`, and the file is capped at 2 GiB so it is safe on
  32-bit hosts.
- **Shared strings are refused.** Linkers merge string tails in `.dynstr`.
  Zero-padding a slot that another name points into would corrupt that name, so
  the edit is refused (`ErrAmbiguous`) instead.
- **Writes are atomic.** A temporary file in the same directory is created from
  the original, only the edited byte ranges are written into it, the mode
  (including setuid) is applied, and it is renamed over the target. A symlink is
  followed, so the link survives. `--output` writes elsewhere instead.
- **The result is verified before the rename.** The temporary file is re-parsed
  and compared with the input: same length, byte-identical outside the ranges the
  edit declared, the declared ranges holding exactly the intended bytes, and every
  field the edit did not target reading back unchanged. Otherwise the edit fails
  with `ErrVerify` and nothing is renamed.
- **The parser is fuzzed.** `FuzzParse` feeds arbitrary bytes to the parser and to
  every edit and the verifier; the corpus is committed, and CI replays it and
  fuzzes for 60 seconds per run.

## Phase 2: growing a string {#phase-2}

Not done yet. When a string does not fit, patchelf adds a `PT_LOAD` and moves
`.dynstr` or `PT_INTERP` there, then fixes `.dynamic`, the `.dynsym` references,
the section headers and the hash tables. Phase 2 does the same, plus
`--add-needed`, `--set-soname`, `--add-rpath`, and adding an rpath where there is
none.

## Tested against patchelf {#differential}

`differential_test.go` builds real ELF files with gcc (a shared library and three
executables linked with `-Wl,-rpath` placeholders), applies the same edit with
patchelf and with elfpatch, and compares what `readelf -d -l` reports, every
`--print-*` output byte for byte, that the file did not grow (patchelf may move
things, elfpatch must not), and that the patched program still runs.

It runs in CI on Ubuntu, where it is required. On a machine without Linux, gcc,
readelf or patchelf it skips and says why. Nothing binary is committed: the
fixtures are built from two small C files at test time.

## Performance {#performance}

Measured single core, against patchelf, on the same files. On a 16 KiB file
elfpatch is slower, because a Go process starts slower than a C one; on large
files it is faster for prints and close to patchelf for edits. The numbers, the
machine and the method are in the
[README](https://github.com/go-binfmt/elfpatch#benchmark), and the small-file gap
is tracked in
[go-binfmt/elfpatch#2](https://github.com/go-binfmt/elfpatch/issues/2).

Licensed BSD-3-Clause.
