---
title: "fdt"
weight: 30
---

# fdt {#fdt}

`github.com/go-binfmt/fdt` is a pure-Go reader and writer for **devicetree
blobs** (DTB, format version 17): the format of `dtc -O dtb` and of the FIT
images U-Boot loads. No cgo, no libfdt, no `dtc` on the build host. It is a
library and a command.

```sh
go install github.com/go-binfmt/fdt/cmd/fdt@latest

fdt check board.dtb                    # parse, refuse if malformed
fdt dump  board.dtb                    # devicetree source on stdout
fdt ls    board.dtb /cpus              # subnodes
fdt get   board.dtb /cpus/cpu@0 reg    # a property (-t s|u32|u64|x picks the format)
```

```go
import "github.com/go-binfmt/fdt"

t, err := fdt.Parse(blob)            // every bound checked; errors wrap fdt.ErrFormat
cpu, _ := t.Find("/cpus/cpu@0")
reg, _ := cpu.Uint32s("reg")
cpu.SetString("status", "okay")
out, _ := t.Marshal()                // byte-identical to dtc for the same tree
```

## Reading {#reading}

`Parse` takes untrusted bytes. Every header field, the reservation map, the
structure block and the strings block are checked against the input length
without overflowing, so the result is the same on 32-bit hosts. Nesting deeper
than `MaxDepth` (128), duplicate node or property names, misaligned or
overlapping blocks, a truncated or unknown token and a second root are refused.
Versions 17 and 16 are read; anything older is `ErrVersion`. Nothing is
truncated or guessed.

## Writing {#writing}

`Marshal` writes the layout `dtc` writes, including its string table, so the
result is **byte-identical** to `dtc -I dts -O dtb` for the same tree. CI proves
it against the real `dtc` on random trees and on the blobs of dtc's own test
suite. For large payloads, `ParseShared` and `AppendMarshal` avoid the copies
that `Parse` and `Marshal` make.

## Assurance {#assurance}

The writer is tested differentially against `dtc` and the reader against
`fdtget`, in CI with the tools required so that a runner that loses them fails
instead of skipping. `Parse` is fuzzed with the dtc test suite as the committed
corpus, statement coverage is gated at 100 %, and every refusal is mutation
swept. Performance is measured in CI against libfdt; the table is in the
repository README.
