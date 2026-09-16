# SPC browser evidence analysis

Source: `01d61d826d48f7420986c26580c1227eac7e0707`  
Browser outcome: **PASS**

## Resident trajectories

| Resident | Samples | Moving | Max speed | Displacement | Sampled path | Regions | Legacy idle while moving |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Janek | 50 | 44 | 90.0 | 1032.8 | 1033.0 | workshop → crossroads | 44 |
| Mira | 2 | 2 | 95.0 | 29.7 | 29.7 | hearth | 0 |

### Visual trajectories

- [Janek trajectory](trajectory-janek.svg)
- [Mira trajectory](trajectory-mira.svg)

## Derived findings

- **material · recovered-execution-vs-legacy-activity:** Janek moved in 44/50 sampled frames while legacy activity remained idle.
- **positive-evidence · janek-material-route-observed:** Real browser evidence observed Janek move 1032.8 world units across workshop → crossroads.
- **positive-evidence · player-call-private-hearing:** The real browser path produced player speech that appeared in Mira's private hearing evidence.

## Browser health

- Runtime exceptions: 0
- Console/log errors: 0
- Network failures: 0
- HTTP errors: 0
