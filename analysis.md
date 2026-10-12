# SPC browser evidence analysis

Source: `e1da810da098cb3a64e3a4d9030cc745ca6a2c2c`  
Browser outcome: **PASS**

## Resident trajectories

| Resident | Samples | Moving | Max speed | Displacement | Sampled path | Regions | Legacy idle while moving |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Janek | 60 | 56 | 90.0 | 1149.6 | 1321.3 | workshop → crossroads | 56 |
| Mira | 2 | 2 | 95.0 | 22.5 | 22.5 | hearth | 0 |

### Visual trajectories

- [Janek trajectory](trajectory-janek.svg)
- [Mira trajectory](trajectory-mira.svg)

## Derived findings

- **material · recovered-execution-vs-legacy-activity:** Janek moved in 56/60 sampled frames while legacy activity remained idle.
- **positive-evidence · janek-material-route-observed:** Real browser evidence observed Janek move 1149.6 world units across workshop → crossroads.
- **positive-evidence · player-call-private-hearing:** The real browser path produced player speech that appeared in Mira's private hearing evidence.

## Browser health

- Runtime exceptions: 0
- Console/log errors: 0
- Network failures: 0
- HTTP errors: 0
