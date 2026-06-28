# 🔄 CONTEXT_RECOVERY — treadmill

## 🎯 État actuel
PWA pour piloter le tapis **homeTro HM1** via **FTMS** (`0x1826`, confirmé au scan) **sans
FitShow ni abonnement**. Bat les features premium FitShow + l'inclinaison qu'il ignore.
Stack identique à `resonance`/`fittrack`. **13 fichiers de tests comportementaux verts.**
Repo privé `github.com/TheFSilver/treadmill`.

## ✅ Fait — vérifié sur le VRAI tapis (28/06) : km/h OK, start/stop/±/contrôle FTMS OK
- `ftms-core.js` — parse Treadmill Data `0x2ACD` + Control Point `0x2AD9`. Testé.
- `incline.js` — **l'edge** : calories ACSM (pente + poids), grade-adjusted, METs. Angles réels 1°/4° (manuel).
- `session.js` — cerveau : stats live + **vitesse max, pas/cadence, vitesse moy**, zones FC (H10), programmes.
- `workouts.js` — catalogue : built-ins (free/deskwalk/fatburn/intervalles/**Japanese Walking IWT**) + **séances custom** persistées (CRUD).
- `ftms-ble.js` — adaptateur Web Bluetooth tapis (request control + start/stop/speed/incline).
- `ui.js` — **MACHINE À ÉTATS** idle→ready→active→summary : connexion ne lance PAS le chrono ;
  Stop → **écran récap stats retenues** sans déconnecter ; vitesse **quick-sets 2/4/6/8 + fin ±0,1** ;
  **historique** ; **créateur de séances**. L'inclinaison HM1 = mécanique (boutons = calcul seul, pas de commande belt).
- `simulator.js` — tapis FTMS synthétique (+ HR). Coquille PWA premium (grille stats, barres de zones).
- **DRY** : `web-ble`, `h10-core`, `dropdown` (gagne `setItems`), `streak`, `trend`, `notify`, `push-*` réutilisés/synchronisés avec resonance.
- **14 fichiers de tests verts**, dont boot/intégration prouvant les 5 fixes (chrono, vitesse, rétention stats, Japanese, custom).

## 📋 Prochaines étapes
1. ✅ Vrai HM1 validé : **km/h correct**, **start/stop/±/contrôle FTMS `0x2AD9` OK** (28/06).
2. **Calibrage fin inclinaison** : angles 1°/4° du manuel ("about") — affiner si besoin sur le matériel.
3. **Synergie poids** : brancher le poids réel depuis fittrack (pour l'instant `loadPref('weightKg', 80)` —
   idée : store partagé entre les 3 PWA, ou saisie manuelle dans un écran réglages).
4. **Déployer** Cloudflare Pages (output `web`, HTTPS) → PWA Android, installer.
5. **UI builder** : le créateur de séances expose `addCustomWorkout()` + un form minimal (nom + segments) ;
   enrichir l'édition des segments (inputs minutes/vitesse par ligne) si besoin.
6. (Option) Web Push quotidien via le worker resonance (mutualisable) ; parcours virtuels ; export CSV/Health ;
   écran réglages (poids, FC max, calibrage angles) ; sparkline tendances dans l'historique.

## ⚙️ Commandes
```bash
cd web && for t in test-*.mjs; do node "$t"; done   # 13 fichiers
cd web && python3 -m http.server 8000               # démo (bouton "Démo", sans tapis)
```

## 🧠 Règles
**DRY portfolio** (modules partagés avec resonance/fittrack, ne pas dupliquer). **Behavioral-TDD**
(boot/câblage/stats end-to-end/inclinaison→calories/programme→vitesse). Android/Chrome only.

## Phrase magique pour reprendre
« Reprise treadmill : lis CONTEXT_RECOVERY.md, lance les tests, on en est à tester le vrai HM1 + calibrer l'inclinaison. »
