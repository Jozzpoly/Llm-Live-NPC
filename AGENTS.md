# Dla agentów

**To repozytorium nie jest zakwalifikowane przez właściciela i `main` nie jest obecną implementacją.**
Ten plik istnieje po to, żeby ostrzeżenie dotarło do agenta, a nie tylko do człowieka czytającego
README na GitHubie: `AGENTS.md` wczytuje się samo przy starcie pracy w katalogu repozytorium,
README nie wczytuje się nigdy.

## Zanim cokolwiek tu zrobisz

1. **`main` to historyczne laboratorium transportu P0 z 5 IX 2026**, nie implementacja pięciu
   mieszkańców SPC.
2. **Czytaj od szkicu [PR #167](https://github.com/Jozzpoly/Llm-Live-NPC/pull/167)**
   (gałąź `maintenance/vendor-neutral-takeover-2026-11-10`): mapa repozytorium, wejście dla agentów
   i audyt gałęzi z 10 XI.
3. **Nie wdrażaj i nie promuj gałęzi badawczych tylko po to, żeby `main` wyglądał na aktualny.**
4. **Nie kasuj gałęzi.** Dla większości tej pracy gałąź jest jedyną kopią.
5. **Sekrety tylko w ustawieniach Cloudflare i GitHuba** — nigdy w kodzie, plikach, logach ani
   w odpowiedziach API. Kod może najwyżej powiedzieć, czy sekret jest ustawiony. To repozytorium
   ma dług konfiguracyjny po stronie dostawcy; porządkuje go właściciel, nie agent.

## Gdzie jest reszta ekosystemu

| Co | Adres |
| --- | --- |
| Jaskinia (nowa, pień decyzji) | https://github.com/Jozzpoly/Jaskinia |
| Jaskinia (stara, codzienne okno właściciela) | https://github.com/Jozzpoly/Jozz-Cave-Workbench |
| Medium | https://github.com/Jozzpoly/Shared-Work-Medium-Lab |
| Feniks Studio | https://github.com/Jozzpoly/Feniks-Studio |
| Coopege | https://github.com/Jozzpoly/Coopege |

Stan ekosystemu i to, co już zostało ustalone, prowadzi z Jaskini. **Zanim zaczniesz coś odkrywać
od nowa, sprawdź tam** — najczęstszy błąd w tym organizmie to odkrywanie po raz dziesiąty rzeczy
zapisanej miesiąc wcześniej.

*Założone 14 XI 2026 przez Opus Code. Tylko dokumentacja; żaden kod nie został ruszony.*
