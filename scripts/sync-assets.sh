#!/usr/bin/env bash
# Kopieert de webapp naar de bundel van de Android-app.
#
# De pagina verwacht de bestanden naast zich (index.html staat in dezelfde map):
#   android/app/src/main/assets/www/index.html
#   android/app/src/main/assets/www/icons/icon-192.png
#
# Gebruik: bash scripts/sync-assets.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/android/app/src/main/assets/www"

BESTANDEN=(
  index.html styles.css content.js art.js levels.js engine.js sudoku.js sudokus.js app.js sudoku-view.js
  sw.js manifest.webmanifest
)
ICONEN=(icons/icon-192.png icons/icon-512.png icons/icon-512-maskable.png)

rm -rf "$DEST"
mkdir -p "$DEST/icons"

for f in "${BESTANDEN[@]}"; do
  cp "$ROOT/$f" "$DEST/$f"
done
for f in "${ICONEN[@]}"; do
  cp "$ROOT/$f" "$DEST/$f"
done

# Alles moet er echt staan en niet leeg zijn; een stille overslag betekent een app
# die niet werkt terwijl de bouw groen is.
for f in "${BESTANDEN[@]}" "${ICONEN[@]}"; do
  if [ ! -s "$DEST/$f" ]; then echo "ontbreekt of is leeg: $DEST/$f" >&2; exit 1; fi
done

# Controle dat de pagina al zijn scripts bij zich heeft (een nieuw script dat niet
# in dit lijstje staat zou stil ontbreken in de app).
for src in $(grep -o 'src="[^"]*\.js"' "$DEST/index.html" | sed 's/src="//; s/"//'); do
  if [ ! -s "$DEST/$src" ]; then echo "script uit index.html ontbreekt in de bundel: $src" >&2; exit 1; fi
done

echo "webapp gekopieerd naar $DEST"
du -sh "$DEST"
