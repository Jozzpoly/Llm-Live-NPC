# SPC — przygotowanie kampanii autonomicznego życia mieszkańców
**Status:** AGENT EXECUTION BOOTSTRAP; przygotowanie, **nie** kwalifikacja implementacji ani demo. 2026-10-09.
**Gałąź wejściowa:** `recovery/spc-post-stress-complementary-personhood-r6`, zweryfikowana przed przygotowaniem na `0ce79d45038f115719db0ac87c4226a4eba633d3` (przy nowym runie odświeżyć SHA i zmiany).
**Źródło nadrzędne:** `docs/SPC_POST_STRESS_RECOVERY_PROGRAM.md` (checkpoint Owner 2026-10-09), następnie `docs/SPC_R6_COMPLEMENTARY_PERSONHOOD_EXPERIMENT.md` §13. Ten plik uszczegóławia następną taktykę; nie zastępuje Owner truth.

## 0. Rzeczywisty cel / dowód negatywny
Mira, Janek, Ida, Oren i Nela mają być uczestnikami własnego życia w jednym, przyczynowo rzeczywistym świecie gry. Gracz może ich obserwować, przeszkadzać, oddalać się i wracać; oni mają zachowywać prywatną wiedzę, wypracowane sprawy, kompetencje, stosunki z innymi i konsekwencje bez gracza jako domyślnego inicjatora. Lokalne embodied intelligence działa ciągle; LLM ocenia trudniejsze znaczenia wtedy, gdy istnieje powód. Nie akceptujemy zastępstwa: chatbot+ciało, zadaniowe roboty/kurierzy, losowe patrole, promptowe personality, scripted demo, provider treadmill ani debug jako proteza gry. Przy braku istotnego powodu **spokój lub odmowa są pełnoprawnym zachowaniem**, nie porażką. Owner-observed FAIL pozostaje FAIL pomimo CI/Browser Evidence/transport PASS.

Historyczne falsyfikatory: Owner/browser FAIL 2026-09-07; Owner/stress FAIL 2026-09-18; Owner 2026-10-09 odrzucił osobny Cognitive Ecology Lab jako ślepą drogę względem żywych NPC. Nie importować tego labu jako architektury. Run #34 single-plan zrealizowany; oba warianty wybierają `relinquish_matter`; brak różnicy klas decyzji. Mechanizm R6 ma wartość diagnostyczną i donorskią, nie status żyjącego produktu.

## 1. Source-level diagnosis — konkretne wąskie gardła
1. **Puste życie nie jest równoważne bezpiecznemu życiu.** `five-resident-region.ts`: mapa 8192×8192, 5 residentów, 7 anchorów semantycznych, tylko *jeden* fizyczny obiekt: `crate.workshop.01`. `FIVE_RESIDENT_MATERIAL_FAMILIARITY`: jedynie Janek rozpoznaje ten obiekt. `MaterialObjectState` zna tożsamość/etykietę/promień/lokalizację, **nie** przyczynowe potrzeby, własność, trwałą pracę lub światowe znaczenie tego obiektu. Więcej takich obiektów samo w sobie nie tworzy sensownych interesów.
2. **Rozproszenie**: po pierwszych *authored* trasach najbliższa para ~851 przy promieniu wzroku 520 (to tylko ukończone trajektorie, nie dowód niemożliwości przyszłych kontaktów).
3. **Przerwa po otwarciu**: `FiveResidentCausalLifeRuntime` trwale przejmuje wykonanie po authored activity. Test provider-free dowodzi braku ruchu bez nowego matter; nie dowodzi, że live-provider run jest nieruchomy. `ResidentRuntime.completeActivity` generuje `activity_completed` pressure; to może wywołać pierwszą ocenę semantyczną, ale samo nie stanowi cyklu życiowego. Ukończenie kolejnych recovered runs celowo nie buduje nieskończonego echo-pressure.
4. **Brak bootstrapu osobistej sprawy** (centralna hipoteza do falsyfikacji): `FIVE_RESIDENT_LIFE_SELF` to authored `role + drives`, nie realny interest/obligation state. Provider wymaga bieżącego `originReasonId`, a pierwszy widok przedmiotu/aktora nie jest automatycznym powodem; przejście od stanu świata do własnego znaczenia mieszkańca jest niewykształcone. Nie wolno 'naprawiać' tego generowaniem stałych heartbeatów lub wymyślaniem problemów przez model.
5. **Wąskie ciało**: canonical R6 executor wykonuje tylko `travel_region`, `communicate_actor`, `acquire_material_object`. Worker w trybie `five-resident-causal-v1` zabrania aktualnie `investigate`, `follow`, exact-position travel mimo szerszego ogólnego kontraktu. Nie należy zakładać, że model może robić coś, czego runtime nie wykona.
6. **Pamięć bez życia**: R6 dokonał bounded history-sensitive decyzji, ale PR #149 wprowadza jedynie relevance dla kontaktu ważnego z powodu **wcześniej aktywnego** social matter; test ma ręcznie skonstruowane decyzje i test-provided proposal, bez naturalnej inicjatywy real-Luna. Ten most nie rozwiązuje punktu 4.
7. **Donory**: R1 `resident-local-material-delivery-routine.ts` umie pickup/carry/place. R4-D compact Mira/Ida trzyma przedmioty, prywatną obserwację i bounded local-contact reaction, ale jest scenariuszem z authored Ida action, nie autonomicznym początkiem historii. `src/living/runtime.ts` ma search/follow/fetch/drop, ale to inna, starsza semantyka. Import tylko po wykryciu realnie blokowanej kompetencji.

