# homeTro HM1 — protocole BLE (FTMS), confirmé au scan

Scan nRF Connect du `FS-8B1D77` (= homeTro HM1) :
- Device : LE only, name `FS-8B1D77`, MAC `7F:F4:CD:C1:25:F8`.
- **Complete list of 16-bit Service UUIDs : `0xFFF0, 0x1826`**.
- **Service Data `0x1826` = `0x010001`** → flags=dispo, Fitness Machine Type = `0x0001` (Treadmill).
- `FS-` = module **FitShow** (rebrand générique). `0xFFF0` = protocole FitShow proprio (fallback).

→ On utilise le **standard FTMS `0x1826`** (ouvert, pas de premium FitShow).

## FTMS — ce qu'on utilise
- Service **`0x1826`**.
- **Treadmill Data `0x2ACD`** (notify) : uint16 flags + champs (voir `ftms-core.js parseTreadmillData`).
  - bit0 "More Data" = 0 → **Instantaneous Speed** présent (uint16, 0.01 km/h).
  - bit2 distance (uint24 m), bit3 inclinaison (sint16 0.1% + ramp angle), bit7 énergie
    (total kcal uint16 + par heure + par minute), bit8 FC (uint8), bit10 temps écoulé (uint16 s).
- **Control Point `0x2AD9`** (write) : `0x00` Request Control, `0x07` Start, `0x08 0x01` Stop,
  `0x02 <uint16 0.01km/h>` Set Speed, `0x03 <sint16 0.1%>` Set Inclination.
  Réponse : `[0x80, requestOp, result]` (result `0x01` = succès).
- (Option) **Machine Status `0x2ADA`** (notify) : changements d'état machine.

## À vérifier sur le vrai HM1
- Le Control Point `0x2AD9` est-il **inscriptible** ? (annonce FTMS = bon signe ; sinon lecture seule).
- Le tapis rapporte-t-il l'inclinaison dans `0x2ACD` ? (probablement non — pente mécanique →
  on la gère côté app via `incline.js`).
- Les **2 angles d'inclinaison physiques réels** (pour calibrer `DEFAULT_POSITIONS`).

## Compatibilité
Web Bluetooth → Chrome Android/desktop. Pas iOS. HTTPS requis. Une seule connexion à la fois
(fermer FitShow). Premier diagnostic : se connecter via l'app (bouton), vérifier que les trames
`0x2ACD` arrivent et qu'un Start `0x2AD9` est accepté.

## Sources
- Scan nRF Connect (ce device). FTMS spec (`0x1826/0x2ACD/0x2AD9`).
- FitShow fallback : `github.com/tyge68/fitshow-treadmill` (service `0xFFF0`, `[0x02 … XOR 0x03]`).
