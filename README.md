# 🏃 Treadmill — homeTro HM1 libre

Pilote ton tapis **homeTro HM1** (et tout tapis **FTMS**) **sans l'app FitShow, sans abonnement, sans lock** — 100 % dans ton navigateur. Toutes les features "premium" de FitShow, gratuites, **plus** ce que FitShow ne fait pas.

> Le HM1 annonce le **standard Bluetooth FiTness Machine Service (`0x1826`)** (confirmé au scan nRF Connect : `0xFFF0, 0x1826`). On le contrôle donc au standard ouvert — zéro reverse-engineering.

## Ce que ça fait — et bat FitShow
- **Connexion FTMS** (Web Bluetooth) : lit vitesse / distance / temps / énergie ; envoie start/stop/vitesse/inclinaison (Control Point `0x2AD9`).
- **Inclinaison comptée** (le dead-angle FitShow) : sélecteur 2 positions → **calories & pace grade-adjusted** (formule ACSM, pente réelle **+ ton poids**).
- **Calories vraies** (poids corporel — synergie fittrack), pas la valeur "à plat" générique.
- **Zones de FC** : connecte un **Polar H10** (stack resonance) → marche en zone (Z1–Z5), FC moyenne/pic. FitShow ne fait pas ça.
- **Programmes** (= "séances custom" + "plans" premium FitShow, gratuits) : fat burn, intervalles, desk walk… pilotent la vitesse cible automatiquement.
- **Analytics** (METs, grade-adjusted) sans paywall.
- **Habit layer partagé** (streak + trend + notify) avec fittrack/resonance : 1 flywheel pour toutes les modalités.
- **Installable** (PWA), **offline**, **mode Démo** (simulateur FTMS) pour tourner sans le tapis.

## ⚠️ Compatibilité
**Web Bluetooth → Chrome (Android ou desktop).** Pas iOS. HTTPS requis (sauf localhost). Une seule connexion BLE à la fois → **fermer l'app FitShow** avant.

## Lancer en local
```bash
cd web && python3 -m http.server 8000   # Chrome → bouton "Démo" (sans le tapis)
```

## Tests
```bash
cd web && for t in test-*.mjs; do node "$t"; done   # behavioral-TDD, pur Node
```

## Architecture (core découplé, deps injectées, DRY portfolio)
- `ftms-core.js` — parse Treadmill Data `0x2ACD` + commandes Control Point `0x2AD9`. **Pur, testé.**
- `incline.js` — calories ACSM (pente + poids) + grade-adjusted pace/distance + METs. **L'edge.**
- `session.js` — cerveau séance : stats live, zones FC, programmes (segments). **Pur, testé.**
- `ftms-ble.js` — adaptateur Web Bluetooth tapis (`navigator.bluetooth` injectable).
- `simulator.js` — tapis FTMS synthétique (démo + tests sans matériel).
- `ui.js` — câblage DOM + `render()` unique (visibilité contextuelle). `app.js` = plug.
- **Réutilisés tels quels** (DRY) de resonance/fittrack : `web-ble.js` + `h10-core.js` (HR),
  `dropdown.js`, `streak.js`, `trend.js`, `notify.js`, `push-*.js`.

## Statut
App complète FTMS + inclinaison + zones FC + programmes. **13 fichiers de tests comportementaux verts** sur simulateur. Reste : tester le **vrai HM1** (1er pas : connecter, vérifier l'écriture Control Point `0x2AD9` ; sinon lecture seule + stats justes), calibrer les **2 angles d'inclinaison** réels, déployer Cloudflare Pages. Voir `CONTEXT_RECOVERY.md`.

## Confidentialité
Tout reste sur l'appareil. Aucun serveur, aucun compte, aucun traceur.
