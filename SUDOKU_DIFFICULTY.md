# Trudność sudoku — generator v2

Nowa klasyfikacja opisuje techniki logiczne potrzebne do rozwiązania planszy, a nie tylko liczbę
odkrytych cyfr. Analizator nie zna rozwiązania i nie zgaduje. Nie jest systemem podpowiedzi gracza:
nie wypełnia ani nie skreśla ręcznych notatek w grze.

| Poziom | Kryterium |
| --- | --- |
| Łatwy | Cała plansza daje się rozwiązać przez wpisywanie jedynego kandydata pola. |
| Średni | Potrzebne jest również jedyne miejsce cyfry w wierszu, kolumnie lub kwadracie; same proste wpisy nie wystarczają. |
| Trudny | Same dwa podstawowe kroki nie wystarczają; analizator potrzebuje eliminacji między jednostkami (pointing/claiming) lub par nagich kandydatów. |

Plansza, której te techniki nie rozwiązują, pozostaje niesklasyfikowana i jest odrzucana przez
nowy generator. To jawna klasyfikacja w obsługiwanym zestawie technik, nie pełna skala trudności
wszystkich sudoku i nie pomiar indywidualnego czasu człowieka. Nie ma wyszukiwania rozwiązania
przez zgadywanie w analizatorze. Algorytm sprawdzający jednoznaczność nadal może używać przeszukiwania.

## Determinizm, limit prób i wariant awaryjny

`generatePuzzle(seed, difficulty, version)` ma teraz domyślną wersję 2. Ten sam zestaw trzech
argumentów daje tę samą planszę, rozwiązanie i metadane. Nie należy zmieniać algorytmu istniejącej
wersji w kolejnej aktualizacji; nowa reguła generowania wymaga nowego numeru.
Adres `?seed=123&difficulty=hard&generator=1` odtwarza v1; `generator=2` wybiera nową wersję.
Bez parametru wersji nowa walka używa v2. Ziarno 0 jest poprawnym ziarnem, nie losowym wyborem.

Wersja 2 sprawdza do 12 deterministycznie wybranych kandydatów generowanych algorytmem v1.
Przyjmuje tylko jednoznaczne plansze, które analizator rozwiązuje i przypisuje do żądanego poziomu.
Gęstość 40/32/26 jest celem generatora usuwającego cyfry, nie obietnicą poziomu trudności ani
bezwzględną liczbą cyfr: zachowanie jednoznaczności może zatrzymać usuwanie wcześniej.
Menu pokazuje nazwę poziomu, zamiast deklarować stałą liczbę cyfr każdej planszy.

Po wyczerpaniu prób używany jest `puzzleBank.ts`: po osiem własnych plansz wzorcowych na poziom,
uzyskanych z generatora v1 i sprawdzonych pod kątem rozwiązania oraz logicznej trudności.
Wariant zależy od ziarna, permutacji cyfr, transpozycji i odbić. Wynik jest ponownie klasyfikowany;
nie ma cichego zastępowania trudnej planszy łatwiejszą. Metadane `generation` podają liczbę prób
oraz użycie wariantu awaryjnego. Zmiany banku także wymagają nowej wersji generatora.

## Wersje zapisu i zgodność z serwerem

- Brak `puzzle.generatorVersion` w starym zapisie oznacza v1. Plansza jest odtwarzana dokładnie
  zamrożonym algorytmem `legacyGenerator.ts`, bez przejścia na aktualną wersję.
- Nowe zapisy v2 przechowują planszę i rozwiązanie. Odczyt sprawdza poprawność sudoku,
  jednoznaczność, logiczną klasę i stan walki; nie uruchamia od nowa 12 prób generowania na starcie.
  Jest to walidacja lokalnego checkpointu, a nie zabezpieczenie przed celową edycją lokalnego postępu.
- Kampania, zwykłe solo i trening z botem wybierają v2. Przykładowa plansza sklepu pozostaje v1,
  więc podgląd kosmetyków i oryginalna grafika nie zmieniają się.
- Wspólne wyzwanie dnia (ranking i wariant offline) pozostaje jawnie na v1, tak samo jak
  działający protokół serwera (`RANKED_DAILY_GENERATOR_VERSION`). Zmiana samego klienta nie może
  zmienić planszy UTC lub unieważnić rozpoczętej próby. Przejście rankingu na v2 wymaga osobnego,
  skoordynowanego wersjonowania protokołu; nie wdrażamy go przez zmianę domyślnej funkcji.
