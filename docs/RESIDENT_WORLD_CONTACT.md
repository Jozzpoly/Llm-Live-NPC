# Mira: kontakt ze światem i dalszy kierunek

10 września 2026. Projekt wykonawczy po ponownym odczytaniu intencji Ownera, inspekcji kodu, niezależnym przeglądzie i sprawdzeniu źródeł. Stan wdrożenia i dowody utrzymuje [bieżący checkpoint](FIRST_PRESENCE_CURRENT_STATE.md). Ten dokument wyjaśnia kierunek; nie zastępuje tamtego rejestru.

Najważniejsza korekta: sprawny wykonawca poleceń i przekonujący mieszkaniec to dwie różne zdolności. Potrzebujemy obu. Mira ma pozostawać w związku z sytuacją: czegoś się spodziewać, coś zauważyć, zrozumieć zmianę, mieć powód działania, próbować, odczuć skutek w granicach symulacji i zmienić dalsze zachowanie. Sam większy model, większy panel „brain”, więcej pamięci lub dokładniejsze widzenie tego związku nie tworzą.

## Co umykało w obecnym projekcie

| Obszar | Ustalony mechanizm / brak | Konsekwencja dla dalszej pracy |
| --- | --- | --- |
| Wzrok | Dotychczasowy `observe()` czytał dokładną tożsamość, etykietę i pozycję każdej jednostki w promieniu, niezależnie od kierunku patrzenia. | Oddzielić dostęp silnika do prawdy od tego, co dana postać może poznać. Widzenie musi umożliwiać także świadome zdobywanie informacji. |
| Ciało i uwaga | `facing` zależał od ruchu. Nie można było obrócić się w miejscu ani cofać, patrząc na rozmówcę. | Ograniczenie pola widzenia bez osobnego patrzenia psuje istniejące zachowanie. Pierwsza rzeczywista próba dostawy właśnie to ujawniła. |
| Nieobecność | Pamięć nadpisywała widoczne rekordy, ale sprawdzenie pustego miejsca nie zmieniało zapamiętanej lokalizacji. | „Nie widzę” i „sprawdziłam dawne miejsce” muszą mieć inne znaczenie. Żadne nie dowodzi nieistnienia obiektu. |
| Rozpoznawanie celu | Intencja wymagała znanego, dokładnego ID. | Nie dało się przyjąć prośby o przedmiot do znalezienia. Zamiar musi istnieć przed rozpoznaniem konkretnego obiektu. |
| Rozmowa | Panel dostarcza tekst prosto do umysłu, bez fizycznego zdarzenia wypowiedzi. | Tekst nie może niejawnie ujawniać lokalizacji nadawcy. Kontakt na odległość i wołanie w świecie wymagają rozróżnienia. |
| Skutki | Młotek, kubek i latarnia można tylko przenosić. | Deklarowane naprawianie, picie czy oświetlanie byłyby opowieścią bez działania. Własne życie potrzebuje użytecznych czynności i zmieniającego się świata. |
| Relacje | `heldBy` oznacza trzymanie, nie własność, pożyczkę ani zobowiązanie. | Upuszczenie koło człowieka nie rozstrzyga wszystkich znaczeń „oddaj”, „pożycz”, „zostaw dla niego”. |
| Czas i inni mieszkańcy | Każdy `LivingRuntime` sam wykonywał krok świata. | Proste dodanie drugiej instancji podwajałoby czas i ruch gracza. Prywatna pamięć nie wystarcza do wspólnej symulacji. |
| Asynchroniczne decyzje | Numer wiadomości chronił przed starą odpowiedzią na inną wiadomość, ale nie przed powtórzeniem już wykonanej dostawy. | Decyzje trzeba odnosić także do trwającego zamiaru, jego postępu i istotnych warunków. Nie unieważniać ich przy każdym ticku. |
| Czytelność | Kierunek postaci nie był pokazywany; gracz widzi mapę inaczej niż NPC. | Ruch, uwaga i reakcje muszą wyjaśniać zachowanie bez czytania technicznego panelu. |

Podstawa: `src/living/runtime.ts`, `src/living/provider.ts`, `worker/living-resident.ts`, `src/world/world.ts`, `src/world/types.ts`, `src/client/world-scene.ts`. Niezależny przegląd szczególnie podważył założenie, że poprawa zmysłów wystarczy przy zamknięciu celów do wcześniej widzianych ID.

## Jakie rozdzielenia są rzeczywiście potrzebne

**Świat ustala zdarzenia i fizyczne skutki.** Umysł postaci otrzymuje własne doświadczenia. Silnik może znać wszystkie pozycje, aby policzyć widoczność, dźwięk lub kolizję. To nie daje planerowi prawa czytać ukrytego położenia celu. W znanej, statycznej okolicy nawigacja może korzystać z autorskiej mapy. Po dodaniu zmiennych drzwi i przeszkód trzeba osobno rozwiązać wiedzę o zmianach: nowa ukryta przeszkoda nie może magicznie zmieniać planu NPC, zanim dotrze do niego informacja.

