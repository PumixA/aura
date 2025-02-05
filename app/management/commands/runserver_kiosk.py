import sys
import threading
import time
import subprocess
import shutil
import os
import tempfile
import urllib.request
import re

# Pour Windows, utilisation de l'API native via ctypes pour détecter les moniteurs
if sys.platform.startswith("win"):
    import ctypes
    from ctypes import wintypes

from django.core.management.commands.runserver import Command as RunserverCommand

# --- Fonction native Windows pour détecter les moniteurs ---
def get_windows_monitors():
    user32 = ctypes.windll.user32
    monitors = []

    class RECT(ctypes.Structure):
        _fields_ = [
            ("left", ctypes.c_long),
            ("top", ctypes.c_long),
            ("right", ctypes.c_long),
            ("bottom", ctypes.c_long),
        ]

    MonitorEnumProc = ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.POINTER(RECT), ctypes.c_double)

    def callback(hMonitor, hdcMonitor, lprcMonitor, dwData):
        rct = lprcMonitor.contents
        x = rct.left
        y = rct.top
        width = rct.right - rct.left
        height = rct.bottom - rct.top
        orientation = "Horizontal" if width >= height else "Vertical"
        monitors.append({
            "name": f"Moniteur {len(monitors)+1}",
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "orientation": orientation
        })
        return 1  # Continue l'énumération

    enum_proc = MonitorEnumProc(callback)
    if not user32.EnumDisplayMonitors(0, 0, enum_proc, 0):
        raise ctypes.WinError()
    return monitors
# --- Fin de la fonction native Windows ---

