# 🔄 CONTEXT_RECOVERY — treadmill

## 🎯 État actuel
PWA pour piloter le tapis **homeTro HM1** via **FTMS** (`0x1826`, confirmé au scan) **sans
FitShow ni abonnement**. Bat les features premium FitShow + l'inclinaison qu'il ignore.
Stack identique à `resonance`/`fittrack`. **13 fichiers de tests comportementaux verts.**
Repo privé `github.com/TheFSilver/treadmill`.

## ✅ Fait
- `ftms-core.js` — parse Treadmill Data `0x2ACD` + commandes Control Point `0x2AD9`. Testé.
- `incline.js` — **l'edge** : calories ACSM (pente + poids), grade-adjusted pace/distance, METs.
- `session.js` — cerveau : stats live, zones FC (synergie H10), programmes (fat burn/intervalles/desk).
- `ftms-ble.js` — adaptateur Web Bluetooth tapis (request control + start/stop/speed/incline).
- `ui.js` — stats live, sélecteur d'inclinaison, dropdown programmes, contrôles contextuels, mode démo.
- `simulator.js` — tapis FTMS synthétique (+ HR). Coquille PWA (index/app/sw module/manifest/icon).
- **DRY** : `web-ble`, `h10-core`, `dropdown`, `streak`, `trend`, `notify`, `push-*` réutilisés de resonance.
- Tests : ftms-core, incline, ftms-ble, session, boot/intégration (end-to-end + inclinaison +
  contrôle programme + lecture-seule) + tous les modules partagés.

## 📋 Prochaines étapes (au matériel)
1. **Tester le vrai HM1** : connecter (Chrome Android, fermer FitShow). Vérifier que les trames
   `0x2ACD` arrivent et qu'un **Start `0x2AD9`** est accepté (sinon lecture seule = stats OK quand même).
   ⚠️ **Vérifier l'UNITÉ vitesse** : tapis à 5 mph (son écran) → l'app doit afficher **~8 km/h**.
   Si ~5 → le module envoie du mph brut → ajouter flag conversion mph→km/h dans `ftms-core`.
2. **Inclinaison calibrée depuis le manuel** : Position 1 ≈ **1°**, Position 2 ≈ **4°** (dans
   `incline.js`, stockées en degrés, pente via tan). À reconfirmer sur le matériel ("about").
3. **Synergie poids** : brancher le poids depuis fittrack (pour l'instant `loadPref('weightKg', 80)`).
4. **Déployer** Cloudflare Pages (output `web`, HTTPS) → PWA Android.
5. (Option) Web Push quotidien via le worker resonance (mutualisable) ; parcours virtuels ; export.

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
