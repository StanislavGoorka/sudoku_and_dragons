# Następny etap rozwoju gry — zadania 11–15

Plan z 2026-11-02. Zakres: rozwój gry, bez publikacji i wdrożeń na platformy.
Kolejność wynika z przeglądu generatora sudoku, botów, kampanii i zapisu postępu.

## 11. Rzeczywista trudność sudoku i przewidywalny balans

**Status: zrealizowane.** Generator v2, analizator technik, wersjonowanie zapisów i worker
zostały sprawdzone korpusem 1000 ziaren na poziom oraz testami regresji.
Szczegóły i świadome pozostawienie wspólnego wyzwania dnia na v1: [trudność sudoku](SUDOKU_DIFFICULTY.md).

**Problem:** generator zapewnia jedno rozwiązanie, ale poziom wyznacza głównie liczba cyfr
startowych (40/32/26). Nie ocenia technik potrzebnych człowiekowi do rozwiązania planszy.

**Zakres:**
- Analizator logiczny: pojedynczy kandydat, jedyne miejsce cyfry w jednostce, pary i eliminacje między jednostkami.
- Jawne kryteria poziomów: łatwe plansze rozwiązywalne podstawowymi technikami, trudniejsze wymagają kolejnych technik.
- Ograniczona liczba prób generowania, pomiar czasu i deterministyczny wariant awaryjny o zadeklarowanej trudności.
- Wersjonowanie generatora: zapisane walki i rozpoczęte wyzwania zachowują swoją planszę i zasady odtwarzania.
- Ponowne symulacje kampanii po zmianie rozkładu plansz; HP i tempo stroić na podstawie wyników.

**Gotowe, gdy:** zestaw co najmniej 1000 ziaren na poziom ma jedno rozwiązanie i poprawną klasyfikację;
to samo ziarno, poziom i wersja dają tę samą planszę; stare zapisy nadal działają;
generowanie nie blokuje interfejsu, a dotychczasowy budżet startowy pozostaje spełniony.

## 12. Pełny trening i praktyczne lekcje walki

**Status: zrealizowane.** Menu treningu obejmuje solo bez zegara, niezależny wybór siły bota
i trudności planszy oraz cztery praktyczne lekcje. Osobne zapisy pozwalają wznowić trening offline
bez zmiany kampanii i nagród. Szczegóły: [trening i lekcje](TRAINING.md).

**Problem:** jest samouczek pierwszej walki i trening z botem, ale poziom bota jest związany
z trudnością sudoku, a jego wybory korzystają z gotowego rozwiązania.

**Zakres:**
- Niezależny wybór trudności planszy i siły bota.
- Solo bez presji zegara oraz trening pojedynku z normalnymi zasadami tur.
- Cztery krótkie scenariusze: ręczne notatki, zamknięcie kwadratu i podwójny cios,
  zdobywanie dodatkowych ruchów w pojedynku, unikanie oddawania rywalowi gotowego kwadratu.
- Boty o kontrolowanym tempie i ograniczonym repertuarze technik logicznych z zadania 11.
- Powtarzanie lekcji z menu i osobny zapis ukończenia; trening nie wypłaca gwiazdek ani punktów rankingu.

**Gotowe, gdy:** wszystkie scenariusze działają offline i można je przerwać/wznowić;
łatwy bot daje czas na myślenie, mocniejszy podejmuje lepsze decyzje;
notatki pozostają ręczne, a zwykłe walki nie dostają automatycznych podpowiedzi.

## 13. Historia walk, powtórki i czytelna analiza wyniku

**Status: zrealizowane.** Historia obejmuje 30 zakończonych walk. Analiza pokazuje straty HP,
obrażenia z kwadratów, tempo solo i rekord. Powtórkę można przewijać krokami lub odtworzyć
w wybranym tempie. Luki w odzyskanych pojedynkach są oznaczane. Szczegóły: [historia walk](BATTLE_HISTORY.md).

**Problem:** ekran końcowy pokazuje podstawowe statystyki i nagrody, ale nie ma historii
pozwalającej prześledzić, dlaczego walka skończyła się konkretnym wynikiem.

