#!/usr/bin/env bash
# Emulator-smoketest voor de Android-app: installeert de APK, start hem, en
# controleert in logcat dat de webapp uit de bundel echt geladen is. Maakt van elk
# scherm een schermafbeelding (de debug-bouw stuurt een scherm mee via een extra).
#
# Gebruik: bash scripts/android-emulator-smoke.sh [pad/naar/app-debug.apk]
# Wordt door .github/workflows/android.yml binnen de emulator-runner aangeroepen.
set -euo pipefail

APK="${1:-android/app/build/outputs/apk/debug/app-debug.apk}"
PAKKET="nl.werdens.smakenland"
ACTIVITY="$PAKKET/.MainActivity"
test -s "$APK"

adb wait-for-device
for _ in $(seq 1 90); do
  if [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then break; fi
  sleep 2
done
for _ in $(seq 1 60); do
  if adb shell pm list packages >/dev/null 2>&1; then break; fi
  sleep 2
done

# Emulator-dialogen (ANR van systeemprocessen op een trage emulator) horen niet op de foto.
adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1 || true
adb shell settings put global window_animation_scale 0 >/dev/null 2>&1 || true

installed=""
for poging in $(seq 1 8); do
  if adb install -r -t "$APK"; then installed="ja"; break; fi
  echo "installatiepoging $poging mislukt; opnieuw"
  sleep 15
done
test "$installed" = "ja"

# Op een schoon toestel begint het spel bij de uitleg; die klikken we weg zodat de
# foto's het spel zelf laten zien.
start_en_wacht() {   # $1 = scherm (leeg = gewoon beginnen), $2 = marker
  local scherm="$1" marker="$2" gevonden="" focus size breedte hoogte
  adb shell am force-stop "$PAKKET" >/dev/null 2>&1 || true
  adb logcat -c >/dev/null 2>&1 || true
  if [ -n "$scherm" ]; then
    adb shell am start -n "$ACTIVITY" --es scherm "$scherm" >/dev/null
  else
    adb shell am start -n "$ACTIVITY" >/dev/null
  fi
  for _ in $(seq 1 60); do
    if adb logcat -d 2>/dev/null | grep -q "$marker"; then gevonden="ja"; break; fi
    sleep 5
  done
  if [ "$gevonden" != "ja" ]; then
    echo "::error::de marker '$marker' kwam niet binnen de wachttijd"
    adb logcat -d 2>/dev/null | grep -aiE "smakenland|chromium|AndroidRuntime|FATAL|ANR" | tail -80 || true
    return 1
  fi
  adb logcat -d | grep -m2 -E "Smakenland(Scherm|Pagina)" || true
  # Een ANR-venster van een systeemproces wegtikken voordat we fotograferen.
  for _ in $(seq 1 4); do
    focus="$(adb shell dumpsys window 2>/dev/null | grep -m1 mCurrentFocus || true)"
    case "$focus" in
      *esponding*|*ANR*)
        size="$(adb shell wm size 2>/dev/null | sed -n 's/.*: \([0-9]*\)x\([0-9]*\).*/\1 \2/p' | tail -1)"
        breedte="${size%% *}"; hoogte="${size##* }"
        if [ -n "$breedte" ] && [ -n "$hoogte" ]; then
          adb shell input tap $((breedte * 30 / 100)) $((hoogte * 54 / 100)) || true
        fi
        sleep 4 ;;
      *) break ;;
    esac
  done
  sleep 4
}

start_en_wacht "levels" "SmakenlandScherm=kaart"
adb exec-out screencap -p > scherm-kaart.png 2>/dev/null || true

start_en_wacht "level1" "SmakenlandScherm=level"
adb exec-out screencap -p > scherm-level.png 2>/dev/null || true

