# Wydanie testowe Android

Stan 2026-10-31: przygotowanie techniczne do testów. Nie utworzono aplikacji w Play Console i nie
rozpoczęto dystrybucji. Właściciel nie ma jeszcze SMTP, kontaktu publicznego ani konta aplikacji w Play.
`readiness.json` celowo pozostawia te warunki niespełnione. Podpisany AAB nie oznacza zatwierdzenia
polityki, formularzy Google ani gotowości do publicznej premiery.

## Artefakty i wersje

- Pakiet: `com.metrezz.sudokudragons`, Android 7.0+ (minSdk 24), target/compile SDK 36.
- Kopie Android cloud backup i device transfer są wyłączone dla danych aplikacji, aby nie odtwarzać
  sesji i usuniętych zapisów. Transfer postępu odbywa się przez konto gry. HTTP cleartext jest wyłączony.
- `android-version.properties`: jedyne źródło Android `versionCode` i `versionName`.
  Każdy kolejny upload musi zwiększyć `versionCode`; numeru wykorzystanego w Play nie używaj ponownie.
- `npm run android:release` (Windows + Android Studio/JDK/SDK): buduje web, synchronizuje Capacitor,
  tworzy podpisany AAB, APK debug i uruchamia lint wydania. Gradle odmawia release bez własnego klucza.
- Wyniki: `android/app/build/outputs/bundle/release/app-release.aab` i
  `android/app/build/outputs/apk/debug/app-debug.apk`. APK debug służy do instalacji ręcznej,
  AAB uploaduje się do Play. Nie stosuj klucza debug w Play.
- `npm run release:assets`: cztery rzeczywiste ekrany gry z syntetycznym postępem lokalnym,
  ikona 512×512 i grafika 1024×500 w `store-assets/`. Ekrany pochodzą z przeglądarki 360×640,
  eksport 1080×1920; nie są dowodem testów na fizycznym telefonie. Grafika ma też edytowalny SVG.
- `store-listing.pl.json` i `notes.pl.txt`: gotowe teksty do skopiowania, z kontrolą długości.
- `npm run release:check -- --artifacts`: weryfikuje wersję, opisy i rozmiary materiałów.
  `npm run release:check` dodatkowo odmawia gotowości do publikacji przy brakujących warunkach.
  Checklistę zmieniaj wyłącznie po rzeczywistym wykonaniu opisanych kroków.

## Klucz upload i jego kopia

`npm run android:signing:init` tworzy nowy klucz RSA 3072 w ignorowanym
`artifacts/signing/upload-keystore.p12` (alias `upload`), certyfikat PEM oraz hasło zaszyfrowane Windows
DPAPI dla bieżącego konta systemowego w `upload-password.dpapi`. Skrypt nigdy nie nadpisuje istniejących
plików. Nie uruchamiaj go ponownie w celu naprawienia problemu z podpisem.

**Przed pierwszym uploadem zrób przenośną kopię klucza i hasła w bezpiecznym magazynie.** Sam plik
DPAPI działa tylko z odpowiednim kontem Windows i nie jest przenośną kopią hasła. Klucz, hasło i plik
DPAPI nie mogą trafić do Git, artefaktów CI ani publicznej chmury. Zachowaj także certyfikat PEM.

Aby samodzielnie odzyskać hasło do menedżera haseł, użyj lokalnej konsoli PowerShell (polecenie
wyświetli hasło — nie wklejaj wyniku do czatu ani logów):

```powershell
Add-Type -AssemblyName System.Security
$encryptedUploadPassword = [IO.File]::ReadAllBytes((Join-Path (Get-Location) 'artifacts\signing\upload-password.dpapi'))
$plainUploadPassword = [Security.Cryptography.ProtectedData]::Unprotect($encryptedUploadPassword, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Text.Encoding]::UTF8.GetString($plainUploadPassword)
[Array]::Clear($plainUploadPassword, 0, $plainUploadPassword.Length)
```

Na innym komputerze/CI ustaw prywatne zmienne: `SUDOKU_UPLOAD_STORE` (pełna ścieżka),
`SUDOKU_UPLOAD_STORE_PASSWORD`, `SUDOKU_UPLOAD_ALIAS`, `SUDOKU_UPLOAD_KEY_PASSWORD`.
Dla utworzonego PKCS12 hasło klucza jest takie samo jak hasło magazynu. Skrypt budowania przywraca
poprzednie środowisko po zakończeniu. Nie dodawaj haseł do argumentów Gradle ani `gradle.properties`.

## Przed pierwszym wysłaniem do Google Play

1. Uzupełnij nazwę administratora i publiczny e-mail kontaktowy; zatwierdź i opublikuj politykę oraz
   stronę usuwania. Dokończ SMTP i próby dostarczenia z `ACCOUNT_RELEASE.md`. Sprawdź publiczne URL-e
   bez logowania, na telefonie bez aplikacji. Zaznacz odpowiednie pola w `readiness.json`.
2. Utwórz aplikację w Play Console: polski, gra logiczna, właściwy stały package id. Wybierz model
   dystrybucji i grupę odbiorców świadomie; nie deklaruj automatycznie kategorii dla dzieci.
3. Włącz Play App Signing: Google zarządza kluczem podpisywania dystrybucji, a utworzony lokalnie
   klucz jest kluczem upload. Sprawdź certyfikaty w App integrity i przechowaj kopię klucza upload.
4. Uzupełnij wymagane formularze: Data safety (`data-safety.md` to mapa robocza), reklamy (gra nie
   zawiera SDK reklam), dostęp do aplikacji (solo i gość dostępne bez hasła), rating IARC na podstawie
   rzeczywistych pojedynków fantasy oraz docelowe grupy wiekowe. Nie podawaj haseł własnego konta.
5. Wstaw teksty i materiały, publiczne linki polityki/usuwania oraz kontakt. Zweryfikuj wymagania Play
   widoczne dla tego konta w dniu uploadu, zwłaszcza target API i weryfikację dewelopera.
6. Zacznij od testu wewnętrznego. Wyślij AAB w wersji z `android-version.properties`, dodaj testerów i przeczytaj raport pre-launch.
   Lista sprawdzeń urządzeń jest w `testing.md`. Nie zaznaczaj testów jako zaliczonych przed wynikami.
7. Następnie test zamknięty. Dla nowych kont osobistych objętych tą zasadą Google wymaga obecnie
   co najmniej 12 testerów zapisanych nieprzerwanie przez 14 dni przed wnioskiem o dostęp produkcyjny.
   Samo wykonanie automatycznych testów repozytorium nie spełnia tego wymagania.

Źródła sprawdzone 2026-10-31: [podpisywanie](https://developer.android.com/studio/publish/app-signing),
[target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en),
[materiały sklepu](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en),
[testy zamknięte](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