**Zakres:**
- Ograniczona lokalna historia, np. ostatnie 30 walk, z rozróżnieniem kampanii, wyzwania i treningu.
- Zapis zdarzeń: poprawne ruchy, błędy, ciosy czasowe, zamknięcia jednostek i zmiany HP.
- Powtórka zakończonej walki: pauza, kroki i przyspieszenie; na początek solo, potem potwierdzone zdarzenia pojedynków.
- Podsumowanie: HP stracone na błędach i na czasie, obrażenia z zamkniętych kwadratów, tempo i rekord osobisty.
- Jawne oznaczenie niepełnej historii odzyskanego pojedynku; żadnego dopisywania nieznanych zdarzeń.

**Gotowe, gdy:** odtworzenie pełnego zapisu daje ten sam wynik i końcowe HP;
oglądanie powtórki nie zmienia postępu ani nie wypłaca nagród;
limit historii i usuwanie danych obejmują wszystkie nowe lokalne zapisy.

## 14. Cele długoterminowe i zawartość po kampanii

**Problem:** po ukończeniu 12 etapów wybór kolejnej walki wraca do ostatniego bossa.
Są osiągnięcia i wyzwanie dnia, ale brakuje osobnej ścieżki po zakończeniu kampanii.

**Zakres:**
- Ekran ukończenia kampanii z wyborem kolejnego celu.
- Mistrzostwo krain: widoczny postęp zbierania wszystkich gwiazdek i poprawiania rekordów.
- Osobna tablica z trzema zadaniami dziennymi i jednym tygodniowym; nie zastępuje rankingu wyzwania dnia.
- Cele oparte na umiejętnościach, np. wygrana bez błędu lub kilka zamknięć kwadratów, zamiast samej liczby uruchomień.
- Kosmetyczne odznaki/tytuły i ograniczone nagrody w istniejącej walucie; symulacja tempa zakupów w sklepie.
- Stabilne identyfikatory okresów i nagród, migracja postępu oraz deduplikacja przy scalaniu urządzeń.

**Gotowe, gdy:** gracz po finale ma jasno wskazany kolejny cel;
zadanie nie wypłaca drugi raz po restarcie lub synchronizacji;
przetestowano granice okresów i zmianę daty, a kosmetyki nie zwiększają siły w walce.

## 15. Ranking umiejętności PvP i sensowny dobór przeciwnika

**Problem:** są pojedynki online i ranking wyzwania dnia, ale brakuje osobnego rankingu
umiejętności w pojedynkach. Rozbudowę należy dopasować do rzeczywistej liczby aktywnych graczy.

**Zakres:**
- Osobna kolejka rankingowa, początkowa kalibracja i prosty ranking Elo z czytelnymi rangami.
- Dobór gracza o zbliżonej ocenie; kontrolowane rozszerzanie przedziału wraz z czasem oczekiwania.
- Jawny trening z botem przy braku przeciwnika; bot i prywatny pokój nie zmieniają rankingu.
- Ocena liczona wyłącznie z potwierdzonego wyniku na serwerze, raz na pojedynek.
- Obsługa poddania, rozłączenia i wznowienia oraz ograniczenie nabijania oceny powtarzanymi meczami.
- Ekran rangi, zmiany punktów po walce i tabela PvP odrębna od rankingu dziennego.
- Bez sezonowych resetów na pierwszym etapie; decyzja o sezonach dopiero po ocenie aktywności i długości kolejki.

**Gotowe, gdy:** testy równoległych zakończeń nie naliczają punktów podwójnie;
lokalna edycja postępu nie zmienia rangi; trening i pokoje prywatne nie wpływają na ranking;
mała liczba graczy nie powoduje oczekiwania bez końca.

## Kolejność i wspólne kryteria

11 → 12 → 13 → 14 → 15. Analizator z 11 zasila trening; historia z 13 ułatwia sprawdzanie
celów z 14 i potwierdzanie prezentacji wyników z 15. Zakres 15 zatwierdzić na podstawie aktywności PvP.

Każde zadanie: osobny commit lub spójna seria commitów, testy reguł i zapisu, kontrola migracji,
regresje telefonu 360×640 i 375×812, bez publikacji. Zachować obecny kierunek UI i istniejące grafiki
smoków, efekty i wygląd plansz. Zmiana poziomów sudoku nie oznacza zmiany grafiki planszy.
Nie zmieniać bazowej zasady obrażeń cyfry i mnożnika za kwadrat bez osobnej decyzji właściciela.
