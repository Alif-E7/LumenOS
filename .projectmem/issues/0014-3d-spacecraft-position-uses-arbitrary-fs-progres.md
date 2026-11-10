# #0014 3D spacecraft position uses arbitrary fs.progress angle while target proximity uses backend orbital lat/lon, causing target laser beam to cut through Earth and misalign with nadir cone.

- 2026-11-10T14:15:22Z `issue`: 3D spacecraft position uses arbitrary fs.progress angle while target proximity uses backend orbital lat/lon, causing target laser beam to cut through Earth and misalign with nadir cone. [apps/web/src/components/flight/UltraRealisticEarthFlight.tsx]
- 2026-11-10T14:28:46Z `fix`: Synchronized 3D target acquisition laser and nadir footprint cone to true 3D sub-satellite normal and added 3-node Optical ISL Relay Constellation. [apps/web/src/components/flight/UltraRealisticEarthFlight.tsx]
