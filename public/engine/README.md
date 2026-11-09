# Stockfish engine

These two files are the **"lite, single-threaded"** WebAssembly build of
[Stockfish 19](https://github.com/official-stockfish/Stockfish), compiled by
[Stockfish.js](https://github.com/nmrugg/stockfish.js) (npm package `stockfish@19.0.1`).

| File | SHA-256 |
| --- | --- |
| `stockfish-19-lite-single.js` | `ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a` |
| `stockfish-19-lite-single.wasm` | `ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de` |

The single-threaded build runs on any static host (GitHub Pages included)
because it doesn't need `SharedArrayBuffer` or cross-origin isolation headers.
Blunderscope gets its speed by running several of these engines side by side.

## License and source

Stockfish and Stockfish.js are free software under the GNU General Public
License v3 (see `COPYING.txt`). The corresponding source code is available at:

- Stockfish.js v19.0.1: https://github.com/nmrugg/stockfish.js/tree/v19.0.1
- Stockfish: https://github.com/official-stockfish/Stockfish

## Updating

1. Download `stockfish-<version>-lite-single.js` and `.wasm` from the
   [Stockfish.js releases](https://github.com/nmrugg/stockfish.js/releases)
   (or from `node_modules/stockfish/bin/` after `npm install stockfish`).
2. Replace the files here and update `ENGINE_FILE` in `src/lib/engine/engine.ts`
   if the file name changed.
3. Run `npm test` and `npm run test:e2e`.
