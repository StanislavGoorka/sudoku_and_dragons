# Plan rozwoju

Duże zadania w kolejności. Każde zadanie to osobny commit (albo kilka, gdy jest duże).

1. [x] **Samouczek** – prowadzona pierwsza walka (wybór pola, cyfra, ciosy, licznik smoka; licznik stoi na czas
   samouczka) i zasady pojedynku w lobby przed pierwszym pojedynkiem.
2. [x] **Trening z botem w pojedynkach** – gdy szybka gra nie znajduje rywala, propozycja walki z wyraźnie
   oznaczonym botem.
3. [x] **Kampania** – krainy z kilkoma smokami każda, mapa postępu, bossowie, zamiast trzech poziomów.
4. [x] **Notatki ołówkiem** – ręczne kandydaty w polach, bez żadnych podpowiedzi ani automatycznego skreślania
   (decyzja właściciela: notatki to umiejętność gracza, nie ułatwienie).
5. [x] **Muzyka w tle** – generowana (Web Audio), spokojna w menu, żywsza w walce i pojedynku; głośność i wyciszenie
   w ustawieniach i w pauzie walki.
6. [x] **Ranking wyzwania dnia** – wspólne kategorie UTC, walidacja ruchów, czas serwera,
   najlepsze wyniki i własne miejsce (`DAILY_RANKING.md`).
7. [ ] **Przygotowanie do Google Play** – podpisany AAB, wersje, polityka prywatności, grafiki i opis sklepu.
8. [x] **Lżejsza gra** – ekrany ładowane na żądanie, moduły konta po pierwszej klatce menu;
   pomiary i budżet rozmiaru startowego w CI (`PERFORMANCE.md`).

## Niezawodność przed publikacją

1. [x] **Wznawianie walki solo** – lokalny zapis planszy, notatek, HP, czasu i licznika ataku; wznowienie
   z menu po restarcie aplikacji; potwierdzenie przed zastąpieniem walki i atomowy zapis wyniku.
2. [x] **Powrót do pojedynku online** – odnalezienie aktywnej walki po restarcie, odświeżenie po
   odzyskaniu połączenia i czytelny status sieci.
3. [x] **Automatyczne testy w CI** – testy jednostkowe, typy, build i testy integracyjne w odizolowanym
   środowisku Supabase z usuwaniem danych testowych.
4. [x] **Monitoring błędów** – prywatne raporty techniczne w Supabase, ograniczona kolejka, limity,
   deduplikacja, sprzątanie starych wpisów, wyłączenie w ustawieniach i lokalne mapy źródeł.
5. [x] **Szybszy start i mniejsze zużycie zasobów** – ładowanie ekranów na żądanie, lżejszy renderer,
   ograniczenie pracy w tle i pomiary produkcyjnego buildu.
6. [x] **Ranking wyzwania dnia** – weryfikacja po stronie serwera, RLS i ponawianie wyników.
7. [x] **Balans i różnorodność kampanii** – symulacje 12 etapów, trzy wzorce bossów,
   łagodniejszy skok finału i jednorazowe nagrody (`BALANCE.md`).
8. [ ] **Wygoda na telefonach** – małe ekrany, czytelne cyfry/notatki, przyciski i kontrast.
