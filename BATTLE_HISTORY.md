# Historia walk i powtórki — zadanie 13

W menu dotknij licznika gwiazdek, a następnie **Historia walk**. Zakończoną walkę możesz
też otworzyć bezpośrednio przyciskiem **Analiza walki**. Lista obejmuje 30 najnowszych wyników
i rozróżnia kampanię, wyzwanie dnia, zwykłe solo, trening solo, trening z botem oraz pojedynki online.

Analiza pokazuje końcowe HP, straty od błędów i ataków czasowych w solo, straty od ciosów
rywala w pojedynku i obrażenia z ruchów zamykających kwadraty. Pełne walki solo pokazują tempo
w poprawnych cyfrach na minutę. Rekord to najlepszy czas wygranej na etapie kampanii lub poziomie
trudności, zapisany w postępie gracza w chwili zakończenia walki. Trening nie aktualizuje rekordów.

Powtórkę można uruchomić, zatrzymać, cofnąć o ruch, przejść dalej lub zacząć od początku.
Tempo odtwarzania to 1×, 2× lub 4×. Długie przerwy między ruchami są skracane podczas odtwarzania;
podsumowanie korzysta z zapisanego czasu walki. Dla pojedynków jest to czas obserwacji, ponieważ
nie wszystkie potwierdzone ruchy zawierają osobny czas zdarzenia. Powtórka tylko odczytuje zapis
i nigdy nie uruchamia logiki nagród, kampanii ani rankingu.

## Kompletność zapisu

- Solo i bot przechowują dotychczasową powtórkę w swoim lokalnym zapisie wznowienia.
  Starszy zapis bez powtórki rozpoczyna się od wczytanej planszy i jest oznaczony jako częściowy.
- Online zapisuje kolejne wersje potwierdzone przez serwer. Przewidywania interfejsu nie trafiają
  do historii. Jeżeli wersje zostały pominięte, powtórka przechodzi do następnej znanej planszy
  i pokazuje komunikat o luce. Po restarcie nie da się odzyskać wcześniejszych ruchów z samego stanu
  pojedynku. Końcowe HP nadal pochodzą z potwierdzonego wyniku, a statystyki obejmują znane ruchy.
- Każda powtórka przechowuje zdarzenia i stany planszy oraz HP. Wersjonowany format nie wymaga
  ponownego generowania planszy ani ponownego oceniania ruchów według późniejszych zasad.
  Limit 192 zdarzeń obcina najstarszą część wyjątkowo długiego zapisu i oznacza ją jako niepełną.

Historia jest zapisana osobno na urządzeniu (`sudoku-dragons.history`). Nie zawiera nazw kont,
rozwiązania pustych pól ani notatek gracza i nie jest synchronizowana. Wylogowanie i usuwanie
danych w grze czyszczą historię wraz z aktywnymi zapisami. Uszkodzone wpisy są pomijane;
jeżeli zapis się nie powiedzie, bieżąca sesja nadal pokazuje historię z pamięci.

Testy sprawdzają zgodność wyniku, HP i planszy po powtórce, zachowanie zapisu po restarcie,
brak zmian w postępie, luki w potwierdzonych wersjach, duplikaty, limit i usuwanie danych.
Testy przeglądarkowe korzystają z układów 360×640 i 375×812.