## 2. Wiodąca hipoteza i jej falsyfikacja
**Hipoteza:** aktualna kompozycja jest skuteczniejsza w kontroli legalności już istniejącego zamiaru niż w wytworzeniu **własnego powodu**, w którym prywatna historia + odczuwalna sytuacja świata prowadzą do nowego zainteresowania, działania, zaniechania i zmian po faktycznym wyniku.

Alternatywy, których nie wolno pominąć:
- przyczyna to wyłącznie izolacja przestrzenna — wtedy bez dodawania motywów zbliżenie fizyczne powinno wystarczyć do znaczącej **nieskryptowanej** interakcji;
- przyczyna to głównie brak realnych affordances — wtedy obecny resident+provider powinien spontanicznie zrobić coś znaczącego po dodaniu rzeczywistych możliwości, bez hand-authored commitment;
- przyczyna to wyłącznie słaby executor — wtedy poprawny resident-originated plan istnieje, lecz konkretny krok fizyczny jest niemożliwy;
- przyczyna to sama orkiestracja / in-flight admissions — wtedy życiowe decyzje powstają, ale giną na lokalnych granicach.
Nie przesądzać zwycięzcy na podstawie dokumentacji.

## 3. Pierwszy run następnej kampanii — konkretny protokół
**Faza A — baseline, zero real provider, bez "ulepszania" przed diagnozą:**
1. Potwierdź aktualny HEAD PR #148 i jego różnicę wobec tego checkpointu, aktualne statusy PR #149/#150, build/deploy oraz dokładną ścieżkę startową. `main` to nadal stary P0. `?spc=1` = badawcze `baseline-delivery`, NIE five-resident runtime. `?spc=1&scenario=unified-living` wymaga deploymentu z aktualną gałęzią; README preview `441dfa93...` jest zamrożonym wrześniowym FAIL `c181...`, NIE aktualnym R6.
2. Uruchom kontrolowany, odtwarzalny no-provider baseline na **prawdziwej five-resident composition**: zwykły World tick, bez ręcznie dołożonych matters i bez aranżowanych decyzji. Ustal rzeczywiste World-visible trajectory, prywatne perception/known facts, provenance aktywnych spraw, końce authored opening, pressure/admission, fizyczne konsekwencje i długą ciszę; metryki diagnostyczne nie stanowią wyniku produktu.
3. Oddziel *quiet-with-reason* od *stuck-without-reasons* i od *has-reason-but-no-executable-act*. Uruchom negatywną kontrolę odróżniającą ruch od życia: zmień wyłącznie gęstość spotkań, bez skryptowanych akcji. Nie pomyl zwiększonej liczby sight events ze sprawczością.

