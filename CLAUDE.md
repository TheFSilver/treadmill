# CLAUDE.md — treadmill

PWA pour piloter le tapis **homeTro HM1** (FTMS, `0x1826`) **sans FitShow ni abonnement**.
Stack/conventions identiques à `resonance` et `fittrack` (PWA vanilla JS + Web Bluetooth +
core découplé + **behavioral-TDD** + déploiement Cloudflare Pages).

## État
- `web/` = app complète, **TDD-first sur le comportement**. 13 fichiers de tests `.mjs` verts.
- FTMS confirmé au scan nRF (services `0xFFF0, 0x1826`). On utilise le standard `0x1826`.
- Pas encore testé sur le vrai HM1 ; `ftms-core` + `ftms-ble` prêts/testés sur simulateur.

## Règles
- **DRY portfolio** : `web-ble.js`, `h10-core.js`, `dropdown.js`, `streak.js`, `trend.js`,
  `notify.js`, `push-*.js` sont **réutilisés tels quels** depuis resonance — ne pas dupliquer la
  logique ; si un de ces modules évolue, le faire au même endroit et recopier.
- **Behavioral-TDD** : chaque test prouve que l'app marche (boot, câblage, stats end-to-end,
  inclinaison→calories, programme→vitesse cible, lecture-seule gracieuse).
- Core découplé + deps injectées (bluetooth, session, simulator, scheduler) → testable sans matériel.
- **Android/Chrome only** (Web Bluetooth). Fermer FitShow (1 seule connexion BLE).

## Edge vs FitShow
- Inclinaison comptée (`incline.js`, ACSM grade-adjusted + poids) — FitShow l'ignore.
- Zones FC via H10 (synergie resonance). Calories vraies via poids (synergie fittrack).
- Programmes (séances/plans) + analytics gratuits.

## Commandes
```bash
cd web && for t in test-*.mjs; do node "$t"; done
cd web && python3 -m http.server 8000   # démo (bouton "Démo")
```

## À calibrer sur le vrai matériel
- Les 2 angles d'inclinaison réels (`incline.js` DEFAULT_POSITIONS, défauts 3%/6%).
- Confirmer que le Control Point `0x2AD9` accepte l'écriture (sinon lecture seule).
