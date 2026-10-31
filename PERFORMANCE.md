# Start aplikacji i zasoby

Menu jest częścią startową. Walka solo, pojedynek, lobby, mapa, sklep, konto i postępy są ładowane na
żądanie. Import tworzy ekran dopiero po sprawdzeniu bieżącej nawigacji. Cofnięcie lub wybranie innego
ekranu unieważnia poprzednie pobranie. Wolne pobieranie pokazuje komunikat i powrót do menu, a błąd
oferuje ponowienie. Błąd pobrania/uruchomienia głównego modułu ma też widoczny przycisk ponownego startu.

Konto, synchronizacja chmury i odzyskiwanie pojedynku startują po pierwszej okazji do wyświetlenia
menu i dwóch kolejnych okazjach do malowania. Samo zamontowanie canvasa i znacznik gotowości mogą
trafić do tej samej klatki; dodatkowe klatki chronią pierwszy widoczny obraz także na wolnym rendererze CI.
Nie czekają na wielosekundowy idle timeout; wejście do lobby lub konta ładuje je od razu.
Synchronizacja nie zamyka otwartego dialogu menu. `game-ready` i diagnostyka `boot-ms` odnoszą się do
pierwszego ekranu po okazji do renderowania, również przy wejściu bezpośrednio do walki przez URL.

Pixi pomija automatyczne rozszerzenia środowiska. Gra jawnie włącza zdarzenia, a używane klasy
Graphics/Text/BitmapText rejestrują swoje systemy. Nadal działają WebGL i dostępne fallbacki renderera.
Ekrany rysują maksymalnie 30 kl./s, walka i pojedynek 60 kl./s. Rozdzielczość canvasa jest ograniczona
do DPR 2. Na ekranie DPR 3 liczba rysowanych pikseli maleje o 56% (z 9 do 4 pikseli na piksel CSS).
To kompromis ostrości i obciążenia; tekst oraz ręczne notatki sprawdzono w układzie telefonu.

Stan widoczności strony i natywny `appStateChange` są łączone. Przejście w tło zatrzymuje główny ticker
Pixi i timer karmiący muzykę oraz usypia GSAP. Fallbackowe odpytywanie lobby/pojedynku pomija pobrania
w tle; po powrocie następuje odczyt serwera. Solo pozostaje na pauzie do potwierdzenia gracza.
Muzyka po wyciszeniu kończy fade i sprzątanie, następnie wyłącza swój timer. Realtime i mechanizmy sesji
SDK pozostają dostępne; nie jest to zatrzymanie wszystkich zadań JavaScript.

## Powtarzalny pomiar produkcyjnego buildu

```powershell
npm run build
# Jeśli korzystasz z zainstalowanego Chrome zamiast Playwright Chromium:
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run perf:startup
npm run perf:startup -- --check
```

Skrypt sam serwuje `dist` z gzip, uruchamia headless Chrome/Chromium, blokuje każde połączenie poza
własnym serwerem loopback i zamyka przeglądarkę oraz serwer. Każda z trzech próbek ma nowy kontekst,
brak cache HTTP, viewport 375×812, DPR 3, spowolnienie CPU ×4, 1,6 Mb/s i opóźnienie 150 ms. SwiftShader
pozwala powtórzyć test na maszynie bez GPU. Pierwszą klatkę mierzą dwa `requestAnimationFrame` po
zamontowaniu canvasa; dodatkowo test wymaga ukończonego startu gry. Raport zawiera listę obsłużonych
skryptów do tego momentu, ich rozmiar i sumę gzip. Nie korzysta z mostka DEV ani produkcyjnego backendu.

Opcjonalny argument katalogu pozwala porównać zachowany wcześniejszy build:
`node scripts/measure-startup.ts .cache/perf-baseline`.

Pomiar lokalny z 2026-10-31 (ten sam komputer i ustawienia, po trzy próbki):

| Wskaźnik | Przed zadaniem 5 | Po zadaniu 5 |
| --- | ---: | ---: |
| JS do pierwszej klatki menu | 1 068 308 B | 647 780 B |
| Suma gzip JS | 317 976 B | 206 078 B |
| Czas startu, mediana | 6 041 ms | 4 644 ms |
| Czasy trzech próbek | 6 041 / 6 081 / 6 013 ms | 4 927 / 4 559 / 4 644 ms |
| Piksele canvasa | 2 740 500 | 1 218 000 |

To około 35% mniej transferu JS i 23% krótszy start w tej serii. Wcześniejsza seria bazowa miała medianę
6 577 ms; obciążenie maszyny wpływa na czas. Test CI pilnuje struktury ładowania i budżetu 225 kB gzip,
bez sztywnego limitu czasu. Sam podział nie usuwa kodu dodatkowych ekranów z APK — przesuwa moment
jego parsowania. Całkowity rozmiar aplikacji i ilość danych po odwiedzeniu wszystkich ekranów nie maleją
w tej samej proporcji.

To symulacja laboratoryjna, nie wynik fizycznego słabszego Androida ani pomiar poboru energii. Przed
publikacją sprawdź zimny start, czytelność planszy/notatek, płynność ciosów i powrót do pojedynku na
docelowym telefonie. Zużycie baterii wymaga osobnego pomiaru na urządzeniu.
