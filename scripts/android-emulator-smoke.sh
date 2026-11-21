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

start_en_wacht "sudoku" "SmakenlandScherm=sudoku"
adb exec-out screencap -p > scherm-sudoku.png 2>/dev/null || true

adb logcat -d > logcat-opstart.txt 2>/dev/null || true

for foto in scherm-kaart.png scherm-level.png scherm-sudoku.png; do
  test -s "$foto" || { echo "::error::$foto ontbreekt"; exit 1; }
done

python3 - <<'PY'
import pathlib
import struct
for naam in ('scherm-kaart.png', 'scherm-level.png', 'scherm-sudoku.png'):
    data = pathlib.Path(naam).read_bytes()
    breedte, hoogte = struct.unpack('>II', data[16:24])
    assert breedte > 400 and hoogte > 600, (naam, breedte, hoogte)
    print(f'{naam}: {breedte}x{hoogte}')
PY

echo "smoketest klaar: de bundel laadt en alle drie de schermen openen"
