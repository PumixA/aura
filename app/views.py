from django.shortcuts import render, get_object_or_404, redirect
from .models import (
    Leds, LedsAnimation, LedsPersonnalisation,
    WidgetMusique, WidgetMeteo, WidgetHeure, CoreSettings
)
from .forms import (
    LedsForm, LedsAnimationForm, LedsPersonnalisationForm,
    WidgetMusiqueForm, WidgetMeteoForm, WidgetHeureForm, CoreSettingsForm
)
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt

# ----- Index -----
def index(request):
    # Vérifier si la ligne existe dans CoreSettings, sinon la créer avec tout à False
    core_settings, created = CoreSettings.objects.get_or_create(id=1, defaults={
        'leds': False,
        'wgt_heure': False,
        'wgt_meteo': False,
        'wgt_musique': False,
    })
    context = {
        'core_settings': core_settings
    }
    return render(request, 'index.html', context)

@csrf_exempt  # Pour simplifier le test, à sécuriser en production !
@require_POST
def toggle_leds(request):
    core_settings, created = CoreSettings.objects.get_or_create(id=1, defaults={
        'leds': False,
        'wgt_heure': False,
        'wgt_meteo': False,
        'wgt_musique': False,
    })
    # Inverser l'état des leds
    core_settings.leds = not core_settings.leds
    core_settings.save()
    return JsonResponse({'leds': core_settings.leds})

# ----- Dashboard de Debug -----
def debug_dashboard(request):
    context = {
        'leds_list': Leds.objects.all(),
        'animations_list': LedsAnimation.objects.all(),
        'personnalisation_list': LedsPersonnalisation.objects.all(),
        'widget_musique_list': WidgetMusique.objects.all(),
        'widget_meteo_list': WidgetMeteo.objects.all(),
        'widget_heure_list': WidgetHeure.objects.all(),
        'coresettings_list': CoreSettings.objects.all(),
    }
    return render(request, 'debug_dashboard.html', context)

# ----- CRUD pour Leds -----
def create_leds(request):
    if request.method == 'POST':
        form = LedsForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = LedsForm()
    return render(request, 'leds_form.html', {'form': form, 'action': 'Créer Leds'})

def update_leds(request, pk):
    instance = get_object_or_404(Leds, pk=pk)
    if request.method == 'POST':
        form = LedsForm(request.POST, instance=instance)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = LedsForm(instance=instance)
    return render(request, 'leds_form.html', {'form': form, 'action': 'Modifier Leds'})

def delete_leds(request, pk):
    instance = get_object_or_404(Leds, pk=pk)
    if request.method == 'POST':
        instance.delete()
        return redirect('debug_dashboard')
    return render(request, 'confirm_delete.html', {'object': instance, 'model': 'Leds'})

# ----- CRUD pour LedsAnimation -----
def create_leds_animation(request):
    if request.method == 'POST':
        form = LedsAnimationForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = LedsAnimationForm()
    return render(request, 'leds_animation_form.html', {'form': form, 'action': 'Créer Animation'})

def update_leds_animation(request, pk):
    instance = get_object_or_404(LedsAnimation, pk=pk)
    if request.method == 'POST':
        form = LedsAnimationForm(request.POST, instance=instance)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = LedsAnimationForm(instance=instance)
    return render(request, 'leds_animation_form.html', {'form': form, 'action': 'Modifier Animation'})

def delete_leds_animation(request, pk):
    instance = get_object_or_404(LedsAnimation, pk=pk)
    if request.method == 'POST':
        instance.delete()
        return redirect('debug_dashboard')
    return render(request, 'confirm_delete.html', {'object': instance, 'model': 'Animation'})

# ----- CRUD pour LedsPersonnalisation -----
def create_leds_personnalisation(request):
    if request.method == 'POST':
        form = LedsPersonnalisationForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = LedsPersonnalisationForm()
    return render(request, 'leds_personnalisation_form.html', {'form': form, 'action': 'Créer Personnalisation'})

def update_leds_personnalisation(request, pk):
    instance = get_object_or_404(LedsPersonnalisation, pk=pk)
    if request.method == 'POST':
        form = LedsPersonnalisationForm(request.POST, instance=instance)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = LedsPersonnalisationForm(instance=instance)
    return render(request, 'leds_personnalisation_form.html', {'form': form, 'action': 'Modifier Personnalisation'})

