from django.contrib import admin
from .models import (
    Leds, LedsAnimation, LedsPersonnalisation,
    WidgetMusique, WidgetMeteo, WidgetHeure,
    CoreSettings
)

admin.site.register(Leds)
admin.site.register(LedsAnimation)
admin.site.register(LedsPersonnalisation)
admin.site.register(WidgetMusique)
admin.site.register(WidgetMeteo)
admin.site.register(WidgetHeure)
admin.site.register(CoreSettings)
