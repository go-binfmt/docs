---
title: "elfpatch"
weight: 20
---

# elfpatch {#elfpatch}

`github.com/go-binfmt/elfpatch` is a pure-Go replacement for the subset of
[NixOS patchelf](https://github.com/NixOS/patchelf) that package builders use:
read and edit the **interpreter**, **RPATH/RUNPATH**, **DT_SONAME** and
**DT_NEEDED** of ELF files, growing the file when a value does not fit. It is a
library and a command.

```sh
go install github.com/go-binfmt/elfpatch/cmd/elfpatch@latest

elfpatch --print-rpath bin/tool
elfpatch --set-rpath '$ORIGIN/../lib' bin/tool
elfpatch --set-interpreter /lib/ld-musl-x86_64.so.1 bin/tool
elfpatch --remove-needed libm.so.6 --shrink-rpath bin/tool
elfpatch --add-needed libextra.so.1 --add-rpath '$ORIGIN/../lib' bin/tool
elfpatch --set-soname libfoo.so.2 lib/libfoo.so.1
elfpatch --dry-run --set-rpath '$ORIGIN/lib' bin/tool     # prints the change, writes nothing
```

The library is `github.com/go-binfmt/elfpatch`: `Open`, `Parse`, `Patch`, and the
`File` methods `Interpreter`, `Needed`, `Soname`, `Rpath`, `Runpath`,
`SetInterpreter`, `SetRpath`, `AddRpath`, `RemoveRpath`, `RemoveNeeded`,
`ReplaceNeeded`, `AddNeeded`, `SetSoname` and `ShrinkRpath`.

## In place, verified (phase 1) {#phase-1}

A value that fits is written **in place**: into the slot the linker reserved,
zero-padded. A value that does not fit makes the file grow (phase 2, below); a
file that cannot be grown refuses with `ErrNoSpace` (exit 1) and nothing is
written. A value is never truncated.

| patchelf flag | elfpatch |
|---------------|----------|
| `--print-interpreter`, `--print-rpath`, `--print-needed`, `--print-soname` | same output (`--print-soname` prints nothing, exit 0, when there is none or the file is not a shared object, as patchelf does) |
| `--remove-rpath` | removes the entry (later dynamic entries shift down, as patchelf does) |
| `--shrink-rpath` | drops directories that provide no `DT_NEEDED` library, and duplicates |
| `--remove-needed` | removes the entries; no match is not an error |
| `--version`, `--output FILE`, `--dry-run` | yes (`--dry-run` is ours) |

With several operations on one command line, elfpatch applies them in patchelf's
order: soname, interpreter, one rpath operation (shrink, else remove, else set,
else add), remove-needed, replace-needed, add-needed.

## What every write checks {#checks}

- **Parsing is by program headers** (`PT_INTERP`, `PT_DYNAMIC`, `PT_LOAD`), for
  32-bit and 64-bit files in both byte orders, so it works on stripped files with
  no section headers. Every offset and size is checked against the file length
  without overflowing `uint64`, and the file is capped at 2 GiB so it is safe on
  32-bit hosts.
- **Shared strings are never overwritten.** Linkers merge string tails in
  `.dynstr`. Zero-padding a slot that another name points into would corrupt that
  name, so such an edit does not go in place: it grows (below), or, where the file
  cannot grow, is refused (`ErrAmbiguous`).
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

## Phase 2: growth, the way patchelf does it {#phase-2}

Since v0.3.0 a value that does not fit grows the file. The layout engine is a port
of the section-replacement half of **patchelf 0.19.3** (`replaceSection`,
`rewriteSectionsLibrary`, `rewriteSectionsExecutable`, `shiftFile`,
`trimLoadSegments`, `normalizeNoteSegments`, `rewriteHeaders`):

- The new string is appended to `.dynstr` (or `.interp` is rewritten, or an entry
  is added at the top of `.dynamic`), and the section that grew is replaced by a
  larger copy placed in new space.
- A **shared library** gets that space at the end of the file, in a new `PT_LOAD`
  after the last page, or by extending the last `PT_LOAD` when it is read-write and
  ends where the file does.
- An **executable** cannot move its code, so the sections in front of it
  (`.interp`, notes, hash tables, `.dynsym`, `.dynstr`) move into the header page,
  the rest of the file shifts by whole pages, and the header `PT_LOAD` is reused or
  split into its own read-write one.
- The **page size** comes from `e_machine` (64 KiB for aarch64, ppc, mips, ia64,
  alpha, tilegx and loongarch; 8 KiB for sparc; 4 KiB otherwise) or from
  `--page-size`.
- The program and section headers are rewritten and sorted, the addresses in
  `.dynamic` follow their sections, and `st_shndx` follows the new section order.

ELF32 and ELF64, both byte orders, executables and shared libraries. Growth needs
section headers, as patchelf does.

| patchelf flag | elfpatch |
|---------------|----------|
| `--set-interpreter` | in place when it fits (patchelf always relocates), else `.interp` moves |
| `--set-rpath` (`--force-rpath`) | in place when it fits and nothing else shares the string, else appended to `.dynstr`; no entry yet: a `DT_RUNPATH` (`DT_RPATH`) is added |
| `--add-rpath DIRS` | `old:DIRS` set as above; adds a `DT_RUNPATH` when there is none |
| `--set-soname` | shared objects only (patchelf ignores it on `ET_EXEC`); adds `DT_SONAME` when there is none |
| `--add-needed LIB` | repeatable; sorted, added at the **top** of `.dynamic`, so they are searched first |
| `--replace-needed OLD NEW` | in place when it fits and is unshared, else appended; the version-needed file names follow |
| `--page-size N` | page size for the layout |

Not done, and refused with nothing written: `--set-os-abi`, `--add-debug-tag`,
`--no-default-lib`, `--clear-symbol-version`, `--rename-dynamic-symbols`,
`--build-resolution-cache`, a file with a `.note.nixos.ldcache` note, `--set-rpath`
on a file with both `DT_RPATH` and `DT_RUNPATH`, and `.gnu.version_r` names that
live outside `.dynstr`.

### What "verified" means for a grown file {#grown-verify}

The byte-range check of phase 1 cannot judge a file whose layout changed, so the
temporary file is judged by structure before the rename: it re-parses; the ELF
header is unchanged but for the table offsets and counts; every section keeps its
type, flags, links and contents (only `.interp`, `.dynstr` and `.dynamic` may
change size, `.dynstr` only by appending); a section whose address changed must be
one patchelf may move; symbols and version names read as before; every untouched
field of the snapshot reads back unchanged; and the program headers describe the
new file (each allocated section in a `PT_LOAD` at the offset its address implies,
with the permissions its flags need; `PT_INTERP`, `PT_DYNAMIC` and `PT_PHDR`
matching; no overlapping or writable-and-executable segment added). Anything else
is `ErrVerify`.

## Reading section headers {#sections}

Since v0.5.0, `File.Sections()` returns the section headers (name, type, flags,
address, file offset, size) in file order, read with the decoder the growing
edits use; a section that lies outside the image is refused with `ErrCorrupt`,
and an image without a section table (a stripped binary) with `ErrUnsupported`. [fwimg](../fwimg) uses it for `-j` / `-R`.

## Tested against patchelf {#differential}

`differential_test.go` and `differential_growth_test.go` build real ELF files with
gcc (executables, PIE and not, and shared libraries), apply the same edit with
patchelf and with elfpatch, and compare what `readelf -d -l -V` reports (`NEEDED`,
`SONAME`, `RPATH`, `RUNPATH`, the interpreter, the version-needed file names, the
kinds of program header), every `--print-*` output byte for byte, and that `readelf`
has no complaint about the result. Then **the edited program is run** with no
`LD_LIBRARY_PATH`; for a library, a program is linked against the edited library
and run. In-place edits must not grow the file; growth cases cover long
interpreters and rpaths, an rpath where there is none, `--add-needed`,
`--set-soname`, `--replace-needed` with version needs, `--page-size` and
combinations.

It runs in CI on Ubuntu against the patchelf from apt, where it is required, and a
second job runs the growth cases against **patchelf 0.19.3 built from its tag**,
requiring the same `PT_LOAD` flags, the same file size and the same program and
section header tables as that release. On a machine without Linux, gcc, readelf or
patchelf it skips and says why. Nothing binary is committed: the fixtures are built
from small C files at test time, and the synthetic images (`internal/elfgen`, every
class and byte order, both layouts) cover what gcc cannot build here.

`FuzzGrow` feeds arbitrary bytes to the layout engine, the growth edits and the
verifier; its corpus is committed and CI fuzzes it for 60 seconds per run.

## Performance {#performance}

Measured single core, against patchelf, on the same files. On a 16 KiB file
elfpatch is slower, because a Go process starts slower than a C one; on large
files it is faster for prints and close to patchelf for edits. The numbers, the
machine and the method are in the
[README](https://github.com/go-binfmt/elfpatch#benchmark), and the small-file gap
is tracked in
[go-binfmt/elfpatch#2](https://github.com/go-binfmt/elfpatch/issues/2).

Growth (CI runner, single core, patchelf 0.18.0, medians of 60 interleaved
rounds): patchelf / elfpatch is 0.6x on 16 KiB files, 0.6-0.9x on 4 MiB files
(an open defect,
[go-binfmt/elfpatch#7](https://github.com/go-binfmt/elfpatch/issues/7)) and 1.2x
on 32 MiB files, for `--set-rpath`, `--add-needed` and `--set-interpreter`.

Licensed BSD-3-Clause.
