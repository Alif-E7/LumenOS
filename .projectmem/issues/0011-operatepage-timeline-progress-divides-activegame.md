# #0011 OperatePage timeline progress divides activeGameState.step by activeGameState.step instead of max_steps, pinning timeline mark at 99.9%.

- 2026-11-10T14:15:08Z `issue`: OperatePage timeline progress divides activeGameState.step by activeGameState.step instead of max_steps, pinning timeline mark at 99.9%. [apps/web/src/pages/OperatePage.tsx]
- 2026-11-10T14:23:40Z `fix`: Fixed OperatePage timeline mark fraction to divide by activeClock.max_steps and derived missionHours and budgetTotal dynamically. [apps/web/src/pages/OperatePage.tsx]
