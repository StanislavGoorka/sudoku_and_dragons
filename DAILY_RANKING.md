# Ranking wyzwania dnia

„Wyzwanie dnia” otwiera ranking z kategoriami łatwą, średnią i trudną. Każda ma wspólną planszę
z ziarna daty UTC. Tabela pokazuje pięć najlepszych wyników i własne miejsce, również poza pierwszą
piątką. Liczy się najlepszy czas konta; identyczne czasy dają wspólne miejsce.

„Graj w rankingu” zakłada próbę przez funkcję `daily`. Baza mierzy czas między startem i przyjęciem
wyniku, wliczając pauzę, tło oraz wysyłkę. Limit: 20 startów na konto dziennie; próbę można zakończyć
przez 24 godziny. „Graj offline” zachowuje lokalny kalendarz i nagrody, bez wpisu w rankingu.
Ranking nie przyznaje dodatkowej waluty; wygrana lokalna korzysta z istniejących zasad nagród.

Klient przesyła ID próby i ruchy (pole, cyfra, czas aktywnej gry), nie wiarygodny wynik/czas/HP.
Serwer odtwarza wspólną planszę i zwycięstwo według rdzenia gry. Odrzuca niepełne/uszkodzone powtórki,
cudze próby i niemożliwą oś czasu. To walidacja rozgrywki i czasu, nie ochrona przed automatycznym
solverem lub zmodyfikowanym klientem znającym reguły gry.

Tabela prób ma RLS: gracz czyta tylko swoje próby, a zapisuje je wyłącznie serwer. Odczyt rankingu
zwraca nicki, czasy, miejsca i flagę własnego wiersza, bez ID kont. Prywatna funkcja odczytu ma kontrolę
`auth.uid()` i pusty `search_path`. Goście są uwierzytelnionymi graczami, tak jak w pojedynkach.

Powtórka trwałej walki jest częścią checkpointu. Wygrana zapisuje kolejkę wysyłki przed usunięciem
checkpointu. Maksymalnie pięć prób, ważnych dobę, jest ponawianych po starcie, odzyskaniu internetu
lub otwarciu rankingu. Wysyłka pozostaje przypisana do właściciela. Niepewna odpowiedź ponawia ten sam
ID, a baza zapisuje jego czas tylko raz. Brak miejsca w localStorage może uniemożliwić zapis kolejki.

Wdrożenie: migracja `daily_leaderboard`, `npm run function:bundle`, następnie funkcja `daily` z JWT
włączonym. Zmiana generatora lub zasad codziennej walki wymaga zgodnej wersji serwera i klienta.
Testy: `core/daily.test.ts`, faktyczny handler w `daily-function.test.ts`, role/czas/limity w
`test:matchmaking`, przeglądarka w `daily.spec.ts`. `test:integration` uruchamia także
`test-daily-server.ts` na lokalnym Supabase i usuwa własnych użytkowników; ten ostatni wymaga Dockera.