**Faza B — najwyżej jeden powiązany, game-world meaningful experiment, nie festival fixture’ów:**
4. Zdefiniuj niewielką, wiarygodną sytuację w *tym samym* authored World: co najmniej dwóch mieszkańców, fizyczna sprawa o odczuwalnym następstwie, prywatna/niepełna wiedza i realne możliwości decyzji, **w tym sensowna odmowa lub zaniechanie**. Może być authored **stan początkowy i sytuacja**, nigdy authored docelowe wybory, sztuczne wypowiedzi LLM przypisane sprawczemu mieszkańcowi ani zaprogramowana sekwencja sukcesu. Nie wracać do demonstratora „przenieś skrzynkę i powiedz zdanie”, jeśli sytuacja nie generuje nowego znaczenia dla życia.
5. Przetestuj izolacyjnie: (a) samo zbliżenie/spatial encounter; (b) same material/social affordances; (c) faktycznie powstała, niepodstawiona resident-owned significance + pamięć. Nie zwiększaj od razu wszystkich osi; zachowaj kontrolę i negative control. Jeśli potrzebny nowy World fact (np. consequence/ownership/usefulness), wdrażaj go dopiero gdy rozstrzygnie pytanie, a nie jako scenografię.
6. Dla wybranego sukcesu wykonaj ścieżkę: **private evidence → resident-specific relevance / own matter → voluntary choice or deliberate non-action → grounded action → World-factual afterstate → altered future response to later fact**. Zapisz pierwszy punkt, w którym ścieżka się nie domyka. Wzbogacaj miejscową kompetencję, nie zastępuj jej prośbami do LLM co krok.

**Faza C — real Luna dopiero kiedy mechanika i budżet są przygotowane:**
7. Przed jakimkolwiek płatnym soak: PR #150 jest tylko draft. Na HEAD #148 nie ma jego per-runtime limitu; nawet PR #150 `32 requests` to limit klientowej sesji, **nie** limit USD, tokenów ani serwera, reset przy odświeżeniu. Zweryfikuj realny request path, wyłączone auto-reload, egzekwowalny hard stop na warstwie kontrolującej dostęp, niską jawną liczbę wywołań dla microtestu i log kosztu. Bez spełnienia warunków **ZERO real upstream calls**. Nie popełniaj kolejnego wrześniowego runaway.
8. Gdy test rzeczywiście wymaga judgement, porównaj prawdziwą inferencję Luny ze świadomymi wariantami; rozdziel w raportach: live provider, local admission, World-visible consequence i final Owner judgement. Jeden fake provider w integracyjnym teście nie dowodzi niczego o generowanej intencji.
9. Dopiero po sensownej, naturalnej i weryfikowalnej scenie — world-only Owner playtest, także z możliwością obserwacji bez własnej ingerencji. Bez wcześniejszego „Owner-ready” claimu.

## 4. Sprzeczne wyniki i stop conditions
- Model pamięta przeszłość, ale nie zmienia zachowania: **memory uptake only**, nie life PASS.
- NPC spotykają się po kompresji sceny, lecz nic ich nie łączy: spatial bottleneck częściowo usunięty, **motive bootstrapping nadal FAIL**.
- Materiał przechodzi z A do B po authored decision: physical transport PASS, **autonomy UNPROVEN**.
- Provider proponuje legalne działanie, a executor nie potrafi go wykonać: capability gap (konkretnie nazwij brak), nie dowód słabej Luny.
- Provider wykonuje wiele calli bez nowych powodów lub efektów: przerwij/odetnij upstream, **homeostasis FAIL**.
- Naturalna cisza bez sensownej sprawy: nie twórz aktywności dla zielonej metryki.
- Headless PASS i world-only FAIL: **product FAIL**, nie poleruj debug HUD-a.
- Wspólny fundament R6 blokuje powstawanie własnego życia nawet po kontroli zewnętrznych przyczyn: dozwolona świadoma wymiana/przebudowa ograniczającego mechanizmu; nie traktuj dotychczasowych abstrakcji jako świętości.

## 5. Zarządzanie pracą
Przy `kontynuuj` sam odzyskaj cel i aktualne źródło prawdy, przejdź przez **A → B**, dobieraj serię logicznych falsyfikacji, implementuj potrzebne zmiany na świadomie wybranej gałęzi eksperymentalnej bez zmiany `main` i bez przypadkowego merge. Za każdym razem po większym kroku oceń efekt **w świecie**, a dopiero potem source/trace. Nie uruchamiaj pełnego płatnego stresu ani Owner demo, dopóki wynik nie jest naprawdę kandydatem do ręcznej oceny. Długie runy są pożądane, ale muszą kończyć się ukończonymi zapisami i jawnym checkpointem; nie ukrywaj utraty łączności lub nieukończonej pracy.

**Pierwszy ruch w następnym runie:** zweryfikuj latest HEAD i przeprowadź odtwarzalną diagnozę *origin of resident-owned reasons* w niezmienionym pięcioosobowym runtime. Zmiana kodu ma dopiero naprawić konkretną, zaobserwowaną przyczynę, nie wyprzedzać ją gotową architekturą.
