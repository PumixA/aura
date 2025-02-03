from django import forms
from .models import (
    Leds, LedsAnimation, LedsPersonnalisation,
    WidgetMusique, WidgetMeteo, WidgetHeure, CoreSettings
)

WIDGET_PERSONNALISATION_CHOICES = [
    (1, "widget-personnalisation-1"),
    (2, "widget-personnalisation-2"),
    (3, "widget-personnalisation-3"),
]

class LedsForm(forms.ModelForm):
    class Meta:
        model = Leds
        fields = ['luminosite', 'reactivite', 'id_animation', 'personnalisation']
        widgets = {
            # Slider pour la luminosité
            'luminosite': forms.NumberInput(attrs={
                'type': 'range',
                'min': 0,
                'max': 100,
                'oninput': "this.nextElementSibling.value = this.value"
            }),
            # Toggle pour la réactivité
            'reactivite': forms.CheckboxInput(attrs={'class': 'toggle'}),
        }

    def clean(self):
        cleaned_data = super().clean()
        reactivite = cleaned_data.get('reactivite')
        id_animation = cleaned_data.get('id_animation')
        personnalisation = cleaned_data.get('personnalisation')
        # Validation : si réactivité est activée, aucune animation ou personnalisation ne doit être sélectionnée.
        if reactivite and (id_animation or personnalisation):
            raise forms.ValidationError(
                "Si la réactivité est activée, aucune animation ou personnalisation ne doit être sélectionnée."
            )
        return cleaned_data

class LedsAnimationForm(forms.ModelForm):
    class Meta:
        model = LedsAnimation
        fields = ['name']

class LedsPersonnalisationForm(forms.ModelForm):
    class Meta:
        model = LedsPersonnalisation
        fields = ['name', 'color_gestion']
        widgets = {
            'color_gestion': forms.Textarea(attrs={'rows': 3, 'cols': 40}),
        }

class WidgetMusiqueForm(forms.ModelForm):
    personalisation = forms.ChoiceField(choices=WIDGET_PERSONNALISATION_CHOICES)

    class Meta:
        model = WidgetMusique
        fields = ['personalisation', 'pos_x', 'pos_y']

class WidgetMeteoForm(forms.ModelForm):
    personalisation = forms.ChoiceField(choices=WIDGET_PERSONNALISATION_CHOICES)

    class Meta:
        model = WidgetMeteo
        fields = ['personalisation', 'pos_x', 'pos_y']

class WidgetHeureForm(forms.ModelForm):
    personalisation = forms.ChoiceField(choices=WIDGET_PERSONNALISATION_CHOICES)

    class Meta:
        model = WidgetHeure
        fields = ['personalisation', 'pos_x', 'pos_y']

class CoreSettingsForm(forms.ModelForm):
    class Meta:
        model = CoreSettings
        fields = ['leds', 'wgt_heure', 'wgt_meteo', 'wgt_musique']
        widgets = {
            'leds': forms.CheckboxInput(attrs={'class': 'toggle'}),
            'wgt_heure': forms.CheckboxInput(attrs={'class': 'toggle'}),
            'wgt_meteo': forms.CheckboxInput(attrs={'class': 'toggle'}),
            'wgt_musique': forms.CheckboxInput(attrs={'class': 'toggle'}),
        }