def delete_leds_personnalisation(request, pk):
    instance = get_object_or_404(LedsPersonnalisation, pk=pk)
    if request.method == 'POST':
        instance.delete()
        return redirect('debug_dashboard')
    return render(request, 'confirm_delete.html', {'object': instance, 'model': 'Personnalisation'})

# ----- CRUD pour WidgetMusique -----
def create_widget_musique(request):
    if request.method == 'POST':
        form = WidgetMusiqueForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = WidgetMusiqueForm()
    return render(request, 'widget_musique_form.html', {'form': form, 'action': 'Créer Widget Musique'})

def update_widget_musique(request, pk):
    instance = get_object_or_404(WidgetMusique, pk=pk)
    if request.method == 'POST':
        form = WidgetMusiqueForm(request.POST, instance=instance)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = WidgetMusiqueForm(instance=instance)
    return render(request, 'widget_musique_form.html', {'form': form, 'action': 'Modifier Widget Musique'})

def delete_widget_musique(request, pk):
    instance = get_object_or_404(WidgetMusique, pk=pk)
    if request.method == 'POST':
        instance.delete()
        return redirect('debug_dashboard')
    return render(request, 'confirm_delete.html', {'object': instance, 'model': 'Widget Musique'})

# ----- CRUD pour WidgetMeteo -----
def create_widget_meteo(request):
    if request.method == 'POST':
        form = WidgetMeteoForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = WidgetMeteoForm()
    return render(request, 'widget_meteo_form.html', {'form': form, 'action': 'Créer Widget Meteo'})

def update_widget_meteo(request, pk):
    instance = get_object_or_404(WidgetMeteo, pk=pk)
    if request.method == 'POST':
        form = WidgetMeteoForm(request.POST, instance=instance)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = WidgetMeteoForm(instance=instance)
    return render(request, 'widget_meteo_form.html', {'form': form, 'action': 'Modifier Widget Meteo'})

def delete_widget_meteo(request, pk):
    instance = get_object_or_404(WidgetMeteo, pk=pk)
    if request.method == 'POST':
        instance.delete()
        return redirect('debug_dashboard')
    return render(request, 'confirm_delete.html', {'object': instance, 'model': 'Widget Meteo'})

# ----- CRUD pour WidgetHeure -----
def create_widget_heure(request):
    if request.method == 'POST':
        form = WidgetHeureForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = WidgetHeureForm()
    return render(request, 'widget_heure_form.html', {'form': form, 'action': 'Créer Widget Heure'})

def update_widget_heure(request, pk):
    instance = get_object_or_404(WidgetHeure, pk=pk)
    if request.method == 'POST':
        form = WidgetHeureForm(request.POST, instance=instance)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = WidgetHeureForm(instance=instance)
    return render(request, 'widget_heure_form.html', {'form': form, 'action': 'Modifier Widget Heure'})

def delete_widget_heure(request, pk):
    instance = get_object_or_404(WidgetHeure, pk=pk)
    if request.method == 'POST':
        instance.delete()
        return redirect('debug_dashboard')
    return render(request, 'confirm_delete.html', {'object': instance, 'model': 'Widget Heure'})

# ----- CRUD pour CoreSettings -----
def create_coresettings(request):
    if request.method == 'POST':
        form = CoreSettingsForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = CoreSettingsForm()
    return render(request, 'coresettings_form.html', {'form': form, 'action': 'Créer Core Settings'})

def update_coresettings(request, pk):
    instance = get_object_or_404(CoreSettings, pk=pk)
    if request.method == 'POST':
        form = CoreSettingsForm(request.POST, instance=instance)
        if form.is_valid():
            form.save()
            return redirect('debug_dashboard')
    else:
        form = CoreSettingsForm(instance=instance)
    return render(request, 'coresettings_form.html', {'form': form, 'action': 'Modifier Core Settings'})

def delete_coresettings(request, pk):
    instance = get_object_or_404(CoreSettings, pk=pk)
    if request.method == 'POST':
        instance.delete()
        return redirect('debug_dashboard')
    return render(request, 'confirm_delete.html', {'object': instance, 'model': 'Core Settings'})
