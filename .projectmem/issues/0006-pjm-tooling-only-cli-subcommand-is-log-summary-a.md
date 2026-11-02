# #0006 pjm tooling: only CLI subcommand is 'log <summary> --at <path>'; there is no 'wall' command

- 2026-10-21T13:04:03Z `issue`: pjm tooling: only CLI subcommand is 'log <summary> --at <path>'; there is no 'wall' command [C:\Users\Hp]
- 2026-10-21T13:05:21Z `attempt`: Full verification attempt 1: smoke harness failed on off-by-one (the arming run itself ticks the fragment once) and a wrong cadence formula inside the test; adjusted expectations and all checks passed. (partial)
- 2026-10-21T13:05:22Z `attempt`: Attempt 2: ran AppTest smoke, direct-import HTML checks, unit tests (test_orbital, test_scheduler, test_advanced_features), py_compile, worst-case chart size probe, and a live streamlit server check (partial)
- 2026-10-21T13:05:23Z `attempt`: Attempt 3: populated .projectmem/PROJECT_MAP.md via PowerShell round-trip, which mangled Unicode arrows; rewrote the file with the editor write tool. (partial)
- 2026-10-21T13:05:36Z `fix`: Tooling note, not a code issue: pjm CLI commands confirmed (log/attempt/fix/decision/note/show/search). Closing as resolved.
