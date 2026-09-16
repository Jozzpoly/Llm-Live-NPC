# SPC Autonomous Evidence Observatory — Visual Map

Companion visualization for `SPC_AUTONOMOUS_EVIDENCE_OBSERVATORY_CAMPAIGN.md`.

This file is explanatory, not separate architecture authority.

## 1. Four independent observation planes

```mermaid
flowchart LR
    S[Versioned scenario / seed / fixture input]
    C[Evidence-only control plane\npause · exact World ticks · run-until]
    W[(Authoritative World)]

    S --> C
    C --> W

    W --> A[World truth plane\nactors · objects · actions · outcomes]
    W --> P[Participant projection\nwhat player can legitimately perceive]
    W --> R[Resident private plane\npercepts · knowledge · matters · runs]

    A --> L[Causal research ledger]
    P --> L
    R --> L

    L --> B[Browser / research provenance\nprovider attempts · admissions · console · network · perf]

    A --> E[Evidence packet]
    P --> E
    R --> E
    B --> E

    E --> X[Automated analyzers]
    E --> V[Human / AI visual review]

    X --> F[Scoped findings / gates]
    V --> F
```

Critical boundary: the arrows are observation/correlation paths. Research information must not flow backwards into resident knowledge or participant presentation.

## 2. One causal resident-life chain

```mermaid
flowchart LR
    O[World occurrence / outcome]
    PE[Resident percept evidence]
    K[Knowledge / belief update]
    M[Matter / discrepancy pressure]
    CA[Cognition attempt\nscoped dependencies]
    PR[Provider result]
    AD[Admission / stale / abandon]
    SR[Semantic revision]
    RUN[Exact task / run authority]
    LC[Local embodied control]
    ACT[World action attempt]
    WO[Authoritative World outcome]
    NE[New evidence / matter progress]

    O --> PE --> K --> M --> CA --> PR --> AD --> SR --> RUN --> LC --> ACT --> WO --> NE
    NE -. may pressure .-> M
```

The Observatory should be able to reconstruct this chain without model hidden chain-of-thought.

## 3. Capture at causal checkpoints

```mermaid
flowchart TB
    CP{Named causal checkpoint}

    CP --> JS[Canonical JSON state]
    CP --> LE[Ledger event window]
    CP --> PS[Participant screenshot]
    CP --> WS[Spectator / World screenshot]
    CP --> RS[Private research screenshot]
    CP --> BH[Browser health\nconsole · network · exceptions]
    CP --> PF[Optional performance / coverage]
    CP --> VT[Optional video / Playwright trace]

    JS --> AN[Analysis]
    LE --> AN
    PS --> AN
    WS --> AN
    RS --> AN
    BH --> AN
    PF --> AN
    VT --> AN

    AN --> CO[Hard causal oracles]
    AN --> TO[Temporal / metamorphic oracles]
    AN --> VI[Visual/readability findings]
    AN --> XR[Cross-run reproducibility]
```

## 4. Evidence hierarchy

```mermaid
flowchart TB
    U[Unit / contract evidence]
    D[Deterministic causal scenario]
    B[Reproducible real-browser run]
    FP[Fault / latency / interference pressure]
    LP[Live provider evidence]
    WR[Participant world-readable evidence]
    FR[Five-resident pressure]
    OO[Owner-observed evidence]

    U --> D --> B --> FP
    B --> LP
    FP --> WR
    LP --> WR
    WR --> FR --> OO
```

This is not a strict implementation waterfall. It visualizes why a lower evidence class cannot silently promote a higher claim.

## 5. Immediate campaign sequence

```mermaid
flowchart LR
    E0[E0\nGround v1 truth]
    E1[E1\nManual World tick control]
    E2[E2\nCanonical snapshot + ledger]
    E3[E3\nPlaywright/CDP hybrid probe]
    E4[E4\nVisual/readability lab]
    E5[E5\nAdversarial scenario matrix]
    E6[E6\nProvider + fault laboratory]
    E7[E7\nFive-life / longitudinal pressure]

    E0 --> E1 --> E2 --> E3 --> E4 --> E5 --> E6 --> E7
```

The critical stop-line is E1/E2: do not grow a large scenario suite while causal checkpoints still depend on wall-clock timing or research DOM text as semantic truth.
