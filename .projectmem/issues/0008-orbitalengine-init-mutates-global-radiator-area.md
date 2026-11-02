# #0008 OrbitalEngine.__init__ mutates global RADIATOR_AREA_M2 causing cross-instance state pollution

- 2026-10-22T14:29:13Z `issue`: OrbitalEngine.__init__ mutates global RADIATOR_AREA_M2 causing cross-instance state pollution [engine/orbital_engine.py:453]
- 2026-10-22T14:31:10Z `attempt`: Removed global RADIATOR_AREA_M2 mutation from OrbitalEngine.__init__ (worked)
- 2026-10-22T14:31:17Z `fix`: Removed global RADIATOR_AREA_M2 mutation in OrbitalEngine.__init__ so each engine instance maintains its own radiator_area_m2 without polluting global state
