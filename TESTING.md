# Testy

Wersja Node jest przypięta w `.node-version`. Instalacja zależności: `npm ci`.

## Szybkie sprawdzenie aplikacji

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Build sprawdza typy aplikacji, niezależnego rdzenia i testów przeglądarkowych. Vitest obejmuje reguły gry,
synchronizację, odzyskiwanie zapisów i wymuszone wyścigi przy anulowaniu pokoju. Playwright uruchamia grę
na ekranie telefonu i sprawdza prawdziwe kliknięcia oraz klawiaturę: zapis i wznowienie solo, ochronę przed
przypadkowym zastąpieniem walki, restart podczas zwycięstwa, odnalezienie pojedynku bez lokalnego ID,
ponowne połączenie i jednokrotną nagrodę, pokój oczekujący i spóźnione odpowiedzi serwera.

Scenariusze przeglądarkowe sterują transportem sieciowym, aby powtarzalnie wymuszać awarie. Korzystają
z istniejącego mostka DEV tylko do odczytu stanu i geometrii canvasa (oraz przygotowania końcowego ciosu).
Nie wysyłają niczego do produkcyjnego Supabase. Gdy przeglądarka jest już zainstalowana, można zamiast
pobierania Chromium wybrać lokalny Chrome: `$env:PLAYWRIGHT_CHANNEL = 'chrome'`.

## Prawdziwy Supabase, Edge Function i PostgreSQL

Potrzebny jest działający Docker z kontenerami Linux. Konfiguracja `supabase/config.toml` tworzy osobny
stos `sudoku-dragons-ci`, bez łączenia z projektem w chmurze. Migracje z repozytorium są stosowane od zera.

```powershell
npm run function:bundle
npx supabase start -x studio,postgres-meta,storage-api,imgproxy,mailpit,logflare,vector,supavisor
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '54322'
$env:PGUSER = 'postgres'
$env:PGPASSWORD = 'postgres'
npm run test:matchmaking
npm run test:integration
npx supabase stop --project-id sudoku-dragons-ci --no-backup
```

`test:matchmaking` otwiera niezależne połączenia do prawdziwego PostgreSQL i tworzy własną tymczasową bazę.
Sprawdza parowanie równoczesnych zgłoszeń, anulowanie starego wyszukiwania, rollback i uprawnienia RPC.
Zawsze usuwa swoją bazę i tylko te role, które sam utworzył. Można użyć także lokalnego PostgreSQL bez Dockera.

`test:integration` odczytuje klucze lokalnego stosu przez CLI, uruchamia worker funkcji i czeka na odpowiedź
jej własnego handlera. Następnie sprawdza pokoje, matchmaking, ruchy, timeouty, rewanże, odczyt przy wznowieniu,
RLS i zapisy w chmurze. `finally` usuwa utworzonych użytkowników przez lokalny Auth Admin API; klucze obce
usuwają ich profile, pojedynki, rozwiązania i zapisy. Dane całego testowego stosu usuwa końcowe `stop --no-backup`.

Bezpośrednie `test:server` wymaga `SUPABASE_TEST_URL`, `SUPABASE_TEST_KEY` i `SUPABASE_TEST_SERVICE_KEY`.
Adres musi wskazywać loopback; nie ma domyślnego połączenia z produkcją. Klucz administracyjny trafia wyłącznie
do procesu testowego, nigdy do zmiennych `VITE_` ani buildu aplikacji. `.env.example` pokazuje opcjonalną
konfigurację klienta do ręcznej gry z lokalnym backendem.

## CI

`.github/workflows/ci.yml` działa dla push, pull request i ręcznego uruchomienia. Dwa zadania obejmują:

- testy, typy, build i osiem scenariuszy przeglądarkowych;
- tymczasowy Supabase, realne testy współbieżności PostgreSQL i integrację funkcji z Auth/RLS.

CI nie potrzebuje sekretów projektu produkcyjnego. Sprzątanie stosu wykonuje się także po błędzie.
Build jest artefaktem workflow; przy błędzie zostają raport i ślady Playwright albo log workera funkcji.
Workflow nie publikuje aplikacji i nie wdraża zmian do Supabase.
