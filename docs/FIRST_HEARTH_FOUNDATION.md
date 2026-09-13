# First Hearth — fundament po pierwszym wspólnym playteście

Decyzja techniczna: 2026-09-13, uzupełniona po integracji. Status: **koordynacja ciągłości i nowy kontakt/UI są już zaimplementowane; szersze mechaniki świata poniżej pozostają kierunkiem, nie opisem gotowej wersji**.

## Aktualne rozstrzygnięcie po pracy wykonawczej

Nowszy feedback Ownera trafnie koryguje kolejność: skala już wykonanej pracy uzasadnia kolejny wspólny playtest przed dalszą dużą refoundacją. Zmieniliśmy semantykę koordynacji w istniejącym hoście, wykorzystując World, percepcję i wykonanie. Nie powstał osobny nowy framework umysłu. Oceniamy te granice po ich zachowaniu, a nie po tym, czy plik nosi dawną nazwę.

Gotowe: jawne continue/replace/stop/suspend/resume, jedno odłożone wykonanie z lokalnym checkpointem, zachowanie już dostarczonych elementów zbierania, komunikacja po faktycznym kontakcie, odrębny odbiór rozmowy i unieważnianie namysłu, ponowny osąd po zmianie etapu działania, odtwarzanie cytowanych prywatnych źródeł z kontekstu requestu, subjectId, automatyczne ponowienie po awarii oraz obserwacyjny rejestr request/response/admission/World. Bąbelki, Enter→pisanie→Enter→ruch i badawczy podgląd World/Miry/Janka są częścią tej samej sceny. Szczegóły i ograniczenia: [CONTINUITY_OWNER_BUILD.md](CONTINUITY_OWNER_BUILD.md).

**Nie dodajemy teraz całej listy sekcji 6 jako warunku wypuszczenia tej wersji.** Materialna praca przy stanowisku, drzwi, światło zmieniające percepcję, zapis/restore i bogatsza inicjatywa to kolejne hipotezy wykonawcze. Ta wersja ma najpierw pokazać, czy mieszkańcy przestają gubić swoje działania w zwykłej wspólnej sytuacji. Nie nazywamy tego dowodem wystarczająco bogatego życia.

Ten dokument prowadzi dalszą pracę po pierwszym realnym teście Miry i Janka. Zastępuje kolejność kampanii A–D z wcześniejszego `FOUNDATION_DIRECTION_PL.md` w workspace koordynującym. Bieżące wersje i publikacje zapisuje [FIRST_PRESENCE_CURRENT_STATE.md](FIRST_PRESENCE_CURRENT_STATE.md). Dawne audyty pozostają dowodami dotyczącymi swoich wersji.

## 1. Co naprawdę próbujemy uzyskać

Owner chce świata, w którego historii sam nie jest jedynym uczestnikiem. Mieszkaniec ma własną perspektywę, wcześniejsze doświadczenia, trwające zajęcia i skutki swoich działań. Rozmowa, lokalne umiejętności, planowanie i przyszłe mechanizmy uczenia mają współtworzyć tę ciągłość. Nie definiujemy jej przez liczbę requestów ani dzisiejszy format kontekstu modelu.

Pierwszy mały sygnał obecności pojawił się, kiedy Mira została, Janek poszedł z Jozzem, a ich miejsca i krótkie historie zaczęły się różnić. To wartościowy feedback Ownera oraz hipoteza do dalszych prób. Nie dowodzi, że samo rozdzielenie pozycji tworzy życie. Wymuszony rozrzut mieszkańców po mapie byłby równie powierzchowny jak wymuszone gadanie.

Autonomia nie oznacza bezwzględnego wykonywania poleceń. Mieszkaniec może odmówić, pomóc bez pytania, zmienić zdanie, źle zrozumieć sytuację albo odpoczywać. Ważna jest ciągłość jego perspektywy i następstw. Brak natychmiastowej odpowiedzi może być właściwym zachowaniem; cisza sama w sobie nie jest miarą jakości.

