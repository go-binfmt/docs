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

## objcopy's options {#options}

Since v0.4.0 the options that shape an image are objcopy's, with the same names,
and the S-record and Intel HEX output is byte for byte what objcopy writes (the
S0 header text aside), CRLF included with `--crlf`:

```sh
fwimg -O srec -j '.text*' -j .rodata -o fw.srec fw.elf        # keep sections; * and ? match
fwimg -O srec -R '.*' -R '!.text' -o fw.srec fw.elf           # drop sections; ! protects
fwimg -O srec --gap-fill 0xff --pad-to 0x90400 -o fw.srec fw.elf
fwimg -O ihex --change-addresses 0x100 -o fw.hex fw.elf       # --adjust-vma: the same
fwimg -O ihex --set-start 0x80010 -o fw.hex fw.elf            # --change-start N: an increment
fwimg -O srec --srec-addr-len auto --srec-count --crlf -o fw.srec fw.elf
fwimg -O ihex --ihex-mode objcopy --crlf -o fw.hex fw.elf
```

- `-j` and `-R` select by section name and need an ELF with section headers
  (read with [elfpatch](../elfpatch) v0.5.0); giving both is refused, as objcopy
  calls it undefined.
- `--srec-addr-len 16|24|32|auto` picks S1/S9, S2/S8 or S3/S7 (auto: the shortest
  that holds the highest address, as objcopy does); `--srec-count` adds the S5
  (or S6) count record, as `srec_cat` does.
- `--ihex-mode linear` (the default) writes type 04 and type 05 records, as
  `srec_cat`; `objcopy` writes type 02 below 1 MiB and a type 03 start record.
  An ELF's entry address is now written to Intel HEX; before v0.4.0 it was
  dropped.
- Line endings stay LF unless `--crlf` is given.

In Go: `ELFImage`, `ELFSections` with a `SectionSelect`, `EncodeSRECOpts` and
`EncodeIHEXOpts`, and `Image.GapFill`, `PadTo` and `Offset`. The options are
compared with objcopy 2.44 and srec_cat 1.64 in CI (the lane fails if a tool is
missing).

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

Reading text (`-I ihex` / `-I srec` to a flat binary) on the CI runner (Ubuntu
x86-64, objcopy 2.46, 60 rounds, one core; the `bench` job of run 45888191102 on
`go-binfmt/fwimg` main at `2d5d60c2d0f0`, v0.4.3):

| File | `-O binary` | `-I ihex` | `-I srec` |
|------|------------:|----------:|----------:|
| 1 KiB | 0.6x | 0.6x | 0.6x |
| 4 MiB | 0.9x | 1.6x | 1.5x |
| 32 MiB | 1.0x | 1.7x | 1.5x |

On the same runner the `-O srec` and `-O ihex` rows are 1.1x at 4 MiB and 1.3x
at 32 MiB. The flat binary was 0.5x and 0.6x at 4 and 32 MiB before v0.4.2
(go-binfmt/fwimg#17: it built a second image and truncated an existing output
in place); v0.4.2 streams the segments and unlinks the output first, v0.4.3
maps an ELF input. The 4 MiB flat row is still behind by about 0.3 ms, a
start-up cost of the Go runtime, like the 1 KiB rows, tracked in
[go-binfmt/fwimg#2](https://github.com/go-binfmt/fwimg/issues/2). See the
[README](https://github.com/go-binfmt/fwimg#benchmark) for the method.
