# SPC browser evidence analysis

Source: `ba9f0c4221849723beedfbe856e4aa3728c5ff00`  
Browser outcome: **PASS**

## Resident trajectories

| Resident | Samples | Moving | Max speed | Displacement | Sampled path | Regions | Legacy idle while moving |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Janek | 49 | 43 | 90.0 | 1022.4 | 1022.5 | workshop → crossroads | 43 |
| Mira | 2 | 2 | 95.0 | 31.0 | 31.0 | hearth | 0 |

### Visual trajectories

- [Janek trajectory](trajectory-janek.svg)
- [Mira trajectory](trajectory-mira.svg)

## Derived findings

- **material · recovered-execution-vs-legacy-activity:** Janek moved in 43/49 sampled frames while legacy activity remained idle.
- **positive-evidence · janek-material-route-observed:** Real browser evidence observed Janek move 1022.4 world units across workshop → crossroads.
- **positive-evidence · player-call-private-hearing:** The real browser path produced player speech that appeared in Mira's private hearing evidence.

## Browser health

- Runtime exceptions: 0
- Console/log errors: 0
- Network failures: 0
- HTTP errors: 0
