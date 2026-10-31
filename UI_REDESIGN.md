# Interfejs: spokojniejszy, prostszy

UI korzysta z `uiTheme.ts`: neutralne ciemne tło, grafitowe powierzchnie, cienkie obrysy,
stonowana mięta dla głównej akcji i dyskretny niebieski dla gry online. Typografia systemowa,
bez konturów nagłówków. Kontrolki mają płaskie wypełnienia, małe promienie i krótkie przejścia alpha;
usunięto połysk, wysokie „ranty”, sprężynujące wejście menu i pulsujące oznaczenie mapy.

Zakres: menu, nawigacja i ikony, dialogi i pauza, formularze, sklep i segmenty, mapa, postępy,
ranking, lobby, paski HP oraz licznik. Plansza nadal używa swojego motywu. Klawiatura numeryczna
ma płaskie klawisze, ale zachowuje cyfry, kolory motywu i rozmiary celów dotyku.

Oryginalny `theme.ts` pozostaje źródłem dla plansz i grafiki. `BoardView`, `boardThemes`, `DragonView`,
pliki `art/` i `fx/` nie są zmieniane. Podglądy cyfr w sklepie jawnie używają oryginalnego fontu.
W `Scene` zmieniono wyłącznie obrys/promień karty; krajobrazy i wszystkie rysunki smoków są te same.
Karty menu i mapy mają neutralne tło interfejsu. Animacje i reguły ciosów pozostają w oryginalnych modułach.

Minimum 48 px dla przycisków i licznika gwiazdek. Jasny tekst na ciemnych polach, widoczny fokus
i kursor formularzy. Zachowano przewijanie długich okien, ręczne notatki i obsługę klawiatury.
Odświeżenie postępu nie zastępuje menu podczas przytrzymania przycisku — test obejmuje cały gest.

Podglądy sprawdzono przy 375×812 i 360×640; materiały sklepu są wygenerowane ponownie z działającej gry.
To sprawdzenie przeglądarkowe, nie sesja z graczami ani test na fizycznym telefonie.
