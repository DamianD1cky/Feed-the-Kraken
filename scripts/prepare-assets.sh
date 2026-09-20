#!/usr/bin/env bash
set -euo pipefail
# Run from repository root; requires cwebp (brew install webp).
mkdir -p packages/client/public/art
convert_art() {
  cwebp -quiet -q 82 -resize "$3" 0 "assets/picture/$1" -o "packages/client/public/art/$2.webp"
}
convert_art harbor_with_cthulhu_16-9.png harbor 1920
convert_art harbor_with_people_16_9.png harbor-warm 1600
convert_art cult_cards/cult_card_back_side.png secret 480
convert_art items_cards/items_capital.png captain 160
convert_art items_cards/items_chief_officer.png mate 160
convert_art items_cards/items_handgun.png gun 160
convert_art cult_cards/cult_card_front_side_infect.png ritual 480