## 2. Odzyskany punkt odniesienia

- Lokalny źródłowy commit: `a5b8e5b9ce6c2e644fb834d57852e7e723411671`, baza `3f45138ba37a72a5b96ba33902c786a4ce861918`.
- Pełne drzewo: `408ebc028be967338dfdf44091ee633e0bea82b5`.
- Kanoniczna publikacja tego samego drzewa: `df0b06a9dba79b32037bc0b8926f411bd5e382e7`, [PR #123](https://github.com/Jozzpoly/Llm-Live-NPC/pull/123). Inny SHA wynika z metadanych publikacji przez GitHub, nie ze zmiany plików. Oryginalny lokalny commit zachowuje gałąź `archive/first-hearth-local-a5b8e5b`.
- [Ratunkowy PR #122](https://github.com/Jozzpoly/Llm-Live-NPC/pull/122), commit `0cc780a2e5cfe65cff70355028a4409aec3e8de1`, ma identyczny kod runtime. Różni go siedem plików testów/dokumentacji. Jest historycznym okazem realnego playtestu, nie drugą linią implementacji.
- Odczyt na powrót potwierdził open/draft/unmerged PR119, PR120 i PR122. PR123 utworzono jako draft. CI Check dla `df0b06a9` przeszło; Workers Builds potwierdziło preview `dddc8591`.

Pakiet Ownera z 13 września przeczytano warstwowo: pełny re-entry, START HERE i Brief, a z surowego dziennika chronologię playtestu, próby O5 oraz istotne połączenia z kodem. Nie było potrzeby ponawiać wszystkich dawnych lektur. Zgodność czterech hashy treści z manifestem została potwierdzona. Surowe wideo nie jest częścią ZIP-a; nie twierdzimy, że obejrzeliśmy oryginalne nagranie w tej rundzie.

W Briefie część przypadków opisano jako nieodtworzone, podczas gdy późniejsze O5 w surowym dzienniku opisuje próby wykonywalne. Rozstrzygnięcie oparto na własnych reprodukcjach, nie na wyborze wygodniejszej etykiety.

## 3. Co ustalono, a czego dowód nie obejmuje

Niezależny harness użył rzeczywistych klas z powyższego drzewa, uproszczonej geometrii i kontrolowanych odpowiedzi. Trzy grupy prób odtworzyły sześć mechanizmów. Przejście tych asercji oznacza potwierdzenie zachowania, również wadliwego, nie zaliczenie jakości produktu.

| Ustalenie | Dowód | Granica wniosku |
|---|---|---|
| Mowa skierowana do Miry unieważniała także wcześniejszą odpowiedź Janka; żaden request nie został od razu przerwany | Dwa umysły, jedna fizyczna wypowiedź, oba wyniki `stale`, oba sygnały abort nadal false | Samo usłyszenie nie utworzyło nowej sprawy. Przejęcie zadania wymaga dalszej decyzji modelu lub wykorzystania istniejącej sprawy |
| Wypowiedź obok planu podróży pojawia się przed ruchem | Mowa w ticku 1 przy pozycji (500,400), pierwszy ruch dopiero później | Dwa kolejne namysły mogą zrealizować „idź, potem powiedz”; brakuje trwałej lokalnej kompozycji tego zamiaru |
| Zakończenie drogi unieważniało plan, lecz nie nieaktualny opis działania | Po zakończeniu w ticku 147 przyjęto wypowiedź o niedotarciu i przekonanie o trwającej podróży | Nie upoważnia to do porównywania wszystkich przekonań z ukrytą prawdą World |
| Porzucenie sprawy z `plan:null` pozostawia wykonywaną drogę | Zajęcie trwało i ciało przeszło kolejne ok. 63 jednostki | Zamknięcie sprawy nie musi zawsze oznaczać nagły bezruch. Brakuje jawnej decyzji o kontynuacji, zakończeniu lub bezpiecznym przerwaniu metody |
| Odwołanie do doświadczenia może przeżyć usunięcie samego doświadczenia | Źródło `sense:4` usunięto podczas requestu, później przyjęto cytujące je przekonanie; następny kontekst był niepoprawny | To błąd integralności, niezależny od prawdziwości przekonania |
| Pojedynczy błąd modelu może zatrzymać dalsze namysły w cichym świecie | Ciało skończyło drogę; przez ponad 9001 kolejnych ticków nie było requestu; retry przywróciło pracę | Transportowa awaria nie jest decyzją mieszkańca o rezygnacji |

Miejsca źródłowe: `src/hearth/host.ts` — receive, trimExperiences, schedule, admit, commit, advance; `src/hearth/contracts.ts` — oddzielne speech/plan i walidacja źródeł. Dodatkowo potwierdzono statycznie utratę `subjectId` przy projekcji oraz synchroniczne wywoływanie obserwatorów po mutacji w `World.emitOccurrence`. Wyjątek obserwatora może wyjść z już wykonanej akcji i zatrzymać dostarczenie innym odbiorcom. Własny harness tej rundy nie odtwarzał ostatnich dwóch przypadków.

Osobna próba przeglądarkowa na prawdziwym endpointcie Luny zakończyła się po 10 rozpoczętych requestach, po ok. 23 sekundach. Zachowano siedem poprawnych odpowiedzi z 20 165 raportowanymi tokenami; wystąpiły też dwa HTTP 502, których treści capture nie zachował, oraz praca przerwana przy zamknięciu strony. To **częściowy wynik z błędami**, nie pełny model/gameplay PASS ani pomiar rozliczenia konta.

Dwa dodatkowe, osobne requesty użyły zachowanych kontekstów #2 i #8. Oba zwróciły HTTP 502 z komunikatem `Nie udało się odczytać namysłu mieszkańca.` Ten komunikat pochodzi z etapu ekstrakcji/walidacji odpowiedzi po odbiorze upstream JSON; nie dowodzi awarii kredytów ani transportu. Nie rozróżnia jeszcze nieukończonego outputu, kształtu odpowiedzi, odmowy i niepoprawnego odniesienia do prywatnego kontekstu. Nie znamy oryginalnego payloadu, a losowe ponowienie nie odtwarza wcześniejszej odpowiedzi. **Łącznie rozpoczęto 12 requestów projektu; tokeny znamy tylko z siedmiu poprawnie zachowanych odpowiedzi.** Pierwsza instrumentacja następnej wersji musi oddzielić status providera, ekstrakcję, walidację struktury, grounding i admission oraz zachować dostępną telemetrię również dla odrzuconych wyników.

W tym krótkim przebiegu request #4 zwrócił poprawne podążanie Janka za Jozzem. Wcześniej wróciło potwierdzenie Miry z requestu #3. Request #5 Janka zawierał już usłyszane potwierdzenie Miry, brak realizacji i następnie wybrał dostarczenie jej kubka. To mocne połączenie ruchu danych z reprodukcją unieważniania całej odpowiedzi. Brak pełnego zapisu admission w tej sesji pozostawia dokładny łańcuch jako silny wniosek, a nie bezpośrednio zarejestrowany fakt wewnętrznego hosta.

Widok działał na desktopie 1440×1000 i po zmianie rozmiaru na 390×844, bez pustej strony, overlayu i poziomego overflow; wybór mieszkańca działał. Mowa po Enterze pozostawiała fokus w textarea. Mały mobilny świat/panel i brak bąbelków nadal ograniczają doświadczenie. Nie były to pełne mobilne testy gry.

## 4. Własny wybór: ograniczona refoundacja koordynacji życia

**Zmieniono semantykę połączenia HearthHost + proposal + realization, zachowując użyteczne implementacje.** Decyzja obejmuje odpowiedzialność za zmianę zajęcia, stosowalność spóźnionego namysłu, lokalną kontynuację, źródła i przywracanie pracy po błędzie. Integracja pokazała, że na tę próbę wystarcza czytelna ewolucja istniejącego hosta. Dalsze zastąpienie go nową architekturą wymaga nowego dowodu.

Uzasadnieniem jest wspólna przyczyna kilku wad: informacja, interpretacja, pamięć, zmiana zajęcia i fizyczna wypowiedź mają obecnie niespójne zasady ciągłości. Kolejny opcode `say` lub mocniejsze polecenie w prompcie nie rozstrzyga, kto mówi, po jakim kontakcie, z jaką nadal aktualną intencją i co zrobi po zakłóceniu.

**Nie ma podstaw do wymiany całego World, renderera i transportu.** World ma już wartościowy model rzeczywistych skutków, percepcja prywatny odbiór, a ciało użyteczne szukanie i manipulację. Te elementy będą dawcami. Wykryte błędy ich granic trzeba naprawić podczas podłączania, ale zachować dowody i scenariusze.

Alternatywy pozostają jawne:

| Wariant | Ocena teraz | Co mogłoby zmienić decyzję |
|---|---|---|
| Naprawić aktualny host i rozbudować listę kroków | Może szybko usunąć kilka objawów; utrzymuje zbyt wiele ukrytych reguł zmiany życia | Jeśli prototyp następnej granicy okaże się większy, a nie daje lepszej ciągłości, wrócić do prostszego wykonania |
| Trwające lokalne zajęcia, mała koordynacja, elastyczny osąd modelu | Wybrana baza. Pozwala zmienić istotne reguły bez budowania całej teorii umysłu | Jeśli nawet proste zajęcia wymagają ogromnej liczby specjalnych wyjątków, podważyć reprezentację |
| Od razu ogólna architektura poznawcza, DSL planów, relacji i uczenia | Za mało dowodów do utrwalenia tylu decyzji naraz | Wprowadzać konkretny mechanizm dopiero, gdy wygrywa użyteczną próbę na tym samym świecie |

Nie zakładam, że większy lokalny selektor uwagi będzie lepszy od częstszego osądu Luny. Pierwsza wersja może opierać znaczną część interpretacji na modelu, jeśli zachowuje trwające działanie i właściwe przyjmowanie zmian. Porównanie ma rozstrzygnąć to przy użyciu tej samej sceny, zamiast ustanawiać doktrynę „LLM tylko od święta”.

## 5. Granice, które budujemy teraz

### Świat skutków i prywatny odbiór

Jedna symulacja rozstrzyga przemieszczenie, kontakt, posiadanie i skutki pracy. Model i kontroler proponują działania. Nie nadają sobie skutku przez opis.

Odbiór powstaje dla konkretnego mieszkańca, w konkretnej chwili i jego warunkach. Zachowuje rozpoznane źródło, przedmiot obserwacji, sposób pozyskania i czas. Nazwane miejsca i znane osoby pozostają jawnymi warunkami startowymi tych mieszkańców; światowa lista ID ani pełna mapa nie mają automatycznie stawać się wiedzą każdego przyszłego mieszkańca.

Debug otrzymuje odrębne informacje o prawdzie świata i dostarczeniu doświadczeń. ID łączące trace z globalnym zdarzeniem nie musi trafić do kontekstu modelu: luki w globalnym liczniku mogą ujawniać zdarzenia, których osoba nie odebrała. Dane mieszkańca mogą używać lokalnych identyfikatorów; korespondencję utrzymuje rejestr badawczy.

### Trwające zajęcie i kompetencje

Pierwsza implementacja utrzymuje jedno aktywne zajęcie i możliwość odłożenia go z zachowanym postępem. Jedno ciało może równocześnie iść, patrzeć i powiedzieć zdanie; nie oznacza to trzech konkurujących właścicieli ciała. Zdolności deklarują potrzebne zasoby i warunki bez narzucania przyszłego algorytmu sterowania.

Zajęcie ma cel/przyczynę, aktualny postęp, zależności, punkt wznowienia i sposób oddania kontroli. Przyjęcie nowej metody odnosi się do konkretnej wersji zajęcia. Obietnica, zamiar, wykonanie i jego ocena nie stają się jednym flagowym `done`. Zmiana sprawy musi określać dalszy los zajęcia; zatrzymanie może wymagać bezpiecznego odłożenia rzeczy lub dokończenia krótkiej czynności.

Pierwszą kompozycją społeczną będzie utrzymanie kontaktu: podejdź do znanej osoby lub szukaj jej z własnej wiedzy, spróbuj nawiązać kontakt, wypowiedz wiadomość w odpowiednim momencie, zachowaj to, co rzeczywiście usłyszysz. Wypowiedzenie nie dowodzi usłyszenia, zrozumienia ani zgody drugiej osoby. Zwykłe zdanie wypowiedziane od razu pozostaje dozwolone, ale też jest działaniem w świecie.

Parametryzowana umiejętność ruchowa może później przyjąć wzór względem poruszającej się osoby, ograniczenia i sposób zakończenia. Tor, kontakt i przeszkody rozwiązuje lokalnie. Nie budujemy teraz interpretera dowolnego kodu modelu ani nie nazywamy całego przyszłego zachowania skończoną listą sześciu akcji.

### Namysł w czasie, bez zamrażania osoby

Request jest epizodem opartym na prywatnym stanie z pewnej chwili. Zachowujemy jego wejście i źródła, wersję kontrolowanego zajęcia oraz wynik. Zdarzenia przychodzące w międzyczasie nie kasują domyślnie całego życia ani całego wyniku.

Przyjęcie propozycji rozdziela pamiętany wniosek od próby wykonania czynności teraz. Dla działania sprawdzamy znane lokalnie warunki stosowalności, tożsamość zajęcia i jego postęp. Gdy sytuacja społeczna jest niejasna, model dostaje aktualizację prywatnych danych do ponownego osądu. Nie udajemy, że dowolny tekst da się automatycznie i bezbłędnie sprawdzić za pomocą kilku hashy lub etykiet.

Nie należy odrzucać każdej dawnej myśli ani poprawiać jej przez World truth. Mira może nadal mylić się co do przedmiotu odłożonego za ścianą. Natomiast utrata aktualności własnego wykonywanego ruchu powinna być dostępna z ciała i postępu. To dwie różne sytuacje.

Słyszenie trafia najpierw do prywatnych doświadczeń. Zainteresowanie, przerwanie, podjęcie sprawy i odpowiedź są możliwymi dalszymi wyborami. Użycie imienia jest wskazówką, nie nieomylnym routerem ani prywatnym kanałem. Osoba może się wtrącić z istotnego powodu. Nie będzie musiała każdorazowo wygłaszać formalnego „przyjmuję odpowiedzialność”.

Pilne, lokalnie rozpoznane zdarzenie może przerwać namysł; zwykła cudza odpowiedź nie powinna automatycznie zabierać slotu i unieważniać sensownego działania. Awaria transportu ma własny retry/backoff oraz diagnostykę, osobne od decyzji mieszkańca. Błąd danych nie jest bez końca ponawiany jako błąd sieci.

### Historia i zmienność reprezentacji

Ograniczony prompt jest projekcją, a nie całą pamięcią. Źródła potrzebne aktywnym zajęciom, przekonaniom i requestom pozostają dostępne, nawet gdy wypadają z bieżącego okna. Zapomnienie/retrieval to wymienna polityka; urwany identyfikator nie jest modelem zapominania.

Pierwszy zapis obejmie świat, identyfikatory mieszkańców, ich nabyte prywatne dane i postęp zajęć. Aktywny request po odtworzeniu dostaje jawny stan przerwania, nie próbę wskrzeszenia Promise. Dane i moduły mają wersje. Migracja może zachować stary zapis oraz wznowić zajęcie ze znanego punktu, zamiast obiecywać bezstratne przywrócenie dowolnego przyszłego mechanizmu.

Zapis badawczy i pamięć mieszkańca mają różne dostępy i cele. Pełna historia badawcza nie staje się tajnym źródłem wiedzy mieszkańca. Nie musimy też kopiować każdego materialnego śladu w świecie do tekstowej autobiografii.

## 6. Następny ograniczony stan wykonania: wspólny dom, rozdzielne zajęcia

Najbliższym wynikiem dla Ownera ma być **jedna instrumentowana, możliwa do zamieszkania scena z dwiema osobami**, nie zestaw odbiorów nowych kontraktów. Podstawowy epizod: przychodzisz do domu, zastajesz mieszkańców przy swoich zajęciach, możesz dołączyć, przeszkodzić, porozmawiać, rozdzielić grupę i wrócić do czegoś wcześniej rozpoczętego.

Zakres tej sceny:

- Dom, podwórze i warsztat tworzą miejsca z rzeczywistymi różnicami dostępu, kontaktu i możliwości. Dalszy ogród/skład/polana pozostają kierunkiem poszerzenia, bez obowiązku wykończenia wszystkich sześciu miejsc przed pierwszą nową rzeczywistością.
- Dwie materialne sprawy przy różnych stanowiskach korzystają z jednej prostej mechaniki pracy: wymagany dostęp, narzędzie lub materiał, narastający postęp i trwały zmieniony stan obiektu. Przerwanie zachowuje postęp. Zasób może się skończyć lub znaleźć u kogoś innego. Przypadek dwóch mieszkańców potrzebujących tego samego narzędzia daje realny powód kontaktu; nie ma z góry narzuconej kolejności współpracy.
- Drzwi zmieniają przejście i odbiór. Przenośne światło zmienia warunki widzenia/pracy, jeśli ta integracja mieści się w tej samej spójnej wersji. Najpierw dowieść związku z działaniem, dopiero potem rytm całej doby. Nie dodawać osobnej lampowej rutyny.
- Zajęcia wynikają z konkretnych warunków startowych, preferencji i wcześniejszej aktywności zapisanej jako authored setup. Nie przedstawiamy zasianej intencji jako wyłonionej autonomii. Po zakończeniu pracy odpoczynek lub brak dalszego planu są uczciwe; nie generujemy nieskończonych usterek, by podtrzymać ruch.
- Towarzyszenie, podejście, odzyskanie kontaktu i przejście obok innej osoby korzystają z lokalnego sterowania. Testujemy przeszkadzanie przez gracza i wąskie przejście, zamiast zaliczać naturalność samym wykresem trasy. Ruch figuralny nadal jest osobnym dawcą do tej granicy, nie warunkiem postawienia nowego hosta.
- Mowa ma bąbelki przy słyszanych, prawidłowo zlokalizowanych osobach; anonimowy głos nie ujawnia pozycji ukrytego ciała. Enter otwiera rozmowę, drugi Enter wysyła i oddaje ruch. Log pozostaje pomocniczy.
- Widok badawczy przełącza World truth, perspektywę Miry i Janka, rzeczywisty odbiór, zajęcie, request oraz przyjęte/odrzucone skutki. Eksport zawiera wersję, czas symulacji i monotoniczny czas requestów. Nie ujawniamy ukrytego chain-of-thought.
- Zapis/odtworzenie pozwala kontynuować jedną niedokończoną sprawę oraz zachować różnicę wiedzy dwóch osób. Trzecia osoba jest wewnętrzną próbą zwykłego tworzenia mieszkańca, nie obowiązkiem zwiększenia liczby uczestników przed domknięciem N=2.

Implementacja idzie trzema połączonymi krokami wewnętrznymi:

1. **Nowa koordynacja z istniejącym ciałem.** Przenieść jeden sensowny zajęciowy przepływ i fizyczne mówienie do wersjonowanej granicy kontynuacji; od razu dołączyć prywatne źródła, recordery i prawdziwy transport. Nie budować osobno kompletnego nowego mózgu.
2. **Treść świata i kontakt.** Dodać mechanikę pracy, warunki miejsca oraz lokalne podejście/szukanie/odkładanie. Zmiana zamiaru ma rzeczywistą cenę i wynik; obserwator potrafi połączyć przyczynę ze skutkiem. UI Enter/bąbelki i podgląd perspektyw wchodzą tutaj, przed Owner playtestem.
3. **Zakłócenia i ciągłość.** Próby utraty kontaktu, zasłyszanej obcej rozmowy, opóźnienia/błędu modelu, konkurencji o przedmiot i odtworzenia. Potem zintegrowany przegląd na Lunie i publikacja jednej grywalnej wersji.

Jeżeli eksperyment w kroku 1 pokaże, że granica wymaga zabetonowania ogromnego języka workflow, wycofać tę reprezentację. Zachować mniejszy protokół zajęcia i częstszy namysł. Nie dopisywać kolejnych wyjątków dla jednej demonstracji.

## 7. Próby, które rozstrzygają kierunek

| Próba | Co obserwujemy | Co zmienia decyzję |
|---|---|---|
| Mira rozmawia, Janek ma własną pracę; potem Jozz prosi właśnie Janka | Faktyczny odbiór, powód skierowania uwagi, zachowanie dotychczasowego zajęcia | Poprawna odpowiedź nie może znikać tylko przez niepowiązane potwierdzenie innej osoby |
| „Idź do Miry i powiedz jej…”; Mira w międzyczasie odchodzi | Próba kontaktu, czas/miejsce mowy, odebrane słowa, dalszy los zamiaru | Sam dodatkowy opcode bez odporności na ruch i przerwanie nie uzasadnia nowej architektury |
| Jedna praca, dwa zasoby/przeszkody i dwie osoby | Rzeczywisty postęp, konflikt dostępu, możliwe formy pomocy | Brak świata dającego powody do decyzji oznacza zbyt ubogą scenę, nie potrzebę kolejnego promptu „bądź żywy” |
| 60 sekund bez dostępnego deliberative modelu | Co ciało, zajęcie i percepcja nadal robią; jak wraca namysł | Nie wymaga zastąpienia LLM lokalnym geniuszem; wykrywa request/response jako jedyny animator |
| Ukryta zmiana przedmiotu, następnie zapis i odtworzenie | Rozbieżne prywatne historie i ten sam fizyczny świat | Wygodne automatyczne wyrównanie wiedzy jest porażką |
| Rejestrator wyłączony lub zgłaszający błąd | Ten sam strumień działań daje te same skutki; diagnostyka jasno oznacza lukę | Debug nie może przejąć kontroli nad fizycznym wynikiem ani udawać pełnego zapisu |

Porównanie uwagi: najpierw cienka lokalna koordynacja + częsty osąd modelu; dopiero przy widocznej porażce dodać lokalne przewidywanie/selekcję i sprawdzić różnicę. W obu wariantach identyczne warunki świata, dostępna wiedza i zakłócenia. Oceniać użyteczną reakcję, nie surową liczbę odpowiedzi. Rejestrować wariant, provider, profil, opóźnienia, przyjęcia oraz nieznane zużycie. Jeden losowy przebieg nie ustala zwycięzcy.

Te próby służą implementacji i diagnozie. Owner nie otrzymuje listy mikrozaliczeń. Jego kolejny udział to zwykłe przeżywanie spójnej sceny; nagranie i eksport pomagają nam wyjaśnić odkrycia.

## 8. Dalszy horyzont oraz otwarte decyzje

Już teraz chronimy rozdzielenie faktów, nabytej wiedzy, decyzji i skutków; tożsamość i źródła ponad pojedynczym requestem; możliwą do sprawdzenia zmianę modułów. Nie gwarantujemy niezmiennej architektury.

Otwarte: pełny model pamięci i uczenia, relacji, norm społecznych, planowania wielowątkowego, poznawania affordancji, innych ciał i poziomów symulacji. Nie ustalamy dziś, że uwaga zawsze musi być lokalna, pamięć tekstowa, plan symbolicznym drzewem, a inteligencja podzielona na dokładnie dwa poziomy.

Przed udawaniem życia poza sesją trzeba jawnie rozstrzygnąć zegar i miejsce symulacji. Dzisiejszy World jest krokowany przez klienta przeglądarkowego; tło/uśpienie karty i zegar requestów nie są tym samym co nieprzerwane życie osady. Pierwszy restore wznawia zapisaną chwilę. Późniejsze przyspieszanie/offscreen evolution wymaga własnej polityki, a nie potajemnego przeskoku czasu.

Przy wielu mieszkańcach rozdzielamy uczciwość przydziału obliczeń od rozstrzygania konfliktów fizycznych. Stała kolejność aktorów jest dzisiejszym warunkiem symulacji, nie teorią społecznej dominacji. Mierzymy ją i zmieniamy, jeśli realny konflikt tego wymaga.

## 9. Ukierunkowane źródła pierwotne i granice zapożyczeń

- [SayCan](https://say-can.github.io/) łączy język z wykonywalnością umiejętności i pokazuje znaczenie sprzężenia z robotem. Bierzemy nacisk na wykonalność i feedback. Jego zadaniowy, pomocniczy cel oraz skończony zestaw umiejętności nie odpowiadają same w sobie ciągłemu życiu SPC.
- [Real-Time Action Chunking](https://www.pi.website/research/real_time_chunking) pokazuje, dlaczego nowy wynik musi uwzględniać działanie wykonane podczas inferencji. Wniosek dla First Hearth jest analogią: zachować ciągłość rozpoczętego działania przy zmianie decyzji. Nie przenosimy algorytmu diffusion/flow do JSON-owego planera ani nie traktujemy badań manipulacji jako dowodu jakości relacji mieszkańców.
- [Oficjalna karta Luny](https://developers.openai.com/api/docs/models/gpt-5.6-luna) potwierdza Responses, structured outputs i profil low używany przez transport. To nie ustala zdolności naszego mieszkańca, rzeczywistej latencji w konkretnej sesji ani darmowego rozliczenia konta. Te ostatnie kwestie wymagają pomiarów projektu.

Odczyt źródeł: 2026-09-13. Był to ukierunkowany przegląd pytań o wykonanie i opóźnienie, nie kompletny survey robotyki, ALife i architektur poznawczych.

## 10. Zasady dalszej współpracy

Owner jawnie powierzył Codexowi zwykłe techniczne zarządzanie repo i GitHubem: branche, PR-y, publikacje, CI, porządek i dokumentację. To trwałe ustalenie w obrębie First Hearth. Nie wracamy z pytaniem o każdą rutynową operację. Wyjątkiem pozostaje rzeczywisty wymóg systemu albo szczególna nieodwracalna/Owner decyzja.

Owner i Browser eksplorują wizję, przeżywają materiał i podważają wnioski. Codex prowadzi jedną linię integracji. Dodatkowy prototyp zaczyna od konkretnego SHA, deklaruje pliki i własne założenia, zachowuje źródła oraz nie podmienia produkcji lub sekretów przypadkiem. Dostarczenie raportu nie oznacza nakazu wdrożenia nazwanych w nim subsystemów.

Obecne WEB HOLD pozostaje w mocy: repo ma aktualny opis, ale w tej rundzie nie wysyłamy automatycznej wiadomości do rozmowy webowej. Samodzielna praca nie wymaga tworzenia nowych zadań Ownera, automatyzacji lub kredytu resetu.

Następny run zaczyna od krótkiej weryfikacji head/dirty/CI i bieżącego wyniku w `CONTINUITY_OWNER_BUILD.md` oraz `FIRST_PRESENCE_CURRENT_STATE.md`. Krok koordynacji i UI jest już wykonany. Najpierw wykorzystać nową rzeczywistość i jej dowody; nie odtwarzać publikacji ani całego audytu. Jeżeli nowe evidence podważy granicę, zmienić ją i zapisać dlaczego. Szerszy plan sekcji 6 pozostaje podważalnym horyzontem.
