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

## Reading other formats {#input}

The input does not have to be an ELF. `fwimg` recognises an ELF, an Intel HEX
file, an S-record file and a uImage by their magic or syntax, so any of them
converts to any output; `-I` forces the format. A raw file is never guessed:
it needs `-I binary --base ADDR`, as `objcopy -I binary` needs its address.

```sh
fwimg -I ihex -O binary -o fw.bin fw.hex
fwimg -I binary --base 0x8000000 -O srec -o fw.srec fw.bin
fwimg info uImage          # the header, as `mkimage -l` prints it
```

In Go, `DecodeIHEX`, `DecodeSREC`, `ParseUImage`, `RawImage` and `Detect` return
an `Image` of sparse segments (with the entry point and the name), which
`EncodeSREC` and `EncodeIHEX` write back.

The decoders check what the formats define and say where it fails: checksums
(with the line number), the end record, the S5/S6 count, both uImage CRCs and
the size table of a multi-file image, which is bounded by the header's size.
Overlapping records and data past 4 GiB are refused, not merged or wrapped. They
are checked against `objcopy -I`, `srec_cat`, `mkimage -l` and `dumpimage` in CI,
and fuzzed.

## What it refuses {#refusals}

The input is untrusted, so the module refuses rather than guesses:

- an image whose size comes from attacker-controlled addresses is bounded before
  it is allocated (`FlattenOptions.MaxSize`, a caller-stated limit);
- a segment that lies outside the input;
- an address range that wraps;
- SREC and Intel HEX data that would pass 4 GiB, instead of wrapping;
- text records that arrive scattered, each separate piece being charged against
  the same size limit.

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
