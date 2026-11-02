# #0009 Solar power gauge max hardcoded to 2000W instead of orbital profile max watts

- 2026-10-22T14:29:21Z `issue`: Solar power gauge max hardcoded to 2000W instead of orbital profile max watts [dashboard/app.py:2125]
- 2026-10-22T14:41:48Z `attempt`: Changed solar gauge vmax from 2000.0W to mission['profile'].solar_array_max_watts (worked)
- 2026-10-22T14:41:57Z `fix`: Fixed solar power gauge vmax to dynamically match orbital profile max watts (e.g. 860W Mars, 1300W Lunar, 2000W LEO/GEO)
