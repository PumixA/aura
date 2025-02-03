from django.db import models

class LedsAnimation(models.Model):
    # Pour la table leds_animation
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=255)

    class Meta:
        db_table = "leds_animation"

    def __str__(self):
        return self.name

def default_color_gestion():
    # Définit le JSON par défaut pour leds_personnalisation
    return {"colors": [{"percentage": 1, "color": "#FFF"}]}

class LedsPersonnalisation(models.Model):
    # Pour la table leds_personnalisation
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=255)
    color_gestion = models.JSONField(
        default=default_color_gestion,
        help_text="Une couleur de 0 à 100 est définie à #FFF par défaut, modifiable par l'utilisateur."
    )

    class Meta:
        db_table = "leds_personnalisation"

    def __str__(self):
        return self.name

class Leds(models.Model):
    # Pour la table leds
    luminosite = models.SmallIntegerField(default=50, help_text="Luminosité entre 0% et 100%")
    reactivite = models.BooleanField(default=False, help_text="false = off, true = on")
    id_animation = models.ForeignKey(
        LedsAnimation,
        on_delete=models.CASCADE,
        db_column='id_animation',
        null=True, blank=True,
        help_text="Si à 0, aucune animation. Sinon, référence à une animation."
    )
    personnalisation = models.ForeignKey(
        LedsPersonnalisation,
        on_delete=models.CASCADE,
        db_column='personnalisation_id',
        null=True, blank=True,
        help_text="Si à 0, aucune personnalisation. Sinon, référence à une personnalisation."
    )

    class Meta:
        db_table = "leds"

    def __str__(self):
        return f"Leds (Lum: {self.luminosite}, Réact: {self.reactivite})"

class WidgetMusique(models.Model):
    # Pour la table widget_musique
    id = models.BigAutoField(primary_key=True)
    personalisation = models.IntegerField(default=0, help_text="Choisis entre les différentes personnalisations en brut")
    pos_x = models.IntegerField()
    pos_y = models.IntegerField()

    class Meta:
        db_table = "widget_musique"

    def __str__(self):
        return f"WidgetMusique #{self.id}"

class WidgetMeteo(models.Model):
    # Pour la table widget_meteo
    id = models.BigAutoField(primary_key=True)
    personalisation = models.IntegerField(default=0, help_text="Choisis entre les différentes personnalisations en brut")
    pos_x = models.IntegerField()
    pos_y = models.IntegerField()

    class Meta:
        db_table = "widget_meteo"

    def __str__(self):
        return f"WidgetMeteo #{self.id}"

class WidgetHeure(models.Model):
    # Pour la table widget_heure
    id = models.BigAutoField(primary_key=True)
    personalisation = models.IntegerField(default=0, help_text="Choisis entre les différentes personnalisations en brut")
    pos_x = models.IntegerField()
    pos_y = models.IntegerField()

    class Meta:
        db_table = "widget_heure"

    def __str__(self):
        return f"WidgetHeure #{self.id}"

class CoreSettings(models.Model):
    # Pour la table core_settings
    id = models.AutoField(primary_key=True)
    leds = models.BooleanField(default=False, help_text="false = off, true = on")
    wgt_heure = models.BooleanField(default=False, help_text="false = off, true = on")
    wgt_meteo = models.BooleanField(default=False, help_text="false = off, true = on")
    wgt_musique = models.BooleanField(default=False, help_text="false = off, true = on")

    class Meta:
        db_table = "core_settings"

    def __str__(self):
        return f"CoreSettings #{self.id}"
