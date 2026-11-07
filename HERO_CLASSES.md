# Postać, Fabuła i Arena

Przy pierwszym uruchomieniu nazwij bohatera i wybierz klasę. W **Klasa postaci** możesz
zmienić imię lub klasę przed kolejną walką. Postać jest częścią zapisu postępu, również w chmurze
po zalogowaniu. Starszy zapis otwiera się bez utraty walk lub kosmetyków.

**Fabuła** korzysta z dotychczasowych krain i etapów. W dzienniku questów każdy otwarty etap ma
opis rozdziału, cel i nagrodę. Pierwsze zwycięstwo daje 40 XP, kolejne 10. Poziom Fabuły rośnie co
80 XP i daje +1 HP na kolejne starcie fabularne (maks. +10). Na poziomach 3, 5 i 9 zmienia się tytuł. XP wynika z zapisanych zwycięstw, więc ponowne
otwarcie wyniku nie wypłaca nagrody.

| Klasa | Pasywna | Aktywna |
| --- | --- | --- |
| Strażnik | Atak czasowy zadaje o 2 HP mniej, minimum 1. | Bastion pochłania do 6 HP z najbliższego ciosu. |
| Zwiadowca | Każda poprawna cyfra cofa ładowanie ataku o dodatkową sekundę. | Zasłona cofa ładowanie o maks. 10 s i zmniejsza cios za następny błąd o maks. 3 HP. |
| Alchemik | Domknięcie jednostki leczy 1 HP na ruch. | Eliksir leczy do 8 HP. |

Poprawna cyfra daje 1 punkt skupienia. Jeśli domknie co najmniej jeden wiersz, kolumnę
lub kwadrat, daje łącznie 2 punkty. Limit i koszt zdolności to 5. Gdy przycisk umiejętności
się podświetli, użyj go dotykiem lub spacją. Skupienie nie przyrasta samo. Osłony się nie
sumują; Zwiadowca może ponownie opóźnić atak, gdy wciąż ma osłonę i smok zdążył naładować
co najmniej sekundę. W treningu bez zegara Zasłona nadal chroni przed błędem.

Zdolności nie dodają cyfr ani podpowiedzi. Wartości ciosów z cyfr i mnożnik kwadratu działają
jak wcześniej; obrona może zmniejszyć otrzymane obrażenia. Wyzwanie dnia, trening z botem
i scenariusze lekcji zachowują swoje zasady. Rozpoczęta walka solo zachowuje klasę i stan zdolności.
Powtórki zapisują użycie umiejętności i leczenie, ale ich odtwarzanie nie wpływa na walkę ani nagrody.

## Arena

Zdolności można aktywować we własnej turze za 5 skupienia. Nie zużywają ruchu i nie resetują
zegara. Na Arenie Strażnik ma karę za błąd mniejszą o 2 HP, a Bastion pochłania do 6 HP z kolejnego
ciosu rywala. Zwiadowca zdobywa po 2 skupienia za każdą poprawną cyfrę i może odjąć 6 HP od
kary za kolejny błąd. Alchemik zachowuje swoje leczenie. Inni bohaterowie zdobywają skupienie jak w solo.

Szybka gra dobiera przeciwnika według trudności planszy i Elo (start: 1000, K = 24). Zakres zaczyna
się od 100 punktów i rośnie o 50 co 10 sekund do 500. Zwycięstwo daje 25 XP Areny, porażka 10,
remis 15; obie strony muszą wcześniej wykonać co najmniej jedną poprawną cyfrę. Pokoje prywatne
mają klasy i poziomy, ale nie zmieniają Elo ani XP. Każde 100 XP Areny to kolejny poziom i +2 HP
na start meczu (maks. +20 HP). Poziom Fabuły nie zwiększa siły w PvP, bo zapis solo można edytować
offline. Poziom Areny i Elo są wyliczane na serwerze, niezależnie od chmury zapisu postaci.

## Uruchomienie online

Najpierw zastosuj migrację `20261107103705_arena_classes.sql`, potem zbuduj paczkę funkcji
(`npm run function:bundle`) i wdróż funkcję Edge `duel`. Na końcu opublikuj klienta. Migracja
utrzymuje oddzielne kolejki klasyczne i RPG, a już rozpoczęte stare pojedynki pozostają grywalne.
`npm run test:matchmaking` weryfikuje właściwą migrację na lokalnej bazie: uprawnienia, dobór Elo,
poszerzanie zakresu i pojedyncze rozliczenie wyniku.
