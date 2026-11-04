# Trening i lekcje — zadanie 12

Ekran **Trening i lekcje** jest dostępny bezpośrednio z menu. Przycisk treningu w lobby
również prowadzi do tego ekranu. Wszystkie tryby działają bez konta i połączenia z serwerem.

## Tryby

- **Solo:** łatwa, średnia lub trudna plansza generatora v2. Smok nie wykonuje ataków czasowych;
  błędne cyfry nadal kosztują HP. Zwykłe zasady obrażeń i zamykania kwadratów pozostają takie same.
- **Z botem:** niezależny wybór trudności planszy i siły przeciwnika. Zwykłe zasady pojedynku:
  30 sekund na turę, trzy ruchy, darmowe domknięcia jednostek, błędy i poddanie po trzecim
  kolejnym przekroczeniu czasu. Pauza dotyczy wyłącznie lokalnego treningu.
- **Lekcje:** cztery krótkie scenariusze, które można powtarzać w dowolnej kolejności.
  Każdy prowadzi przez konkretne ruchy i wyjaśnia ich wynik.

Trening nie zmienia gwiazdek, rekordów, osiągnięć, kampanii ani rankingów.
Nie zastępuje zapisu rozpoczętej zwykłej walki ani wyzwania dnia.

## Siła bota

| Bot | Techniki | Czas myślenia na cyfrę | Błędy | Wybór ruchu |
| --- | --- | --- | --- | --- |
| Spokojny | pojedynczy kandydat pola | 5,5–8,5 s | 8% | losowy z wywnioskowanych |
| Taktyczny | również jedyne miejsce cyfry w jednostce | 3,8–6 s | 3,5% | obrażenia, darmowe ruchy, ostrożność przy kwadratach |
| Ekspert | również eliminacje między jednostkami i nagie pary | 2,2–4,2 s | 1% | ten sam wybór taktyczny, szerszy repertuar |

Pierwsza cyfra nowej tury ma dodatkowe 0,9 s zwłoki. Bot widzi wyłącznie publiczne cyfry.
Nie otrzymuje rozwiązania ani ręcznych notatek gracza. Techniki pochodzą z analizatora zadania 11;
nie ma zgadywania ani awaryjnego odczytu odpowiedzi. Jeśli bot utknie, czeka na koniec zwykłej tury.
Dlatego Spokojny na trudnej planszy może często oddawać turę bez ruchu.

Rozwiązanie jest nadal dostępne lokalnemu sędziemu do sprawdzania poprawności, tak jak w solo.
Funkcja podejmująca decyzję bota nie przyjmuje go jako argumentu.

## Lekcje

1. **Ręczne notatki:** dodaj 2 i 7, usuń 2, przełącz tryb i wpisz cyfrę. Celowo ćwiczy obsługę,
   bez generowania poprawnych kandydatów. Zapełnienie pola czyści tylko jego własne notatki.
2. **Kwadrat ×2:** wpisanie 4 zamyka kwadrat i zadaje 8 obrażeń. Wiersz lub kolumna nie podwajają ciosu.
3. **Dodatkowy ruch:** zwykła cyfra zmniejsza liczbę ruchów z 3 do 2, a domknięcie wiersza zachowuje 2.
4. **Nie oddawaj kwadratu:** ostatni ruch tury pozwala porównać dwa wybory. Ryzykowna 2 zostawia
   przeciwnikowi zamknięcie kwadratu cyfrą 6 za 12 obrażeń; bezpieczna 9 kończy lekcję.

Obrażenia i tury wynikają ze zwykłych funkcji core. Nieudany wybór w ostatniej lekcji pokazuje
kontrę i umożliwia ponowną próbę; nie zalicza lekcji. Wskazówki są dostępne tylko na ekranie lekcji.

## Zapis i wznowienie

`sudoku-dragons.training` (z istniejącym sufiksem profilu testowego) przechowuje osobno:
ustawienia, jedną walkę solo, jeden pojedynek z botem, ruchy każdej lekcji oraz listę ukończeń.
Nowy trening tego samego typu wymaga potwierdzenia zastąpienia aktywnego zapisu.
Powtórzenie ukończonej lekcji zachowuje wcześniejsze zaliczenie.

Solo i bot zapisują planszę, ręczne notatki, tryb notatek i zaznaczenie. Bot zapisuje też HP,
turę, pozostałe ruchy i czas. Pauza, wyjście do centrum treningu i tło aplikacji zatrzymują
lokalny zegar; wznowienie po restarcie wymaga zamknięcia pauzy. Zegary PvP nadal działają normalnie.
Zapis bota korzysta z potwierdzonego stanu sędziego, bez utrwalania niepotwierdzonych przewidywań UI.

Lekcje odtwarza się z maksymalnie 512 zaakceptowanych działań, weryfikowanych ponownie przez
silnik scenariusza. Uszkodzony zapis danego trybu jest pomijany. Jeśli przeglądarka nie pozwala
zapisywać, sesja pozostaje w pamięci, a centrum treningu pokazuje ograniczenie. Te dane są lokalne,
bez synchronizacji w chmurze; wylogowanie i usunięcie danych czyszczą je razem z pozostałymi zapisami.

## Weryfikacja

- Testy core: poprawność wnioskowania bota, ograniczenia technik, decyzje taktyczne, pomyłki,
  ukończenie pojedynków oraz rzeczywiste wyniki wszystkich lekcji.
- Testy zapisu i backendu: wznowienie, uszkodzone dane, brak miejsca, usuwanie danych,
  zamrożenie zegara, utknięcie bota i opóźniony callback po końcu tury.
- Playwright: solo bez ataków czasowych, brak nagród za wygraną i przegraną, zachowanie zwykłej
  walki, niezależny poziom bota, pauza i restart oraz wszystkie cztery lekcje na 360×640 i 375×812.
- Przegląd zrzutów małego ekranu: menu, centrum treningu, lekcje, solo i pauza bota.
  Plansze, smoki i efekty wykorzystują istniejące widoki i grafikę.

Publikacja i buildy natywne pozostają poza zakresem zadania.