**Doświadczenie potrzebuje źródła i zakresu.** Własne zajęte ręce to wiedza o ciele; widziany kubek to obserwacja; słowa gracza to relacja; kierunek wołania to przybliżony sygnał. Domysł, że ktoś poszedł do domku, pozostaje domysłem. Widziany nowy posiadacz przedmiotu nie dowodzi, że Mira widziała samo przekazanie. Informacja o pustym miejscu dotyczy tylko rzeczywiście sprawdzonego miejsca i chwili.

**Zamiar i rozpoznanie celu mają osobny czas życia.** Prośba „przynieś czerwony kubek z domku” ustanawia poszukiwany opis i wskazówkę miejsca. Dopiero obserwacje dają kandydatów, a następnie pozwalają wybrać konkretny obiekt. Gdy pasują dwa, trzeba rozwiązać istotną niejednoznaczność. Dokładne wewnętrzne ID nadal dobrze służy sterowaniu i fizyce; nie musi być jedyną reprezentacją zamiaru. Pierwsza implementacja używa jawnych, postrzegalnych cech typu i koloru, bez zgadywania rzeczowników wyrażeniami regularnymi. To mały słownik, nie ogólne rozumienie dowolnych opisów.

**Ciało wykonuje znane działania, również gdy model odpowiada.** Ruch, omijanie przeszkód, skierowanie uwagi, podniesienie, dostarczenie i sprawdzenie kolejnego miejsca mają lokalną ciągłość. Wynik wraca do pamięci i zamiaru. Model wybiera znaczenie, cel, zmianę strategii lub potrzebę rozmowy. Ciągły potok zdań z modelu nie jest wymagany do ciągłego działania.

**Pamięć celu nie jest historią czatu.** Opis poszukiwanych rzeczy, już wykonane dostawy, sprawdzone miejsca i nierozwiązany problem muszą przetrwać wypadnięcie dawnych wiadomości z okna rozmowy. Późniejsza pamięć epizodów zachowuje istotne doświadczenia ze źródłem. Wniosek modelu nie staje się automatycznie obserwacją, a własna obietnica nie staje się wspomnieniem sukcesu. Zapisywanie wszystkiego do bazy wektorowej nie rozwiązuje tych zasad.

## Zmysły jako możliwości działania

Wzrok powinien zależeć od położenia, orientacji, przesłaniania i właściwości widocznego obiektu. Później także od oświetlenia i rozpoznawalności. Częściowo widoczny obiekt nie zawsze znika dlatego, że promień do jego środka dotyka ściany. Nie potrzebujemy od razu biologicznego modelu oka ani odczytywania pikseli przez LLM co klatkę. Potrzebujemy sensownej odpowiedzi na „co ona mogła stąd zauważyć” oraz możliwości podejścia, obrócenia się lub przyjrzenia.

Pierwszy adapter wprowadza kierunkowe widzenie, kilka próbek widoczności obiektu, wiedzę o własnym ciele i niesionym przedmiocie, utratę kontaktu oraz sprawdzenie ostatnio widzianego miejsca. Nadal rozpoznaje widoczny obiekt bezbłędnie i od razu. Nie symuluje jeszcze natężenia światła, uwagi selektywnej, pomyłek rozpoznania ani rozmytej lokalizacji wzrokowej. Dodanie losowych błędów bez zachowania, które potrafi je rozwiązać, pogorszyłoby postać.

Pierwszy słuch obejmuje **wołanie w świecie**. Zasięg zależy od odległości i przesłaniania; umysł dostaje osiem możliwych kierunków i dwa przedziały odległości. Znana osoba może zostać rozpoznana po głosie — na razie jest to jawne uproszczenie dla wcześniej poznanych aktorów. Sygnał nie nadpisuje wzrokowej pamięci dokładną pozycją. Nie ma jeszcze kroków, rozmów słyszanych przez świadków, materiałów tłumiących dźwięk ani propagacji przez przejścia.

Pisanie w panelu pozostaje wygodnym kontaktem na odległość. „Zawołaj Mirę” jest oddzielną fizyczną wskazówką. Następny pełny model komunikacji powinien obejmować adresata, lokalną wypowiedź, zrozumiałą treść, świadków i ewentualny kanał zdalny. Nie należy po cichu utożsamiać wszystkich wiadomości z głosem ani ujawniać położenia autora przez samo dostarczenie tekstu.

