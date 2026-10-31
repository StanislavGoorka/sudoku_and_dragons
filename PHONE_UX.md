# Wygoda na telefonie

Przegląd w przeglądarce mobilnej obejmuje 360×640 i 375×812, z tym samym seedem i ręcznymi notatkami.
Obserwacje przed zmianą: klawiatura miała zbyt wąskie pola, kontrolki walki były małe, długi napis
raportowania dochodził do krawędzi przycisku, a niektóre kolory cyfr słabo odcinały się od zaznaczenia.

| Kontrola | Przed | Po |
| --- | --- | --- |
| Klawisz cyfry, ekran 360 | ok. 33×47 px | ok. 61×48 px |
| Klawisz cyfry, ekran 375 | ok. 35×49 px | ok. 64×48 px |
| Pauza / notatki | 36×36 px | 48×48 px |
| Notatki, ekran 360 / 375 | 10 / 10 px | 11 / 12 px, grubszy krój |
| Szerokość pól planszy, ekran 360 / 375 | 324 / 339 px | 324 / 339 px |

Telefony mają dwa rzędy cyfr (1–5, następnie 6–9), szerokie ekrany jeden. Zmniejszenie samej areny na
krótkim telefonie zachowuje rozmiar planszy. Nieinteraktywna miniatura w sklepie pozostaje kompaktowa.
Kontrolki `Button` mają obszar dotyku co najmniej 48×48 px, także gdy ikona jest mniejsza. Gęsta plansza
9×9 jest wyjątkiem: pola muszą zmieścić się na ekranie i mają na małym telefonie około 36 px.

Cyfry gracza i rywala mają teraz co najmniej 4,5:1 kontrastu na każdym tle komórki, również zaznaczonym.
Notatki używają kontrastowego koloru cyfr początkowych. Nadal są wyłącznie ręczne: nic ich nie dopisuje,
nie sprawdza ani nie usuwa z sąsiednich pól. Długie etykiety przycisków i nazwy pasków HP mieszczą się
w dostępnym miejscu. Przy zbyt wysokim oknie można przewinąć treść palcem po panelu lub kółkiem, aby
dotrzeć do ostatniej akcji; przyciski i suwak zachowują własne gesty.

Ranking pyta o zastąpienie zapisanej walki przed rozpoczęciem próby na serwerze. Anulowanie nie zużywa
startu ani nie uruchamia zegara. Błąd połączenia podczas startu zachowuje poprzedni zapis.
Tabela i jej przyciski mieszczą się na krótkim ekranie.

Weryfikacja: porównanie zrzutów przed/po, rzeczywiste zdarzenia dotyku klawiatury, zachowanie ręcznych
notatek, ustawienia, przewijanie długiego okna, wznowienie i całe regresje gry. Testy geometrii pilnują
braku nakładania klawiszy i ich minimalnego rozmiaru, testy kolorów wszystkich stanów planszy.

Punkty odniesienia: [Android — widoczność tekstu i cele dotyku](https://developer.android.com/guide/topics/ui/accessibility/apps),
[WCAG — kontrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
Nie przeprowadzono jeszcze sesji z nowymi graczami ani fizycznym telefonem; testy przeglądarkowe ich
nie zastępują. Ten zakres nie stanowi pełnego audytu TalkBack ani zgodności całej aplikacji z WCAG.