# De maat van het bord die de pagina zelf meldt. Op een oude WebView (Android 11)
# kende CSS `aspect-ratio` nog niet en klapte het bord in tot één rij. De meting
# gebeurt hier, met het levelscherm in beeld: op een verborgen tab is de hoogte nul
# en dan meet je niets.
bord_maat="$(adb logcat -d | grep -o 'SmakenlandBord=7x8 hoogte=[0-9]* tegel=[0-9]*' | tail -1 || true)"
echo "bord:   ${bord_maat:-niets gemeld}"
bord_hoogte="$(echo "$bord_maat" | sed -n 's/.*hoogte=\([0-9]*\).*/\1/p')"
bord_tegel="$(echo "$bord_maat" | sed -n 's/.*tegel=\([0-9]*\).*/\1/p')"
if [ -z "$bord_hoogte" ] || [ "$bord_hoogte" -lt $(( bord_tegel * 7 )) ]; then
  echo "::error::het bord is maar ${bord_hoogte:-0} px hoog; het klapt in op dit toestel"
  exit 1
fi

start_en_wacht "sudoku" "SmakenlandScherm=sudoku"
adb exec-out screencap -p > scherm-sudoku.png 2>/dev/null || true

# En het sudokubord: dat moet vierkant zijn, ook zonder `aspect-ratio`.
sudoku_maat="$(adb logcat -d | grep -o 'SmakenlandSudoku maat=9x9 breedte=[0-9]* hoogte=[0-9]* tegel=[0-9]* cijfers=[0-9]*' | tail -1 || true)"
echo "sudoku: ${sudoku_maat:-niets gemeld}"
sud_breedte="$(echo "$sudoku_maat" | sed -n 's/.*breedte=\([0-9]*\).*/\1/p')"
sud_hoogte="$(echo "$sudoku_maat" | sed -n 's/.*hoogte=\([0-9]*\).*/\1/p')"
if [ -z "$sud_hoogte" ] || [ "$sud_hoogte" -lt 200 ]; then
  echo "::error::het sudokubord is maar ${sud_hoogte:-0} px hoog; het klapt in op dit toestel"
  exit 1
fi
if [ $(( sud_hoogte > sud_breedte ? sud_hoogte - sud_breedte : sud_breedte - sud_hoogte )) -gt 4 ]; then
  echo "::error::het sudokubord is niet vierkant: ${sud_breedte}x${sud_hoogte}"
  exit 1
fi
sud_cijfers="$(echo "$sudoku_maat" | sed -n 's/.*cijfers=\([0-9]*\).*/\1/p')"
if [ -z "$sud_cijfers" ] || [ "$sud_cijfers" -lt 20 ]; then
  echo "::error::het sudokubord toont geen opgave (${sud_cijfers:-0} cijfers)"
  exit 1
fi

# En de grootste maat op het toestel: 16x16 met letters. Dat is het scherm waar
# alles het krapst is (vakjes van nog geen 20 pixels), dus een eigen foto en een
# eigen controle. De app opent die maat via de diepe link #sudoku16.
start_en_wacht "sudoku16" "SmakenlandScherm=sudoku"
adb exec-out screencap -p > scherm-sudoku16.png 2>/dev/null || true
maat16="$(adb logcat -d | grep -o 'SmakenlandSudoku maat=16x16 breedte=[0-9]* hoogte=[0-9]* tegel=[0-9]* cijfers=[0-9]*' | tail -1 || true)"
echo "sudoku16: ${maat16:-niets gemeld}"
m16_hoogte="$(echo "$maat16" | sed -n 's/.*hoogte=\([0-9]*\).*/\1/p')"
m16_tegel="$(echo "$maat16" | sed -n 's/.*tegel=\([0-9]*\).*/\1/p')"
m16_cijfers="$(echo "$maat16" | sed -n 's/.*cijfers=\([0-9]*\).*/\1/p')"
if [ -z "$m16_hoogte" ] || [ "$m16_hoogte" -lt 200 ]; then
  echo "::error::het bord van 16x16 is maar ${m16_hoogte:-0} px hoog"
  exit 1
fi
if [ -z "$m16_cijfers" ] || [ "$m16_cijfers" -lt 80 ]; then
  echo "::error::het bord van 16x16 toont geen opgave (${m16_cijfers:-0} cijfers)"
  exit 1
fi
if [ -z "$m16_tegel" ] || [ "$m16_tegel" -lt 14 ]; then
  echo "::error::de vakjes van 16x16 zijn te klein om te tikken (${m16_tegel:-0} px)"
  exit 1
fi

