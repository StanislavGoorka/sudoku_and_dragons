# Interfejs: przygodowe RPG

Kierunek zatwierdzony przez właściciela: granat i ciepłe złoto, bardziej growy charakter,
spokojniejszy niż pierwotne fioletowo-żółte UI. `uiTheme.ts` definiuje paletę interfejsu.
Dwuwierszowy tytuł i nagłówki korzystają z kroju szeryfowego Georgia / systemowego serif,
a opisy i kontrolki z czytelnego kroju systemowego. Bez nowych fontów pobieranych z sieci.

Przyciski mają płytki rant, delikatny gradient i fizyczne przesunięcie o 2 px przy naciśnięciu.
Panele mają cienką podwójną ramkę i krótkie złote akcenty. Tło jest granatowe z dyskretnym
wzorem. Menu i mapa ponownie pokazują istniejące krajobrazy; ich grafika nie była edytowana.
Dialogi, formularze, sklep, mapa, osiągnięcia i HUD używają tej samej palety.

## Assety Kenney

Oryginały z udostępnionej paczki są w `assets/vendor/kenney-game-icons/white-2x`,
licencja CC0 i podgląd obok. Kopia zawiera 105 białych ikon 2× do dalszej pracy.
Atlas zawiera 16 wybranych ikon: nawigację, profil, sklep, ustawienia, dźwięk, tryby gry,
gwiazdki i medal. Symbole ołówka, blokady i gwiazdek wynikowych zachowują istniejący
rysunek wektorowy. Znaczenie ikony sklepu zmieniło się z palety na koszyk.

`npm run icons:ui` przygotowuje atlas `assets/ui/kenney-icons.png` z kopii w repozytorium.
Katalog źródłowy Downloads nie jest już potrzebny. Atlas ma 7,7 kB; do produkcyjnego buildu
trafia tylko używany atlas, a nie 105 osobnych oryginałów. Dekoduje się raz przed menu,
a współdzielone tekstury pozostają dostępne po zmianie ekranu. Błąd pobierania daje widoczny
przycisk ponowienia startu. Test przeglądarkowy obejmuje ten błąd i późniejszą nawigację.

## Granice zmian i sprawdzenie

`theme.ts`, `BoardView`, `boardThemes`, `DragonView`, pliki `art/` i `fx/` pozostają bez zmian.
Krajobrazy w `Scene` również nie są modyfikowane. Klawiatura numeryczna zachowuje oryginalne
kolory, cyfry, geometrię i font. Zasady gry i synchronizacja nie należą do redesignu.

Cele dotyku mają minimum 48 px. Zachowano przewijanie długich okien, ręczne notatki,
obsługę klawiatury oraz ochronę menu przed przebudową podczas trzymania przycisku.
Podglądy i testy obejmują 375×812 oraz 360×640; materiały sklepowe pochodzą z działającej gry.
Są to testy przeglądarkowe, bez sesji z graczami i bez testu na fizycznym telefonie.

Weryfikacja tej wersji: 294 testy jednostkowe, 23 przeglądarkowe, typecheck i build.
Pomiar startu: 206 171 B gzip JavaScript, poniżej budżetu 225 000 B (trzy próbki).
Porównanie tego samego fragmentu planszy z poprzednim buildem: 0 różniących się kanałów
na 2 834 352, czyli plansza na zrzucie pozostaje identyczna piksel w piksel.
