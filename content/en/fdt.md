---
title: "fdt"
weight: 40
---

# fdt {#fdt}

`github.com/go-binfmt/fdt` reads and writes **devicetree blobs** (DTB, format
version 17, the format of `dtc -O dtb` and of the FIT images U-Boot loads). It
is a library and a small command, in pure Go, with no libfdt and no `dtc` on the
build host.

```sh
go install github.com/go-binfmt/fdt/cmd/fdt@latest
```

```go
import "github.com/go-binfmt/fdt"

t, err := fdt.Parse(blob)            // every bound checked; ErrFormat on bad input
cpu, _ := t.Find("/cpus/cpu@0")      // absolute path
reg, _ := cpu.Uint32s("reg")         // typed getters: Uint32, Uint64, String, StringList...
cpu.SetString("status", "okay")      // edit the tree
out, _ := t.Marshal()                // byte-identical to dtc for the same tree
```

## Reading {#reading}

`Parse` takes untrusted bytes. The header, the memory-reservation map, the
structure block and the strings block are each checked against the input's
length without overflowing, a node nesting deeper than `fdt.MaxDepth` is
refused, and so are duplicate names, a property name outside the strings block
misaligned offsets and overlapping blocks; every size in the format is 32-bit,
so the checks behave the same on 32-bit hosts. Version 16 blobs are read as well as 17; older ones are refused
with `ErrVersion`. Nothing is ever truncated or guessed.

`Node.Lookup` resolves a relative path. Like libfdt's `fdt_subnode_offset`, a
path component without `@` matches the first child called `name@unit-address`,
unless a child is named exactly that.

## Writing {#writing}

`Marshal` lays the blob out the way `dtc` does, including its string table,
which reuses the tail of a name already present. The result is byte-identical to
`dtc -I dts -O dtb` for the same tree; CI checks it against dtc on random trees
and on the blobs of dtc's own test suite. `Marshal` refuses a tree that would
not parse back (no root, a `/` in a node name, duplicate names).

For large payloads, `ParseShared` aliases the input instead of copying the
values (they must then be treated as read-only), and `AppendMarshal` appends
to a caller's buffer, so a loop that writes many blobs allocates nothing.

## The command {#command}

```sh
fdt check  board.dtb                    # parse, refuse if malformed
fdt dump   board.dtb                    # devicetree source on stdout
fdt ls     board.dtb /cpus              # subnodes
fdt get    board.dtb /cpus/cpu@0 reg    # a property; -t s|u32|u64|x picks the format
```

## Assurance {#assurance}

* **Fuzzed**: `FuzzParse`, with the dtc test suite compiled to blobs as its
  committed corpus; CI replays it and fuzzes 60 s per run.
* **Differential**: reads agree with `fdtget`, writes with `dtc`, in CI.
* **Fast**: benchmarked single-core against libfdt in CI; the table is in the
  repository README.
* **Portable**: tested on 64-bit, on 32-bit (`386`) and on big-endian `s390x`.
