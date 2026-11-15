# Staging install packages

- From v1.0.5 each package ships its own read-only static regression checker (`verificacao/V01_*.mjs`, with negative controls, output kept in `evidence/`), and package docs cite as proof only what is inside the package. Why: an auditor can reproduce every claimed check with the package folder alone.
