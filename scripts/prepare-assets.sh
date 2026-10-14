#!/usr/bin/env bash
set -euo pipefail
# Run from repository root; requires cwebp (brew install webp).
mkdir -p packages/client/public/art
convert_art() {
  cwebp -quiet -q 82 -resize "$3" 0 "assets/picture/$1" -o "packages/client/public/art/$2.webp"
}
# Transparent art carries wide margins; crop to the drawn subject (x y w h) before resizing.
convert_cropped() {
  cwebp -quiet -q 86 -alpha_q 90 -crop $3 -resize "$4" 0 "assets/picture/$1" -o "packages/client/public/art/$2.webp"
}
convert_art harbor_with_cthulhu_16-9.png harbor 1920
convert_art harbor_with_people_16_9.png harbor-warm 1600
convert_art cult_cards/cult_card_back.png secret 480
convert_art cult_cards/cult_card_face_infect.png ritual 480
convert_art cult_cards/cult_card_face_guns.png ritual-guns 480
convert_art cult_cards/cult_card_face_detect.png ritual-detect 480
convert_art navigation_cards/navigation_card_back.png nav-back 480
convert_art navigation_cards/navigation_card_face_location_east.png nav-east 480
convert_art navigation_cards/navigation_card_face_location_west.png nav-west 480
convert_art navigation_cards/navigation_card_face_location_north.png nav-north 480
convert_cropped navigation_cards/navigation_card_back_element_ship.png ship "226 80 797 1093" 200
convert_cropped navigation_cards/navigation_card_face_element_compass.png compass "185 46 882 1087" 120
convert_cropped items_cards/items_capital.png captain "128 154 999 997" 120
convert_cropped items_cards/items_chief_officer.png mate "173 112 894 977" 120
convert_cropped items_cards/items_handgun.png gun "138 235 1269 712" 160
convert_cropped items_cards/items_detect.png detect "216 104 749 1084" 96
convert_cropped items_cards/items_lash.png lash "121 78 1043 1105" 96
convert_cropped items_cards/items_knife.png knife "27 8 1022 1045" 96
convert_cropped items_cards/items_rest.png rest "256 254 738 642" 96
convert_cropped id_cards/id_card_good.png id-sailor "1 1 649 922" 320
convert_cropped id_cards/id_card_bad.png id-pirate "11 12 661 755" 320
convert_cropped id_cards/id_card_cult.png id-cult "267 25 936 866" 360