# En het prestatiescherm: opent het, en staat het ook gevuld?
start_en_wacht "prestaties" "SmakenlandScherm=prestaties"
adb exec-out screencap -p > scherm-prestaties.png 2>/dev/null || true
prest="$(adb logcat -d | grep -o 'SmakenlandPrestaties behaald=[0-9]* van=[0-9]* kaartjes=[0-9]*' | tail -1 || true)"
echo "prestaties: ${prest:-niets gemeld}"
p_kaartjes="$(echo "$prest" | sed -n 's/.*kaartjes=\([0-9]*\).*/\1/p')"
p_totaal="$(echo "$prest" | sed -n 's/.*van=\([0-9]*\).*/\1/p')"
if [ -z "$p_kaartjes" ] || [ "$p_kaartjes" -lt 15 ]; then
  echo "::error::het prestatiescherm toont maar ${p_kaartjes:-0} kaartjes"
  exit 1
fi
if [ "$p_kaartjes" != "$p_totaal" ]; then
  echo "::error::er staan $p_kaartjes kaartjes maar er horen er $p_totaal te zijn"
  exit 1
fi

# Trillen en de energiemelding horen bij de schil. Het trillen is op een emulator
# niet te zien, maar de brug moet er wel zijn (de app meldt of het toestel een
# trilblokje heeft). De energiemelding: als het spel naar de achtergrond gaat,
# moet de app een wekker zetten, en bij terugkomst moet die weer af zijn.
tril="$(adb logcat -d | grep -o 'SmakenlandTril kan=[a-z]*' | tail -1 || true)"
echo "trillen: ${tril:-niets gemeld}"
if [ -z "$tril" ]; then
  echo "::error::de trilbrug meldt niets; de pagina kan het toestel dan niet laten trillen"
  exit 1
fi

adb shell input keyevent KEYCODE_HOME >/dev/null 2>&1 || true
sleep 6
# Let op: de energie kan inmiddels vol zijn (die vult zich per twaalf seconden aan),
# en dan is er geen wekker nodig. Waar het hier om gaat is dat de app op het
# weggaan reageert en dat de energiemelding geen fout oplevert.
if adb logcat -d | grep -q "SmakenlandEnergie"; then
  adb logcat -d | grep -m2 "SmakenlandEnergie" | sed 's/^/energie: /'
else
  echo "::error::de app reageerde niet op het naar de achtergrond gaan (energiemelding)"
  exit 1
fi
adb shell am start -n "$ACTIVITY" >/dev/null 2>&1 || true
sleep 6
if adb logcat -d | grep -q "SmakenlandEnergie aanwezig=true"; then
  echo "energie: bij terugkomst is de melding afgezegd"
else
  echo "::error::bij terugkomst is de energiemelding niet afgezegd"
  exit 1
fi

# De updatecontrole loopt op de achtergrond bij het starten van de app. Met netwerk
# hoort hier de eigen versie en wat GitHub zegt te staan; zonder netwerk een regel
# dat het niet lukte. Beide zijn goed — stilletjes niets doen is dat niet.
if adb logcat -d | grep -q "SmakenlandUpdate"; then
  adb logcat -d | grep -m3 "SmakenlandUpdate" | sed 's/^/update: /'
else
  echo "let op: de updatecontrole heeft niets gemeld (geen netwerk in de emulator?)"
fi

adb logcat -d > logcat-opstart.txt 2>/dev/null || true

for foto in scherm-kaart.png scherm-level.png scherm-sudoku.png scherm-sudoku16.png scherm-prestaties.png; do
  test -s "$foto" || { echo "::error::$foto ontbreekt"; exit 1; }
done

python3 - <<'PY'
import pathlib
import struct
for naam in ('scherm-kaart.png', 'scherm-level.png', 'scherm-sudoku.png', 'scherm-sudoku16.png', 'scherm-prestaties.png'):
    data = pathlib.Path(naam).read_bytes()
    breedte, hoogte = struct.unpack('>II', data[16:24])
    assert breedte > 400 and hoogte > 600, (naam, breedte, hoogte)
    print(f'{naam}: {breedte}x{hoogte}')
PY

echo "smoketest klaar: de bundel laadt en alle vijf de schermen openen"