Czucie ciała zaczyna się od realnych ograniczeń: położenia, zajętych rąk, osiągniętego ruchu wobec zamierzonego, kontaktu i wyników prób. Późniejsze zmęczenie, temperatura czy ból mają sens dopiero wtedy, gdy zmieniają możliwości i wybory. Same paski potrzeb z losowo zmienianymi wartościami nie dadzą kontaktu ze światem. Obecny świat nadal nie rozstrzyga zderzeń między aktorami; to ważne przed tłumem, przepychaniem i wspólną pracą w przejściu.

Wspólna uwaga to kolejna brakująca możliwość: „ten tutaj”, wskazanie, spojrzenie na rozmówcę, pokazanie niesionej rzeczy. Wskaźnik myszy gracza nie może automatycznie stać się wiedzą NPC. Potrzebne jest zauważalne wskazanie i sprawdzenie, czy postać miała szansę je zinterpretować. Czytelny kierunek patrzenia wprowadzamy już teraz.

## Co powinno oznaczać własne życie

Mira potrzebuje czegoś, na czym jej zależy, co pozostaje istotne także po zakończeniu polecenia. Preferencja powinna wpływać na wybór, a czynność zmieniać sytuację. Proponowany następny cel produktu: **wspólnie przygotować miejsce przy stole przed wieczorem**. Przedmioty mają trafić na wybrane miejsca, latarnia faktycznie oświetlać, a pożyczone narzędzie mieć osobę, której trzeba je oddać. Zmiana światła lub brak narzędzia staje się powodem działania, przerwanie rozmową nie usuwa troski o dokończenie.

To kierunek do pierwszej spójnej sceny, nie zamrożona fabuła. Potrzeby powinny wygasać po zaspokojeniu; naprawienie problemu nie może uruchamiać nieskończonego cyklu „sprzątaj ponownie”. Resident może mieć własne priorytety, odmówić niemożliwej czynności, negocjować termin, pomylić się i sprostować. Wyłącznie szybszy i bardziej posłuszny kurier nadal nie spełni wizji.

Przy drugim mieszkańcu ważniejsze od mnożenia autonomicznych tekstów będą prywatne doświadczenia i realne spotkania: kto coś widział, kto tylko usłyszał, komu złożono obietnicę, kto używa rzeczy i kto czeka. Intencje innych są wnioskami, nie odczytem ich prywatnej pamięci. Rozpocząłbym od jednego przekazania lub pożyczki i rozbieżnej wiedzy dwóch osób. Nie od rozbudowanego systemu reputacji i symulacji całego miasta.

## Czas, reakcje i koszt

Jeden gospodarz symulacji zbiera decyzje na wspólnej migawce, wykonuje jeden krok świata i przekazuje rozstrzygnięte wyniki. Tę granicę już wprowadzono. Nie oznacza ona jeszcze poprawnego tłumu: pozostają kolizje aktorów, pierwszeństwo do zasobów, sprawiedliwość rozstrzygania i odrębne profile mieszkańców.

Planowana dalsza pętla poznawcza powinna budzić model przy istotnej zmianie: odkrytym kandydacie, konflikcie zamiaru, zakończeniu etapu, zmianie ważnego przekonania lub potrzebie rozmowy. Zdarzenia z tego samego momentu trzeba łączyć. Zwykła utrata widoczności obsłużona lokalnym szukaniem nie wymaga natychmiastowej nowej rozmowy z modelem. Budżet tła musi być oddzielony od priorytetowych wypowiedzi gracza; obecny limit sześciu zapytań na minutę nie jest projektem takiego podziału.

Aktualna implementacja **nadal wywołuje LLM przy wiadomości lub ponowieniu**, a doświadczenia przekazuje przy następnym takim wywołaniu. Nie ma jeszcze samodzielnego, zdarzeniowego podejmowania nowych celów przez model. To pozostaje najważniejszą kolejną luką po spójności wykonania. Więcej zdarzeń w panelu nie wolno opisywać jako już działającego autonomicznego namysłu.

Czas świata i czas oczekiwania na sieć są różne. Karta w tle lub zamknięcie przeglądarki nie oznacza odtworzenia godzin życia mieszkańców. Trwały zapis wymaga zgodnego stanu świata, pamięci i otwartych zobowiązań. Odpowiedź spóźniona względem znaczenia zadania może wymagać aktualizacji mimo zgodnego numeru wiadomości. Pierwsze osłony zapobiegają powtórzeniu dostawy zakończonej podczas odpowiedzi i wyzerowaniu identycznej kolekcji; ogólna walidacja zależności planu pozostaje do zrobienia.

## Sposób dalszej przebudowy

Zachowuję World, fizyczne rozstrzyganie działań, nawigację i scenę jako donor działających mechanizmów. Przebudowuję odpowiedzialności warstwy mieszkańca. Pełny restart nie usuwałby problemu kontaktu, a wyrzuciłby użyteczną geometrię i sprawdzone zachowanie. Living ma już osobny autorski specimen, choć mapa i wygląd pozostają podobne do wcześniejszej próby.

