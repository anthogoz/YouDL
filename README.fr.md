# 📥 YouDL

> 🇬🇧 [English](README.md)

YouDL est une extension navigateur minimaliste et puissante qui sert d'**interface graphique pour [yt-dlp](https://github.com/yt-dlp/yt-dlp)**. Elle permet de télécharger des médias depuis **n'importe quel site** (YouTube, SoundCloud, Twitter, Instagram, TikTok, et 1000+ autres) directement en Audio (MP3) ou Vidéo (MP4).

## ✨ Fonctionnalités

- **Compatibilité universelle** : Supporte tous les sites supportés par `yt-dlp`.
- **Aperçu dynamique** : Récupère automatiquement les miniatures, titres et durées.
- **Sélection de qualité** : Choisissez entre MP3 haute qualité ou résolutions vidéo (1080p, 720p).
- **Interface premium** : Design Glassmorphism moderne avec des animations fluides.
- **Trimmer Avancé** : Découpage sans perte (`-c copy`) avec interface pro, waveform interactive, visualiseur vinyle pour l'audio, timecodes éditables et aimant magnétique.
- **Paramètres personnalisés** : Modifiez votre dossier de téléchargement ou importez des fichiers multimédias locaux pour les découper via l'explorateur Windows natif.
- **Intégration native** : Fonctionne directement depuis la barre d'outils du navigateur.
- **Rapide et fiable** : Exploite la puissance de `yt-dlp` en backend.

## 🛠️ Installation

### 1. Prérequis

L'outil nécessite **Python** et **FFmpeg** installés sur votre PC :

- **Python 3.10+** — [python.org](https://www.python.org/downloads/) (cochez **« Ajouter Python au PATH »** pendant l'installation)
- **FFmpeg** — [ffmpeg.org](https://ffmpeg.org/download.html) ou installez via le terminal :
  ```
  winget install ffmpeg
  ```

### 2. Télécharger YouDL

1. Allez sur la page des [**Releases**](https://github.com/anthogoz/YouDL/releases/latest).
2. Téléchargez le dernier **`YouDL-vX.X.X-chrome.zip`** (ou `firefox` pour Firefox).
3. Extrayez le zip n'importe où sur votre PC.

### 3. Installer l'extension

1. Ouvrez votre navigateur (Chrome, Brave, Edge, etc.).
2. Allez sur `chrome://extensions` (ou `brave://extensions`, `edge://extensions`).
3. Activez le **« Mode développeur »** (en haut à droite).
4. Cliquez sur **« Charger l'extension non empaquetée »**.
5. Sélectionnez le dossier **`extension`** dans le zip extrait.

### 4. Enregistrer l'hôte natif

1. Sur la page des extensions, trouvez **YouDL** et copiez son **ID** (ex : `dfegdbmppdkmaif...`).
2. Ouvrez le dossier **`host`** du zip extrait.
3. Double-cliquez sur **`install_host.bat`**.
4. Collez l'ID de l'extension quand demandé et appuyez sur Entrée.

> ✅ C'est fait ! YouDL est prêt à l'emploi.

---

## 🚀 Utilisation

1. Allez sur n'importe quel site supporté (YouTube, SoundCloud, etc.).
2. Cliquez sur l'icône **YouDL** dans la barre d'outils de votre navigateur.
3. Choisissez **« Download MP3 »** ou **« Download MP4 »**.
4. Vos fichiers seront sauvegardés dans `Téléchargements/YouDL/`.

---

## 🏗️ Développement

```bash
# Installer les dépendances
npm install

# Mode développement (avec HMR)
npm run dev

# Build de production
npm run build            # Chrome
npm run build:firefox    # Firefox

# Lint & format
npm run lint
npm run format
```

---

*Fait avec ❤️ par [anthogoz](https://github.com/anthogoz)*
