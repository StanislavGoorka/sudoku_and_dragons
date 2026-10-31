# Kampania: balans i bossowie

Zachowano wszystkie 12 identyfikatorów etapów, odblokowania, bazowe obrażenia cyfr i mnożnik ×2 za
zamknięcie kwadratu. Zwykłe smoki i dzienne plansze mają te same zasady. Bossowie dostali różne wzorce:

- Strażnik Doliny: poniżej połowy HP przechodzi w furię, skracając odstęp ataków o 15%. Wejście w fazę
  zachowuje procent naładowania, więc poprawny ruch nie wywołuje nagłego ataku. Bazowy odstęp: 42 s.
- Władca Wulkanu: co trzeci atak zadaje o 2 HP więcej; ekran ostrzega przed nim z wyprzedzeniem.
  Bazowy odstęp: 38 s. Numer ataku jest zachowywany w checkpointach.
- Pradawny smok: poniżej połowy HP pojedyncza cyfra cofa ładowanie o 1 s zamiast 2 s. Bonus 5 s za
  ukończoną jednostkę pozostaje, co premiuje planowanie zamknięć. Bazowy odstęp: 35 s.

Ekran walki opisuje aktywną fazę. Osiągnięcia za pierwsze pokonanie bossów płacą odpowiednio 5, 8 i 10
gwiazdek. Istniejący mechanizm osiągnięć pilnuje wypłaty raz, także przy scalaniu dwóch urządzeń.
Wcześniej pokonani bossowie mogą odblokować te osiągnięcia przy kolejnym zapisie wyniku walki.

`npm run sim:campaign` odtwarza każdy etap na 80 ziarnach i przy tempie 8/10/12/14 sekund na cyfrę,
w losowej kolejności poprawnych ruchów, bez pomyłek. Raportuje medianę pozostałego HP, porażki i
rzeczywisty czas symulowanej próby. `sim:hp` oraz `sim:timer` kontrolują bazowe smoki.

Przy 10 s/cyfrę mediana HP bossów wynosiła wcześniej 20/10/0, teraz 25/11/0. Liczba porażek na
końcowym bossie spadła z 79/80 do 55/80. Przy 8 s/cyfrę jego mediana HP wzrosła z 10 do 15. Pozostaje
trudnym finałem, ale przestał wymagać prawie bezbłędnej szybkości w każdej symulowanej planszy.
Pośrednie etapy nadal rosną w trudności; nowy wzorzec bossa nie musi mieć krótszego bazowego timera,
aby cała walka była wymagająca.

Czas pojedynczej bezbłędnej próby to zwykle kilka minut (około 6–9 przy 10 s/cyfrę); przegrane próby
mogą kończyć się wcześniej. To model tempa i reguł, nie badanie zachowania ludzi. Dalsze strojenie
powinno uwzględniać rzeczywiste tempo i błędy graczy. Testy obejmują przejścia faz, ostrzeżenie przed
silnym atakiem, wznowienie jego rytmu i deduplikację nagrody między urządzeniami.
