# First Hearth — ciągłość we wspólnej scenie

> **HISTORICAL BUILD NOTICE (2026-09-25):** This describes the 13 September First Hearth / PR #123 Owner build. It is not the current playable candidate, branch, or project-state source. Preserve it as product/evidence history; begin current work from `README.md` and `docs/SPC_POST_STRESS_RECOVERY_PROGRAM.md`.

Wersja rozwijana 13 września 2026, na kanonicznym checkpointcie `df0b06a9` / źródłowym `a5b8e5b`. Publikację, dokładny head i aktualny wynik rzeczywistej Luny dokumentuje [PR #123](https://github.com/Jozzpoly/Llm-Live-NPC/pull/123). To kolejna grywalna wersja do zwykłego przebywania z Mirą i Jankiem, przed dalszym poszerzaniem świata.

## Co zmienia się w działaniu

- Zasłyszana wypowiedź zostaje prywatnym doświadczeniem i powodem przeglądu. Nie kasuje automatycznie poprawnej odpowiedzi, nad którą mieszkaniec właśnie pracował. Jawna wskazówka zwrócenia się do niego może przerwać request, ale nie przypisuje mu zadania.
- Zmiana działającej metody wymaga własnej decyzji: kontynuować, zastąpić, zakończyć, odłożyć albo wznowić. Jeden odłożony sposób zachowuje numer kroku, upływ czasu aktywnego wykonania oraz lokalny postęp zbierania i fazę niesienia przedmiotu. Przy wznowieniu droga i kontakt są zdobywane na nowo; pozycje ani rzeczy nie cofają się do checkpointu.
- `communicate` łączy szukanie znanego odbiorcy, dojście i wypowiedzenie wiadomości w jednym lokalnym zamiarze. Mowa pada dopiero przy aktualnie widzianej osobie w odległości do 80 jednostek. To nie jest prywatny kanał: inni nadal mogą ją usłyszeć zgodnie z fizycznym odbiorem. Skutek nie oznacza zrozumienia ani zgody odbiorcy.
- Namysł odnoszący się do poprzedniego etapu zakończonego w międzyczasie działania zostaje zachowany w rejestrze i skierowany do ponownego rozważenia. Host nie przyjmuje obok odrzuconego planu jego nieaktualnego opisu własnego działania. Nie porównuje dowolnych przekonań z ukrytą prawdą świata.
- Gdy model cytuje wcześniejsze własne doświadczenie usunięte już z okna roboczego, źródło jest odtwarzane z niezmiennego prywatnego kontekstu tego requestu. Zachowujemy zarówno rozpoznane źródło, jak i przedmiot obserwacji (`subjectId`).
- Po przejściowym błędzie następuje ponowienie z rosnącym odstępem, a lokalne wykonanie trwa. Błędny obserwator nie odwraca już wykonanej czynności ani nie odbiera zdarzenia pozostałym obserwatorom; luka zostaje zgłoszona w eksporcie.

## Zwykły kontakt i obserwacja

Enter otwiera pole mowy. Kolejny Enter wysyła i natychmiast oddaje ruch; Shift+Enter dodaje wiersz, Escape wychodzi bez wysłania. Bąbelki to faktycznie usłyszana mowa przy aktualnie widzianej osobie. Pełny tekst pozostaje w pomocniczym panelu „Usłyszane”. Głos spoza wzroku nie dostaje znacznika z ukrytą pozycją.

„Badania / God” daje wybór mieszkańca oraz widok jego wiedzy albo świata fizycznego. Widać aktualne i zapamiętane obserwacje, sprawdzone puste miejsca, zasięg/stożek wzroku, sprawy, przekonania, oczekujący namysł i zachowany przebieg decyzji. Podgląd nie steruje mieszkańcem i nie wprowadza informacji do jego kontekstu.

Eksport JSON zawiera kopię stanu świata, oddzielne prywatne konteksty i zachowany rejestr. Rejestr obejmuje nabyte doświadczenia, próbę namysłu z osobnym ID i czasem, wynik i dostępną telemetrię, decyzję przyjęcia, kolejne kroki i zdarzenia fizyczne. Nie zawiera ukrytego rozumowania modelu. To bieżący zapis diagnostyczny, nie zapis gry do odtworzenia. Adres modułu klienta/preview wiąże go z badaną wersją; nie fabrykujemy SHA buildu w kodzie.

## Dowody i ich zakres

- Kontrolowane próby prawdziwych klas obejmują podążanie podczas obcej odpowiedzi, jawne zmiany wykonania, odłożenie/wznowienie z czasem i kolekcją, wiadomość dopiero po dojściu, dawny opis zakończonej podróży, obrót okna źródeł, samoczynny powrót po awarii, zamknięcie sprawy i wadliwego obserwatora.
- Przeglądarka z kontrolowanymi odpowiedziami HTTP: desktop 1440×1000 i wąski ekran 390×844, rzeczywisty World/host/ciała. Mira dostarcza dwa różne kubki, Janek zachowuje podążanie, gracz rusza po Enterze, Shift+Enter/Escape działają, perspektywy i eksport są dostępne. Po oględzinach poprawiono skalowanie canvasa; obrazy sprawdzono ponownie. Wąski ekran używał klawiatury Playwright, więc nie jest to pełny odbiór sterowania dotykowego.
- Worker i klient osobno sprawdzają przerwanie, timeout, rozmiar, ścisłą strukturę i prywatne źródła. Diagnostyka odróżnia błąd upstream, nieukończony output, odmowę, ekstrakcję, JSON i walidację propozycji. Odrzucony output zachowuje dostępną telemetrię. Dokładna historyczna przyczyna 502 starej wersji nadal nie jest znana.
- Aktualne wyniki CI i rzeczywistej Luny są w PR oraz checkpointcie workspace. Nie należy utożsamiać kontrolowanego przebiegu z wyborem poprawnego zamiaru przez model ani z Owner feel.

Artefakty pracy poza repo: `pilot/living-npc/reentry-2026-09-13/continuity-browser-results.json`, `continuity-*-initial/moved/final.json`, obrazy i wykonywalny harness. Wcześniejsze `live-reentry-results.json` dotyczy starego `df0b06a9`, nie tej wersji.

## Świadome ograniczenia i następny kierunek

Świat wciąż ma mało rzeczywistych mechanik. Nie ma jeszcze pracy zmieniającej materiał, gospodarki potrzeb, trwałego zapisu mieszkańców, życia poza aktywną kartą ani modelu relacji. Lokalny ruch i pozyskiwanie wiedzy nadal korzystają z wcześniejszego donora. Ta wersja daje silniejszą ciągłość i lepszy sposób obserwacji, a nie pełną realizację docelowego SPC.

Koordynacja pozostaje eksperymentalna: jedno aktywne i jedno odłożone wykonanie, maksymalnie 12 kroków, ograniczone okno pamięci i 1024 wpisy rejestru. Heurystyka zwrócenia się po imieniu obsługuje obecne imiona i wybrane formy polskie; jest widoczną wskazówką uwagi, nie uniwersalnym parserem intencji. Zmiana etapu podczas namysłu powoduje konserwatywne ponowienie całego osądu. Wywołania nadal mają opóźnienie, a ich błąd lub anulowanie nie oznacza zerowego kosztu.

Zamknięcie jedynej sprawy aktywnego wykonania wstrzymuje tę metodę, zachowując fizyczny stan. Bardziej złożone bezpieczne zakończenie i równoległe zasoby ciała będą wymagały dalszych dowodów. Obecny checkpoint lokalnego ciała nie jest obietnicą zgodności przyszłych formatów zapisu.

Następny Owner wkład to zwykłe życie i zakłócenia w tej scenie, bez listy mikroodbiorów. Dalsza realizacja powinna dać mieszkańcom więcej realnych możliwości i powodów: ograniczoną materialną pracę z postępem i wspólnym zasobem oraz historię, do której można wrócić. Szersze burzenie fundamentu wymaga nowego evidence z tego, co już działa.
