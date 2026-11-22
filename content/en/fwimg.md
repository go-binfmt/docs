---
title: "fwimg"
weight: 30
---

# fwimg {#fwimg}

`github.com/go-binfmt/fwimg` converts an ELF executable into the image a
bootloader or ROM loads at a fixed address: a **flat binary**
(`objcopy -O binary`), a **Motorola S-record**, **Intel HEX** or a legacy
**U-Boot uImage** (`mkimage`). It is a library and a command, in pure Go, with no
binutils, `srec_cat` or `mkimage` on the build host.

It moved here from `go-coff/peln/fwimg`, which is now deprecated; `pectl objcopy`
uses this module.

```sh
go install github.com/go-binfmt/fwimg/cmd/fwimg@latest
```

```go
import "github.com/go-binfmt/fwimg"

elf, _ := os.ReadFile("kernel.elf")
flat, base, err := fwimg.Flatten(bytes.NewReader(elf), int64(len(elf)), fwimg.FlattenOptions{})
```

`Flatten` takes the size of the input; `SREC`, `IHEX` and `UImage` return an
error.

## What it refuses {#refusals}

The input is untrusted, so the module refuses rather than guesses:

- an image whose size comes from attacker-controlled addresses is bounded before
  it is allocated (`FlattenOptions.MaxSize`, a caller-stated limit);
- a segment that lies outside the input;
- an address range that wraps;
- SREC and Intel HEX data that would pass 4 GiB, instead of wrapping.

## Benchmark {#benchmark}

Against `objcopy` (reference / fwimg, so more than 1x means fwimg is faster;
linux/arm64, one core, medians of 40 rounds):

| File | binary | srec | ihex | uimage |
|------|-------:|-----:|-----:|-------:|
| 1 KiB | 0.7x | 0.7x | 0.7x | 2.9x |
| 4 MiB | 1.1x | 1.2x | 1.2x | 8.8x |
| 32 MiB | 1.0x | 1.2x | 1.1x | 13.3x |

The small-file gap is process start-up, tracked in
[go-binfmt/fwimg#2](https://github.com/go-binfmt/fwimg/issues/2). See the
[README](https://github.com/go-binfmt/fwimg#benchmark) for the method.
