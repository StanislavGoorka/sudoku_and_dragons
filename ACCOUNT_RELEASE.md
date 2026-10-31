# Konto i usuwanie danych

## Zaimplementowane

- Konto → Usuń konto i dane; gość → Usuń dane gościa. Wyraźne potwierdzenie trwałego usunięcia.
- `delete-account` w Supabase: `getUser(token)` sprawdza rzeczywiste konto, nie tylko podpis JWT.
  Żądanie przyjmuje wyłącznie `{ "confirm": "DELETE" }`; identyfikator pochodzi z uwierzytelnienia.
  Najpierw odwołuje sesje, potem wykonuje twarde `admin.deleteUser(id, false)`.
- Klucze obce usuwają profil, zapis, wyniki dzienne, pojedynki i ich sekrety. Pojedynek znika również
  z historii rywala. Wspólny interfejs nie pozwala usuwać cudzych danych.
- Po potwierdzeniu serwera aplikacja czyści lokalny zapis, walkę, pokwitowania wyników, kolejkę dzienną,
  bazę synchronizacji, nick i kolejkę diagnostyki. Błąd serwera zachowuje postęp.
  Odpowiedź poprzedniego konta nie czyści danych nowego użytkownika.
- `/delete-account.html` pozwala zalogować się i usunąć konto bez aplikacji. Sesja istnieje tylko w pamięci;
  strona nie importuje postępu gry i nie zapisuje hasła. Dostępne odzyskiwanie hasła kodem.
- `/privacy.html` jest szkicem z jawnym oznaczeniem brakujących danych administratora/kontaktu.
  Aplikacja udostępnia go z ekranu konta. Wersje web i Android zawierają oba dokumenty.
- Ponowienie zapisu hasła po udanej weryfikacji kodu nie próbuje zużyć tego samego kodu drugi raz.

Anonimowe raporty techniczne nie zawierają identyfikatora konta; nie można przypisać ich do żądania
usunięcia. Retencja: 14 dni, sprzątanie przy kolejnym raporcie. Dzienne skróty limitów są czyszczone
przy kolejnym raporcie następnego dnia. Lokalne kopie na innych urządzeniach wymagają wyczyszczenia danych.
Retencję logów infrastruktury i ewentualnych kopii zapasowych trzeba potwierdzić u dostawców.

## SMTP — wymaga danych właściciela

Na 2026-10-31 właściciel nie ma jeszcze docelowego SMTP ani publicznego kontaktu. Nie skonfigurowano
fikcyjnego dostawcy i nie wysyłano wiadomości na cudze adresy. Domyślny SMTP Supabase nie jest
konfiguracją do wydania produkcyjnego; obowiązują ograniczenia odbiorców i wysyłki.

1. Przygotuj dostawcę SMTP i domenę nadawcy. Potwierdź domenę i wymagane przez dostawcę SPF/DKIM/DMARC.
2. W Supabase → Authentication → Email → SMTP wpisz host, port, użytkownika, hasło i zweryfikowany
   adres nadawcy. Hasło przechowuj w menedżerze haseł; nie w `VITE_*`, kodzie ani Git.
3. Włącz potwierdzanie e-maila i wstaw oba szablony z `supabase/email-templates/` do Change email address
   oraz Reset password. Oba muszą zawierać `{{ .Token }}`. `config.toml` stosuje je w lokalnym stacku,
   nie zmienia ustawień hostowanego Auth. Sprawdź wymaganie potwierdzenia starego i nowego adresu;
   rejestracja gościa nie może żądać potwierdzenia nieistniejącego starego e-maila.
4. Ustaw Site URL na docelową domenę gry. Gra używa kodów, więc powrót z linka nie jest warunkiem odzyskania.
5. Ustaw rozsądne limity wysyłki i częstotliwości; nie wyłączaj ich do testów publicznych.
6. Na własnych skrzynkach co najmniej dwóch dostawców przetestuj: gość → e-mail → kod → hasło → nowe
   logowanie; reset → kod → nowe hasło (stare nie działa); błędny/wygasły kod; resend, spam, opóźnioną
   wiadomość i odmowę SMTP. Zapisz czas dostarczenia i wynik, bez haseł/kodów w repozytorium.

## Walidacja i publikacja

Testy jednostkowe obejmują błędne kody, ponawianie zapisu hasła, brak sieci, zmianę konta i odwołanie sesji.
Playwright sprawdza rzeczywistą obsługę formularza web oraz potwierdzenie/anulowanie/błąd/sukces w aplikacji.
`scripts/test-account-server.ts` jest częścią `test:integration`: lokalne Auth, prawdziwy OTP z GenerateLink,
nowe hasło, ochrona właściciela, kaskady i odrzucony stary token. GenerateLink nie testuje dostarczenia SMTP.
Pełny lokalny stack wymaga Dockera; nie traktuj samych atrap HTTP jako testu integracyjnego Auth.

Po uzupełnieniu danych i polityki opublikuj web przez `npm run deploy:web`, a następnie sprawdź publiczne
`https://sudoku-dragons.pages.dev/delete-account.html` i `/privacy.html` z urządzenia bez aplikacji.
Nie wpisuj nieopublikowanej strony do formularza Play. W tym zadaniu wdrożono samą funkcję backendu;
publikacja polityki wymaga uzupełnienia kontaktu.

Źródła: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[usuwanie użytkownika](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser),
[wymagania Google Play](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).