- Istniejący pojedynek online przechowuje własną planszę i rozwiązanie na serwerze, więc nie
  jest regenerowany po zmianie klienta. Kod tworzenia nowych pojedynków użyje v2 po przyszłym
  wdrożeniu wspólnego core; ten etap nie publikuje funkcji ani aplikacji.

## Responsywność

Nowa walka i rewanż z botem korzystają z Web Workera. Szukanie jednoznacznego sudoku i ocena
kandydatów odbywają się poza wątkiem interfejsu. Worker jest kończony po wyniku, błędzie,
anulowaniu przygotowania walki lub po 15 s. Błąd pokazuje ponowienie; spóźniona odpowiedź nie otwiera
anulowanej walki. Odczyt zapisu sprawdza już zapisaną planszę, zamiast jej ponownego wyszukiwania.

## Powtarzalna kontrola

- `npm test`: zawiera 1000 ziaren na każdy poziom, dodatkowo 1000 wymuszonych wariantów awaryjnych
  na poziom, niezależne sprawdzenie dedukcji oraz wzorcowe plansze v1 i migracje checkpointów.
- `npm run puzzles:check`: korpus 1000 ziaren na poziom, poprawność, jednoznaczność, częstość
  wariantu awaryjnego, rozkład liczby cyfr i czas generowania (mediana, p95, maksimum).
- `npm run sim:campaign -- --version=1` oraz `--version=2`: porównanie wszystkich 12 etapów
  na tych samych 80 ziarnach i czterech tempach. `sim:hp` i `sim:timer` też przyjmują `--version=1|2`.
- Testy przeglądarkowe obejmują worker, anulowanie, błąd i ponowienie, restart, ranking v1 oraz
  trening i rewanż. Dotychczasowy budżet startu pozostaje obowiązujący.

Symulacje z 2026-11-02 nie uzasadniają zmiany HP ani liczników ataków. Mediany HP bossów przy
10 s/cyfrę wynoszą w obu wersjach 25/11/0; przy 8 s/cyfrę 30/23/15. Na ostatnim bossie przy
10 s/cyfrę porażki zmieniły się z 55/80 na 58/80. To model jednakowego tempa, nie badanie ludzi:
nowe klasy opisują wymagane techniki, ale nie dowodzą takiego samego tempa rozwiązywania.
Zachowano reguły obrażeń, odpychania i wszystkie parametry przeciwników.

Lokalny pomiar 1000 ziaren na poziom (Node 24.18.1; w tle trwał także build, więc czasy są orientacyjne):

| Poziom | Mediana / p95 / maksimum generowania | Wariant awaryjny | Liczba cyfr startowych |
| --- | --- | --- | --- |
| Łatwy | 0,68 / 1,43 / 9,10 ms | 0/1000 | 40 |
| Średni | 1,93 / 6,97 / 61,37 ms | 1/1000 | 32 |
| Trudny | 23,48 / 96,61 / 320,32 ms | 223/1000 | 26: 986 plansz, 27: 11, 28: 3 |

Na każdym poziomie wszystkie 1000 plansz były różne, jednoznaczne i zgodne z klasą logiczną.
Przy wymuszeniu wariantu awaryjnego osobny korpus 1000 ziaren na poziom również przeszedł walidację.
Nie są to pomiary wydajności fizycznego telefonu. Pozostawienie obliczeń w workerze jest istotne
szczególnie dla trudnych plansz; limit 12 prób nie oznacza limitu 12 ms.

Końcowa weryfikacja: 312 testów jednostkowych w 35 plikach, 27 testów przeglądarkowych,
typecheck (także core bez DOM), build i spakowanie wspólnego core funkcji. Budżet startu:
209 053 B gzip JavaScript, poniżej 225 000 B. Osobny test produkcyjnego buildu sprawdził
menu, zgodność wyniku z zbudowanego workera z core i start trudnej walki z URL.
Vitest używa najwyżej dwóch równoległych workerów: nowy korpus jest obliczeniowo cięższy
od poprzednich testów i nie powinien konkurować z kilkudziesięcioma procesami naraz.
