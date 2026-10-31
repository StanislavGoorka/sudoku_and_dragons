# Robocza mapa do formularza Data safety

To inwentaryzacja kodu, nie wysłana deklaracja. Właściciel musi sprawdzić aktualne definicje Google,
ustawienia Supabase/Cloudflare, konfigurację poczty i krajów/grup wiekowych przed zatwierdzeniem.
Nie wybieraj „nie zbieramy danych”: konto gościa online również ma identyfikator.

| Dane w kodzie | Proponowana kategoria formularza | Cel | Wybór użytkownika / usuwanie |
| --- | --- | --- | --- |
| E-mail | Dane osobowe → adres e-mail | Konto, potwierdzenie, odzyskiwanie | Konto e-mail opcjonalne, usuwanie konta |
| Nick i UUID konta/gościa | Dane osobowe → nazwa i identyfikatory użytkownika | Profil, autoryzacja, pojedynek, ranking | Wymagane dla funkcji online, usuwanie konta |
| Postęp, osiągnięcia, przedmioty, wyniki, stan pojedynku | Aktywność w aplikacji → interakcje / inne działania | Funkcje gry i synchronizacja | Solo lokalne; online/synchronizacja wysyła stan; usuwanie konta |
| Oczyszczone błędy, kod/lokalizacja usterki | Informacje o aplikacji i wydajności → dzienniki awarii / diagnostyka | Stabilność | Wyłączalne w ustawieniach, anonimowe raporty sprzątane po 14 dniach przy kolejnym raporcie |
| Czas startu, platforma i wersja aplikacji | Informacje o aplikacji i wydajności → diagnostyka / inne dane wydajności | Wydajność | Ten sam przełącznik i retencja |

Hasło jest przekazywane wyłącznie do Supabase Auth przez TLS, nie do własnych tabel, diagnostyki ani
logów aplikacji. Sprawdź deklaracje dostawcy Auth. Nie zakładaj, że identyfikator UUID jest anonimowy
w rozumieniu formularza. Raporty diagnostyczne aplikacji nie zawierają UUID konta, ale infrastruktura
może przetwarzać IP i metadane żądań — sprawdź jej logi, retencję i definicje kategorii danych.

Przesyłanie jest szyfrowane HTTPS. Backend wymaga sesji i stosuje RLS; usuwanie jest dostępne w aplikacji
i przez przygotowaną stronę web. Nick i wynik są widoczne w rankingu, a profil i stan pojedynku innym
graczom zgodnie z funkcją gry. Oceń te przypadki według definicji udostępniania i wyjątków Google.
Przekazanie operatorowi infrastruktury działającemu jako usługodawca może podlegać wyjątkowi od
„udostępniania”; nie jest to powód do pominięcia zbierania.

W kodzie nie ma SDK reklam, identyfikatora reklamowego, płatności, kontaktów, aparatu, mikrofonu,
lokalizacji urządzenia ani analityki marketingowej. Zweryfikuj finalny manifest i zależności przed
każdym wydaniem. Nie deklaruj niezależnego audytu bezpieczeństwa ani pełnej zgodności tylko na podstawie
testów tego repozytorium. Polityka prywatności pozostaje szkicem do czasu danych właściciela i przeglądu.

[Oficjalny formularz i definicje Google](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
