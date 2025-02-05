from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('toggle-leds/', views.toggle_leds, name='toggle_leds'),

    path('debug', views.debug_dashboard, name='debug_dashboard'),

    # CRUD pour Leds
    path('leds/create/', views.create_leds, name='create_leds'),
    path('leds/<int:pk>/edit/', views.update_leds, name='update_leds'),
    path('leds/<int:pk>/delete/', views.delete_leds, name='delete_leds'),

    # CRUD pour LedsAnimation
    path('leds_animation/create/', views.create_leds_animation, name='create_leds_animation'),
    path('leds_animation/<int:pk>/edit/', views.update_leds_animation, name='update_leds_animation'),
    path('leds_animation/<int:pk>/delete/', views.delete_leds_animation, name='delete_leds_animation'),

    # CRUD pour LedsPersonnalisation
    path('leds_personnalisation/create/', views.create_leds_personnalisation, name='create_leds_personnalisation'),
    path('leds_personnalisation/<int:pk>/edit/', views.update_leds_personnalisation, name='update_leds_personnalisation'),
    path('leds_personnalisation/<int:pk>/delete/', views.delete_leds_personnalisation, name='delete_leds_personnalisation'),

    # CRUD pour WidgetMusique
    path('widget_musique/create/', views.create_widget_musique, name='create_widget_musique'),
    path('widget_musique/<int:pk>/edit/', views.update_widget_musique, name='update_widget_musique'),
    path('widget_musique/<int:pk>/delete/', views.delete_widget_musique, name='delete_widget_musique'),

    # CRUD pour WidgetMeteo
    path('widget_meteo/create/', views.create_widget_meteo, name='create_widget_meteo'),
    path('widget_meteo/<int:pk>/edit/', views.update_widget_meteo, name='update_widget_meteo'),
    path('widget_meteo/<int:pk>/delete/', views.delete_widget_meteo, name='delete_widget_meteo'),

    # CRUD pour WidgetHeure
    path('widget_heure/create/', views.create_widget_heure, name='create_widget_heure'),
    path('widget_heure/<int:pk>/edit/', views.update_widget_heure, name='update_widget_heure'),
    path('widget_heure/<int:pk>/delete/', views.delete_widget_heure, name='delete_widget_heure'),

    # CRUD pour CoreSettings
    path('coresettings/create/', views.create_coresettings, name='create_coresettings'),
    path('coresettings/<int:pk>/edit/', views.update_coresettings, name='update_coresettings'),
    path('coresettings/<int:pk>/delete/', views.delete_coresettings, name='delete_coresettings'),
]