class Command(RunserverCommand):
    help = ("Lance le serveur Django et ouvre automatiquement Firefox en mode kiosque sur l'écran sélectionné. "
            "Firefox est d'abord lancé en mode fenêtré avec les dimensions et la position correspondant à l'écran choisi, "
            "puis la touche F11 est simulée pour passer en plein écran. "
            "Dès que la fenêtre du navigateur est fermée, le serveur et le programme s'arrêtent automatiquement.")

    def inner_run(self, *args, **options):
        threading.Thread(target=self.launch_browser_with_kiosk, daemon=True).start()
        return super().inner_run(*args, **options)

    def log(self, message):
        self.stdout.write(message + "\n")
        self.stdout.flush()

    def launch_browser_with_kiosk(self):
        self.log("-> Attente de 2 secondes pour laisser démarrer le serveur...")
        time.sleep(2)

        # Détection des écrans
        screens = self.get_screens_info()
        screen_number = 1  # par défaut
        target_geometry = None
        if screens:
            if len(screens) == 1:
                self.log("-> Un seul écran détecté. Utilisation automatique de l'écran 1.")
                screen_number = 1
            else:
                self.log("-> Écrans détectés :")
                for idx, screen in enumerate(screens, start=1):
                    self.log(f"   [{idx}] {screen['name']} - {screen['width']}x{screen['height']} à ({screen['x']},{screen['y']}) - Orientation: {screen['orientation']}")
                try:
                    screen_input = input("   Entrez le numéro de l'écran souhaité (défaut 1) : ")
                    screen_number = int(screen_input) if screen_input.strip() else 1
                except Exception:
                    screen_number = 1
                if screen_number < 1 or screen_number > len(screens):
                    self.log("-> Numéro d'écran invalide, utilisation de la valeur par défaut (1).")
                    screen_number = 1
            target_geometry = screens[screen_number - 1]
        else:
            self.log("-> Aucune information d'écran détectée, utilisation de l'écran par défaut.")

        self.log(f"-> Écran choisi : {screen_number}")
        if target_geometry:
            self.log(f"-> Dimensions de l'écran choisi : {target_geometry['width']}x{target_geometry['height']} à ({target_geometry['x']},{target_geometry['y']})")

        # Préparer la commande de lancement avec les dimensions (sans --kiosk)
        browser_cmd = self.get_browser_command(target_geometry)
        if not browser_cmd:
            self.log("-> Aucun navigateur n'a pu être détecté ou défini. Arrêt du lancement du navigateur.")
            return

        self.log("-> Lancement de Firefox en mode fenêtré avec les dimensions de l'écran choisi...")
        self.log(f"   Commande utilisée : {' '.join(browser_cmd)}")
        try:
            browser_process = subprocess.Popen(browser_cmd)
        except Exception as e:
            self.log(f"-> Erreur lors du lancement du navigateur : {e}")
            return

        # Attendre brièvement pour que Firefox se lance et se positionne correctement
        time.sleep(1)
        if sys.platform.startswith("linux"):
            self.position_window_linux(target_geometry)
        elif sys.platform.startswith("win"):
            self.position_window_windows(target_geometry)
        elif sys.platform.startswith("darwin"):
            self.log("-> Le repositionnement automatique n'est pas implémenté pour macOS.")

        # Envoyer la touche F11 pour passer en plein écran (mode kiosque)
        self.enter_full_screen()

        self.log("-> Firefox est désormais en plein écran sur l'écran sélectionné.")
        self.log("-> La fermeture de la fenêtre du navigateur arrêtera le serveur et le programme.")

        # Surveiller la fenêtre de Firefox : tant qu'elle existe, le programme reste en vie.
        self.monitor_browser(browser_process)
        self.log("-> La fenêtre du navigateur a été fermée. Arrêt du serveur et du programme...")
        os._exit(0)

    def get_browser_command(self, target_geometry=None):
        url = "http://127.0.0.1:8000"
        extra_args = []
        if target_geometry:
            extra_args = ["-width", str(target_geometry["width"]), "-height", str(target_geometry["height"])]

        if sys.platform.startswith("linux"):
            firefox_path = shutil.which("firefox")
            if not firefox_path:
                self.log("-> Firefox n'est pas détecté sur Linux. Tentative d'installation via apt-get...")
                if shutil.which("apt-get"):
                    try:
                        subprocess.check_call(["sudo", "apt-get", "update"])
                        subprocess.check_call(["sudo", "apt-get", "install", "-y", "firefox"])
                        firefox_path = shutil.which("firefox")
                        if firefox_path:
                            self.log("-> Firefox installé avec succès.")
                        else:
                            self.log("-> L'installation de Firefox a échoué.")
                    except Exception as e:
                        self.log(f"-> Erreur lors de l'installation de Firefox : {e}")
                else:
                    self.log("-> apt-get n'est pas disponible. Veuillez installer Firefox manuellement.")
            if not firefox_path:
                firefox_path = self.get_manual_browser_path()
            if firefox_path:
                self.log(f"-> Firefox utilisé : {firefox_path}")
                return [firefox_path, url] + extra_args
            else:
                return None

        elif sys.platform.startswith("win"):
            firefox_path = shutil.which("firefox.exe")
            if not firefox_path:
                self.log("-> Firefox n'est pas détecté sur Windows.")
            if not firefox_path:
                firefox_path = self.get_manual_browser_path()
            if firefox_path:
                self.log(f"-> Firefox utilisé : {firefox_path}")
                return [firefox_path, url] + extra_args
            else:
                return None

        elif sys.platform.startswith("darwin"):
            firefox_path = shutil.which("firefox")
            if not firefox_path:
                self.log("-> Firefox n'est pas détecté sur macOS.")
            if not firefox_path:
                firefox_path = self.get_manual_browser_path()
            if firefox_path:
                self.log(f"-> Firefox utilisé : {firefox_path}")
                return ["open", "-a", "Firefox", "--args", url]
            else:
                return None
        else:
            self.log("-> Système d'exploitation non reconnu pour l'installation automatique.")
            return None

    def get_manual_browser_path(self):
        config_file = os.path.join(os.getcwd(), "firefox_manual_path.txt")
        if os.path.exists(config_file):
            with open(config_file, "r", encoding="utf-8") as f:
                manual_path = f.read().strip()
            if os.path.exists(manual_path) and os.access(manual_path, os.X_OK):
                self.log(f"-> Chemin Firefox chargé depuis {config_file}: {manual_path}")
                return manual_path
            else:
                self.log(f"-> Le chemin sauvegardé dans {config_file} n'est pas valide.")
        self.log("-> Firefox n'est pas détecté automatiquement.")
        if sys.platform.startswith("win"):
            self.log("   Exemple sur Windows : C:\\Program Files\\Mozilla Firefox\\firefox.exe")
        elif sys.platform.startswith("linux"):
            self.log("   Exemple sur Linux : /usr/bin/firefox")
        elif sys.platform.startswith("darwin"):
            self.log("   Exemple sur macOS : /Applications/Firefox.app/Contents/MacOS/firefox")
        manual_path = input("   Veuillez entrer le chemin complet vers Firefox : ").strip()
        if os.path.exists(manual_path) and os.access(manual_path, os.X_OK):
            with open(config_file, "w", encoding="utf-8") as f:
                f.write(manual_path)
            self.log(f"-> Chemin Firefox sauvegardé dans {config_file}.")
            return manual_path
        else:
            self.log("-> Chemin invalide ou non exécutable. Réessayez.")
            return self.get_manual_browser_path()

    def get_screens_info(self):
        screens = []
        if sys.platform.startswith("linux"):
            try:
                output = subprocess.check_output(["xrandr"]).decode("utf-8")
                pattern = re.compile(r"^(\S+)\s+connected.*?(\d+)x(\d+)\+(\d+)\+(\d+)")
                for line in output.splitlines():
                    match = pattern.search(line)
                    if match:
                        name, width, height, x, y = match.groups()
                        width = int(width)
                        height = int(height)
                        x = int(x)
                        y = int(y)
                        orientation = "Horizontal" if width >= height else "Vertical"
                        screens.append({
                            "name": name,
                            "width": width,
                            "height": height,
                            "x": x,
                            "y": y,
                            "orientation": orientation
                        })
            except Exception as e:
                self.log(f"-> Erreur lors de la détection des écrans avec xrandr : {e}")
        elif sys.platform.startswith("win"):
            try:
                screens = get_windows_monitors()
            except Exception as e:
                self.log(f"-> Erreur lors de la détection des écrans sur Windows : {e}")
        elif sys.platform.startswith("darwin"):
            self.log("-> Détection automatique des écrans sur macOS non implémentée.")
        return screens

    def position_window_linux(self, target):
        self.log("-> Repositionnement de la fenêtre via wmctrl sur Linux...")
        wmctrl_path = shutil.which("wmctrl")
        if wmctrl_path:
            time.sleep(0.5)
            try:
                subprocess.check_call([wmctrl_path, "-r", ":ACTIVE:", "-e", f"0,{target['x']},{target['y']},-1,-1"])
            except Exception as e:
                self.log(f"-> Erreur lors du repositionnement avec wmctrl : {e}")
        else:
            self.log("-> wmctrl non disponible. La fenêtre ne sera pas repositionnée.")

    def position_window_windows(self, target):
        self.log("-> Repositionnement de la fenêtre sur Windows...")
        try:
            import pygetwindow as gw
        except ImportError:
            self.log("-> Le module PyGetWindow n'est pas installé. Veuillez l'installer pour le repositionnement sur Windows.")
            return
        time.sleep(0.5)
        windows = gw.getWindowsWithTitle("Firefox")
        if not windows:
            windows = gw.getWindowsWithTitle("Mozilla Firefox")
        if windows:
            firefox_window = windows[0]
            try:
                firefox_window.moveTo(target['x'], target['y'])
                firefox_window.resizeTo(target['width'], target['height'])
                self.log("-> Fenêtre repositionnée sur l'écran sélectionné.")
            except Exception as e:
                self.log(f"-> Erreur lors du repositionnement de la fenêtre: {e}")
        else:
            self.log("-> Fenêtre Firefox non trouvée pour repositionnement sur Windows.")

    def enter_full_screen(self):
        self.log("-> Passage en plein écran (envoi de F11)...")
        try:
            import pyautogui
            time.sleep(0.5)
            pyautogui.press('f11')
            self.log("-> Touche F11 envoyée.")
        except ImportError:
            self.log("-> pyautogui n'est pas installé, le passage en plein écran devra être fait manuellement.")

    def monitor_browser(self, browser_process):
        self.log("-> Surveillance de la fenêtre Firefox...")
        while True:
            still_open = False
            if sys.platform.startswith("win"):
                try:
                    import pygetwindow as gw
                    windows = gw.getWindowsWithTitle("Firefox")
                    if not windows:
                        windows = gw.getWindowsWithTitle("Mozilla Firefox")
                    if windows:
                        still_open = True
                except Exception:
                    still_open = False
            elif sys.platform.startswith("linux"):
                try:
                    wmctrl_path = shutil.which("wmctrl")
                    if wmctrl_path:
                        output = subprocess.check_output([wmctrl_path, "-l"]).decode("utf-8")
                        if "Firefox" in output:
                            still_open = True
                except Exception:
                    still_open = False
            else:
                # Pour macOS ou autres, on utilise le wait() de base
                try:
                    browser_process.poll()
                    if browser_process.returncode is None:
                        still_open = True
                except Exception:
                    still_open = False

            if not still_open:
                break
            time.sleep(1)
