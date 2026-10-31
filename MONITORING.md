# Monitoring techniczny

Raporty obejmują wyjątki JavaScript, nieudane operacje synchronizacji i pojedynków, problemy zapisu oraz
czas przygotowania aplikacji. Zdarzenie zawiera wersję buildu, platformę, ekran, operację, kod z zamkniętej
listy i maksymalnie trzy lokalizacje `plik.js:wiersz:kolumna`. Nie zawiera komunikatu wyjątku, pełnych URL,
adresu e-mail, nicka, ID gracza, tokenów, planszy, rozwiązania ani treści żądania. Ten mechanizm nie zastępuje
raportów natywnych awarii procesu Androida i ANR w Google Play.

Gracz może wyłączyć „Raporty błędów” w ustawieniach. Wyłączenie usuwa kolejkę na urządzeniu. Kolejka ma
maksymalnie 20 wpisów ważnych przez dobę. Powtarzające się błędy są grupowane, wysyłka obejmuje do ośmiu
zdarzeń raz na minutę. Awaria monitoringu nie jest raportowana przez monitoring i nie blokuje gry.
Nieznany wynik wysyłki jest ponawiany z tym samym ID; serwer nie zapisuje duplikatów. Raporty z poprzedniego
buildu mogą zostać wysłane po naprawie aplikacji. Diagnostyka sama nie zakłada konta: korzysta z sesji gry.
W trybie deweloperskim wysyłka jest dozwolona tylko do lokalnego backendu.

## Supabase

Migracja `client_diagnostics` tworzy dwie tabele w niewystawionym schemacie `private`. RLS i brak grantów
blokują odczyt/zapis przez graczy. Publiczny RPC `report_client_diagnostics` jest funkcją invoker; wywołuje
prywatną funkcję definer z kontrolą `auth.uid()` i pustym `search_path`. Walidacja odrzuca dodatkowe pola,
niedozwolone kody/lokalizacje i duże partie. Limit wynosi 60 nowych rekordów dziennie na uwierzytelnionego
gracza; nadmiar jest pomijany. Limit wykorzystuje osobny skrót ID i dnia, bez ID w raportach. Przy przyjęciu
partii serwer usuwa raporty starsze niż 14 dni i poprzednie dzienne limity; po okresie bez raportów sprzątanie
następuje przy następnym przyjętym zgłoszeniu.

Informacje advisorów „RLS enabled, no policy” dla tych prywatnych tabel są zamierzone: klienci nie mają
ich czytać. Nie dodawaj polityki `using (true)` ani schematu `private` do Data API.

W SQL Editor lub przez connector Supabase można odczytać grupy błędów:

```sql
select release, platform, kind, code, operation, screen, location,
       sum(count) as occurrences, max(received_at) as last_seen
from private.client_diagnostics
where received_at > now() - interval '24 hours' and kind <> 'performance'
group by release, platform, kind, code, operation, screen, location
order by occurrences desc;
```

Czas startu dla danego buildu:

```sql
select release, platform, count(*) as samples,
       percentile_disc(0.5) within group (order by value) as median_ms,
       percentile_disc(0.95) within group (order by value) as p95_ms
from private.client_diagnostics
where kind = 'performance' and code = 'boot-ms' and received_at > now() - interval '7 days'
group by release, platform;
```

Raporty są technicznymi obserwacjami z klienta, nie dowodem poprawności wyniku gry. Nie korzysta z nich
system nagród. Automatyczne powiadomienia nie są skonfigurowane.

## Ustalenie miejsca błędu

Build identyfikuje się SHA commita (z końcówką `-local`, gdy zawiera lokalne zmiany). Vite generuje ukryte
mapy źródeł. Końcowy krok `npm run build` przenosi je do lokalnego, ignorowanego `artifacts/sourcemaps/`:
`dist/` i APK nie zawierają map ani linków `sourceMappingURL`. Mapy nie są wysyłane do GitHub ani zdalnego
monitoringu. Zachowaj lokalne mapy dla buildu, który publikujesz; nazwy chunków mają hash treści.

```powershell
npm run diagnostics:resolve -- main-HASH.js:1:12345
```

Polecenie wypisuje oryginalny plik, wiersz i kolumnę. Przy kilku lokalizacjach oddzielonych średnikiem
rozwiąż je osobno. Użyj map dokładnie tego chunka, który występuje w raporcie.
