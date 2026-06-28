# 🔄 CONTEXT_RECOVERY — treadmill

## 🎯 État actuel
PWA (vanilla JS, Web Bluetooth) qui pilote le tapis de marche **homeTro HM1** au **standard
FTMS** (`0x1826`, confirmé au scan nRF) — **sans l'app FitShow ni son abonnement**. Validée
sur le vrai tapis (28/06) : km/h correct, start/stop/±/contrôle FTMS `0x2AD9` OK. Repo privé
**github.com/TheFSilver/treadmill**. Même ADN que [[resonance]] / [[fittrack]] (core découplé,
deps injectées, **behavioral-TDD**, déploiement Cloudflare Pages). **16 fichiers de tests verts.**

## ⚙️ Lancer / tester
```bash
cd web && for t in test-*.mjs; do node "$t"; done   # 16 fichiers (Node, zéro dépendance)
cd web && python3 -m http.server 8000               # démo locale → Chrome → bouton "Démo"
```
Android/Chrome only (Web Bluetooth, pas iOS). HTTPS requis (sauf localhost). **1 seule
connexion BLE** → fermer l'app FitShow avant de connecter.

## 🧱 Architecture (web/)
- `ftms-core.js` — parse Treadmill Data `0x2ACD` + commandes Control Point `0x2AD9`. Pur, testé.
- `ftms-ble.js` — adaptateur Web Bluetooth tapis. Reconnexion sans sélecteur via `getDevices()`.
- `incline.js` — **l'edge** : calories ACSM (pente + poids), grade-adjusted pace/distance, METs.
  Angles réels HM1 : Position 1 ≈ **1°**, Position 2 ≈ **4°** (manuel ; pente % via tan()).
- `session.js` — cerveau séance : stats live (durée, distance, calories, **pas/cadence**, vitesse
  moy/max), zones FC (synergie H10), programmes par segments. Durée segment en **secondes**
  (`segDurationSec`, rétrocompat `minutes`). `summary()` enregistre l'inclinaison (inclineDeg/grade).
- `workouts.js` — catalogue. `ensureSeeded()` sème les 4 séances structurées comme **séances
  éditables** au 1er run (Desk walk, Fat burn, Intervalles, **Japanese Walking IWT**). "Marche
  libre" = seul défaut permanent. CRUD custom (saveCustom/loadCustom/deleteCustom).
- `settings.js` — poids (synergie fittrack), FC max, 2 angles d'inclinaison, objectif quotidien km.
- `wakelock.js` — écran reste allumé en séance. `simulator.js` — tapis FTMS synthétique (démo/tests).
- `streak.js` / `trend.js` — habit layer (streak quotidien, historique, `todayTotals`).
- `ui.js` — machine à états + tout le câblage. `app.js` — plug navigateur. `sw.js` — offline + Web Push.
- **DRY portfolio** : `web-ble`, `h10-core`, `dropdown`, `streak`, `trend`, `notify`, `push-*`
  réutilisés/synchronisés avec resonance.

## 🖥️ Machine à états (ui.js)
`idle → ready → active ⇄ paused → summary` (+ `workouts`, `builder`, `settings`, `history`, `detail`).
- **idle** : Connecter / H10 / Démo.
- **ready** : dropdown programme, sélecteur **inclinaison (choisie au lancement, fixe)**, Démarrer,
  objectif du jour, Gérer mes séances, Historique, Réglages.
- **active** : stats live + barre de progression (temps restant + prochain palier) + vitesse
  quick-sets 2/4/6/8 + fin ±0,1 + Pause/Stop. Inclinaison affichée read-only.
- **paused** : Reprendre/Stop. **summary** : récap complet retenu, tapis reste connecté.
- **workouts** : liste unifiée (= dropdown), modifier/supprimer (sauf Marche libre). **builder** :
  nom + segments (min:s, type effort/récup/échauffement, durée totale, cap 60 min).
- **history** : liste cliquable → **detail** (toutes stats), 🗑 supprime. Retour partout.

## ✅ Décisions / validations clés
- Inclinaison **manuelle** → choisie avant le run, fixe, enregistrée dans les stats.
- **Vitesse 1-8 km/h**, durée segment **1 s → 60 min**, **total ≤ 60 min** (le tapis s'arrête à 60).
  Saisie clavier clampée (86→8, 0→1 s).
- **Refresh** : Web Bluetooth **ne survit pas** à un reload (limite navigateur). Mitigation :
  reconnexion **1-tap sans sélecteur** (getDevices) + retour à la **dernière page** (saveScreen/lastScreen)
  + tentative auto au chargement si appareil déjà autorisé.
- **Japanese Walking (IWT)** : protocole en **intensité** (rapide ~70% / RPE 6-7 / zone FC 4 ;
  lent ~40% / zone 2), pas en km/h. Défaut 7,5/3,5 km/h ; viser les zones FC avec le H10.

## 📋 Prochaines étapes
1. **Déployer** Cloudflare Pages (output dir `web`, HTTPS) → installer en PWA Android.
2. Brancher le **poids réel** auto depuis fittrack (pour l'instant saisie manuelle dans Réglages).
3. (Option) Web Push quotidien via le worker resonance (mutualisable) ; export CSV/Apple Health ;
   sparkline tendances dans l'historique ; ECG/ACC brut via service PMD (voir PROTOCOL.md).

## 🔌 Synergies portfolio
H10/resonance → zones FC live · fittrack → poids → calories justes · streak/objectif partagés
(1 flywheel d'habitude across les 3 PWA biométriques).

## Phrase magique pour reprendre
« Reprise treadmill : lis CONTEXT_RECOVERY.md, lance les tests (16 verts), on en est à déployer Cloudflare Pages / brancher le poids fittrack. »
