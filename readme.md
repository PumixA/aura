# Aura (Mirroir connecté)

**Auteur** : Melvin Delorme (Projet démarré en septembre 2024, en cours jusqu'à aujourd'hui)  
**Statut** : En développement  
**Objectif** : Concevoir un miroir tactile connecté fonctionnant sur Raspberry Pi 3B+ avec un écran 1080x1920 et une base Django/PostgreSQL.

---

## Sommaire

1. [Présentation](#présentation)
2. [Fonctionnalités](#fonctionnalités)
3. [Installation & Configuration](#installation--configuration)
   - [1) Récupérer le projet](#1-récupérer-le-projet)
   - [2) Créer un environnement virtuel](#2-créer-un-environnement-virtuel)
   - [3) Installer les dépendances](#3-installer-les-dépendances)
   - [4) Configurer la base de données](#4-configurer-la-base-de-données)
   - [5) Logiciels nécéssaires](#5-logiciels)
   - [5) Migrations et lancement](#5-migrations-et-lancement)
4. [Utilisation spécifique au Raspberry Pi](#utilisation-spécifique-au-raspberry-pi)
5. [Crédits](#crédits)
6. [Licence](#licence)

---

## Présentation

Ce projet **Django** utilise une base de données **PostgreSQL** pour stocker les informations. Il est spécialement conçu pour tourner sur un **Raspberry Pi 3B+** (ou supérieur) avec un écran de résolution **1080x1920** (format vertical, idéal pour un miroir connecté).

- Date de début : **Septembre 2024**
- État actuel : **En cours de développement**
- Système cible : **Linux** (Raspberry Pi OS), mais fonctionne également sous **Windows** et **Mac** pour du développement ou des tests.

---

## Fonctionnalités

- **Gestion de widgets** (météo, musique, heure, etc.)
- **Contrôle des LEDs** (luminosité, animation, personnalisation)
- **Interface Django** pour la configuration et la visualisation
- **Architecture modulaire** pour ajouter de nouvelles briques logicielles

---

## Installation & Configuration

Cette section explique comment récupérer le projet, puis l’installer et le configurer.  
Les **commandes** peuvent varier légèrement selon ton système (Windows, Linux, Mac), nous allons détailler au mieux.

### 1) Récupérer le projet

Assure-toi d’avoir **Git** installé. Puis :

```bash
# Cloner le dépôt depuis GitHub ou autre plateforme
git clone https://github.com/PumixA/aura.git

# Se rendre dans le répertoire cloné
cd aura

# Passer sur la branche main (branche principale à jour)
git checkout main
```

> **Note** : Si tu es déjà sur `main`, cette étape n’est pas nécessaire.

### 2) Créer un environnement virtuel

Il est recommandé d’utiliser un **environnement virtuel** pour isoler les dépendances.

- **Sous Windows** (dans PowerShell ou cmd) :
  ```bash
  python -m venv venv
  venv\Scripts\activate
  ```

- **Sous Linux / Mac** :
  ```bash
  python3 -m venv venv
  source venv/bin/activate
  ```

### 3) Installer les dépendances

Une fois l’environnement virtuel activé, il faut aller dans le fichier `requirements.txt`, décommenter les lignes specifiques a votre os, et commenter les autres. Ensuite, installe les dépendances listées :

```bash
pip install -r requirements.txt
```

### 4) Configurer la base de données

Le projet utilise **PostgreSQL**. Assure-toi d’avoir :
1. **Installé PostgreSQL** (via `apt`, `brew`, `yum`, etc.).
2. Créé un **utilisateur** et une **base** de données.
Configuré un fichier `.env` au même niveau que `manage.py`, avec :
   ```
   DB_NAME=ma_bdd
   DB_USER=ton_user
   DB_PASSWORD=ton_password
   DB_HOST=localhost
   DB_PORT=5432
   ```

Assure-toi que le fichier `settings.py` (dans `aura/`) lit bien ces variables via `python-decouple`.

### 5) Logiciel nécéssaires

Si tu n'as pas [firefox](https://www.mozilla.org/fr/firefox/new/) d'installé, il faut l'installer pour la suite.

### 6) Migrations et lancement

1. **Mise à jour de la base**  
   Appliquez les migrations pour mettre à jour la structure de votre base de données PostgreSQL en fonction de vos modèles Django.
   ```bash
   python manage.py migrate
   ```

2. **Création d’un superuser (optionnel mais recommandé)**  
   Créez un superuser pour accéder à l’interface d’administration de Django.
   ```bash
   python manage.py createsuperuser
   ```

3. **Lancement du serveur en mode kiosque**  
   Pour lancer le serveur avec l’ouverture automatique de Firefox en mode kiosque sur l’écran sélectionné, exécutez :
   ```bash
   python manage.py runserver_kiosk
   ```
   Cette commande effectue les opérations suivantes :
    - Démarre le serveur Django.
    - Détecte automatiquement les moniteurs connectés. Si plusieurs écrans sont détectés, vous serez invité à sélectionner le numéro de l’écran sur lequel vous souhaitez afficher l’application.
    - Lance Firefox en mode fenêtré avec les dimensions et la position correspondant à l’écran choisi, puis simule la touche F11 pour passer en plein écran.
    - Surveille la fenêtre du navigateur : dès que vous la fermez, le serveur Django et le programme s’arrêtent automatiquement.

## Utilisation spécifique au Raspberry Pi

Si tu utilises un **Raspberry Pi 3B+** (ou modèle supérieur) :

- Installe Git, Python et PostgreSQL :
  ```bash
  sudo apt update && sudo apt upgrade -y
  sudo apt install git python3 python3-pip python3-venv postgresql postgresql-contrib libpq-dev
  ```
- Clone le projet et suis les **mêmes étapes** d’installation (création de virtualenv, `pip install -r requirements.txt`, configuration `.env`, etc.).
- Lance le serveur comme décrit plus haut :
  ```bash
  python manage.py runserver 0.0.0.0:8000
  ```
- Connecte-toi via le navigateur du Raspberry Pi ou depuis un autre ordinateur sur le même réseau en remplaçant l’IP.

---

## Crédits

Projet conçu et développé par **Melvin Delorme**, de **Septembre 2024** à aujourd’hui.  
Pour toute question ou suggestion, n’hésitez pas à me contacter.

---

