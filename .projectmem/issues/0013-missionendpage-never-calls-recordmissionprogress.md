# #0013 MissionEndPage never calls recordMissionProgression, so Play Mode mission completions do not persist career XP, credits, or unlocks.

- 2026-11-10T14:15:12Z `issue`: MissionEndPage never calls recordMissionProgression, so Play Mode mission completions do not persist career XP, credits, or unlocks. [apps/web/src/pages/MissionEndPage.tsx]
- 2026-11-10T14:23:47Z `fix`: Wired MissionEndPage to call recordMissionProgression and display earned XP, Engineering Credits, and Orbital AI debrief telemetry. [apps/web/src/pages/MissionEndPage.tsx]
