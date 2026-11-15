# Staging install packages

- From v1.0.5 each package ships its own read-only static regression checker (`verificacao/V01_*.mjs`, with negative controls, output kept in `evidence/`), and package docs cite as proof only what is inside the package. Why: an auditor can reproduce every claimed check with the package folder alone.
- From v1.0.6 the rehearsal order exists once, as `rehearsal_sequence` in the version's `rules.ts`/`MANIFEST.json`; docs quote it verbatim, the scripts enforce it, and V01 checks both. Why: two descriptions of the order can drift apart; one cannot.