Pierwszy połączony krok obejmuje percepcję, patrzenie, szukanie, opis nieznanego przedmiotu, wiązanie celu po obserwacji oraz serię dostaw. Kolekcja to konkretny trwały cel z pamięcią postępu; **nie jest jeszcze dowolnym planerem sekwencji „zrób A, potem B, jeśli C”**. `LivingRuntime` po tej zmianie jest większy. Przed dodaniem ogólnego planowania należy wydzielić zarządzanie zamiarami i referencjami z wykonania, zachowując sprawdzony wspólny przepływ. Nie rozbudowywać bez końca przełącznika poleceń.

Następna implementacja powinna połączyć: użyteczny skutek w świecie, własny powód Miry, pamięć ważnego doświadczenia i zmianę planu wywołaną zdarzeniem. Dołączenie drugiego mieszkańca ma następnie sprawdzić rozbieżną wiedzę i współpracę. Mapa i grafika rozwijają się razem z tym: przejścia, osłony, użyteczne miejsca, czytelne niesienie i spojrzenie. Większa liczba dekoracji bez nowych sytuacji nie rozstrzygnie problemu.

## Co ma rozstrzygać, czy idziemy dobrze

- Dwie różne ukryte pozycje celu przy tej samej dostępnej historii nie zmieniają decyzji, dopóki nie pojawi się nowy sygnał. Taka para pozwala wykryć nieuprawnioną wiedzę.
- Przeniesienie widziane i niewidziane prowadzą do różnych przekonań i poszukiwań z konkretnego powodu.
- Nieznany wcześniej opis może zostać przyjęty; dwa zgodne opisy wymagają doprecyzowania, zamiast przypadkowego wyboru ID.
- Zniknięcie odbiorcy podczas dostawy zachowuje przedmiot i cel. Kontakt zostaje odzyskany przez rzeczywiste szukanie lub wskazówkę, a dostawa kończy się fizycznie.
- Seria dostaw nie pobiera ponownie dostarczonych obiektów. Skończenie przeglądu znanych miejsc daje uczciwy wynik zakresowy, nie zapewnienie o każdym obiekcie w całym świecie.
- Gdy gracz nie wydaje poleceń, późniejszy własny cel Miry powoduje zmianę z realnym skutkiem i potrafi się zakończyć. Tego obecna kolekcja i patrol jeszcze nie dowodzą.
- Dodanie bezczynnego mieszkańca nie przyspiesza czasu; jego odmienne doświadczenia mogą później zmienić jego zachowanie.

W zwykłej sesji obserwujemy liczbę potrzebnych ponagleń, ciągłość zamiaru, nieuzasadnione powtórki, odzyskiwanie kontaktu, rozbieżność słów i działań oraz koszt wywołań. Nie zastępujemy jakości liczebnością testów. Scenariusze powyżej sprawdzają granice, które już spowodowały problemy lub mogą zakwestionować przyjęty mechanizm.

## Co wnoszą źródła

[SayCan](https://say-can.github.io/) rozdziela językową przydatność działania od jego wykonalności w konkretnym otoczeniu. Dla nas jest to uzasadnienie kontraktu rzeczywiście dostępnych czynności; nie potrzeba kopiować treningu robotycznych funkcji wartości, gdy symulacja sama rozstrzyga fizyczne możliwości.

[Inner Monologue](https://proceedings.mlr.press/v205/huang23c.html) bada wykorzystanie informacji zwrotnej o sukcesie, scenie i interakcji do zmiany dalszego planowania. Wniosek projektowy: wynik wykonania i zmieniona sytuacja muszą wracać do wyboru dalszego działania. Sam opis planu przed rozpoczęciem nie wystarcza.

[Generative Agents](https://arxiv.org/html/2304.03442v2) łączy pamięć doświadczeń, refleksję i planowanie oraz indywidualną wiedzę o otoczeniu. Pokazuje też problemy z odtwarzaniem pamięci i dopowiadaniem faktów. Dla Miry to powód zachowania pochodzenia wiedzy i ostrożnego podsumowywania, a nie dowód, że sam rozbudowany prompt tworzy mieszkańca.

[Voyager](https://arxiv.org/html/2305.16291v2) wykorzystuje umiejętności i iteracyjne sprzężenie z wykonaniem. Przydatna jest kompozycja i poprawianie działania na podstawie efektów. Nie przenoszę z tego automatycznie generowania kodu przez NPC ani językowego ogłoszenia sukcesu w miejsce stanu World. Wnioski dla naszej gry są rekomendacjami na podstawie źródeł i kodu, nie wynikami tych prac uzyskanymi w naszym projekcie.
