import os
import random
import math
import pandas as pd
import xlsxwriter
import tkinter as tk
from tkinter import messagebox, filedialog, ttk, StringVar
from openpyxl import load_workbook
import sqlite3
import json
import openpyxl
from openpyxl.styles import Font

POWER_POINTS_PER_LEVEL = 15
current_theme = None
dark_mode = False

dark_mode_colors = {
    'background': '#2E2E2E',
    'foreground': '#FFFFFF',
    'button_background': '#333333',
    'button_foreground': '#FFFFFF',
    'text_background': '#333333',
    'text_foreground': '#FFFFFF',
    'highlight': '#5C5C5C'  # New highlight color for dark mode
}

light_mode_colors = {

    'background': '#F0F0F0',
    'foreground': '#000000',
    'button_background': '#E0E0E0',
    'button_foreground': '#000000',
    'text_background': '#FFFFFF',
    'text_foreground': '#000000'
}

def apply_color_scheme_to_tab(tab, colors):
    for widget in tab.winfo_children():
        if isinstance(widget, tk.Text):
            widget.configure(bg=colors['text_background'], fg=colors['text_foreground'])
        # Add more types here if necessary
            
def update_color_scheme(dark_mode, root):
    colors = dark_mode_colors if dark_mode else light_mode_colors
    apply_color_scheme_to_tab(root, colors)

def toggle_dark_mode(root):
    global dark_mode  # Declare dark_mode as global
    dark_mode = not dark_mode
    update_color_scheme(dark_mode, root)

def load_data_from_json(file_name):
    with open(file_name, 'r', encoding='utf-8') as file:
        data = json.load(file)
    return data

def generate_random_traits():
    # Load the traits from the JSON file
    traits = load_data_from_json('PersonalityTraits.json')

    # Randomly select the number of traits from each category
    positive_traits = random.sample(traits['positive_traits'], random.randint(1, 3))
    negative_traits = random.sample(traits['negative_traits'], random.randint(1, 2))
    quirky_traits = random.sample(traits['quirky_traits'], random.randint(0, 1))

    return {
        'positive_traits': positive_traits,
        'negative_traits': negative_traits,
        'quirky_traits': quirky_traits
    }

def generate_random_theme():
    themes = load_data_from_json('theme.json')['theme']
    return random.choice(themes)

def random_failure_effects():
    failures = {
        'Failure 1 Degree': ['dazed', 'entranced', 'fatigued', 'hindered', 'impaired', 'vulnerable'],
        'Failure 2 Degrees': ['compelled', 'defenseless', 'disabled', 'exhausted', 'immobile', 'prone', 'stunned'],
        'Failure 3 Degrees': ['asleep', 'controlled', 'incapacitated', 'paralyzed', 'transformed', 'unaware']
    }
    return {key: random.choice(value) for key, value in failures.items()}

def generate_random_origin():
    origins = load_data_from_json('characterOrigins.json')
    origin = random.choice(origins)

    if 'countries' in origin:
        country = random.choice(origin['countries'])
        language = random.choice(country['languages'])
        return {
            "region": origin.get('region', 'Unknown'),
            "country": country.get('name', 'Unknown'),  # Ensuring there is a 'name' key
            "language": language
        }
    else:
        language = random.choice(origin['languages'])
        return {
            "region": origin.get('region', 'Unknown'),  # Adding region here for consistency
            "country": origin.get('region', 'Unknown'),  # Using region as country if no countries are listed
            "language": language
        }
    
def calculate_range(rank):
    range_chart = [
        60, 120, 250, 500, 900, 1800, 2640, 5280, 10560, 21120, 42240,
        84480, 158400, 316800, 633600, 1320000, 2640000, 5280000, 10560000, 21120000
    ]
    return range_chart[rank - 1] if rank <= len(range_chart) else "Beyond chart"
def assign_languages(character):
    all_languages = load_data_from_json('languages.json')
    base_language = "English"
    language_list = all_languages
    assigned_languages = [base_language]  # English is the base language

    # Check if character has the "Languages" advantage
    for advantage in character.get("advantages", []):
        if advantage["name"] == "Languages":
            rank = advantage["rank"]
            
            # Calculate the number of additional languages based on the original rank
            num_additional_languages = 2 ** (rank - 1) - 1
            # Ensure the number of languages does not exceed available languages
            num_additional_languages = min(num_additional_languages, len(language_list) - 1)
            selectable_languages = [lang for lang in language_list if lang != base_language]
            selected_languages = random.sample(selectable_languages, k=num_additional_languages)
            assigned_languages.extend(selected_languages)
    
    return assigned_languages

def generate_motivations_and_complications():
    motivations = load_data_from_json('motivations.json')  # Load the data from JSON file
    complications = load_data_from_json('complications.json')
    character_motivations_and_complications = {
        "Motivation": {},
        "Complications": []
    }

    motivation_key = random.choice(list(motivations.keys()))
    character_motivations_and_complications["Motivation"] = {
        "name": motivation_key,
        "description": motivations[motivation_key]
    }

    selected_complications_keys = random.sample(list(complications.keys()), random.randint(2, 2))
    for complication_key in selected_complications_keys:
        character_motivations_and_complications["Complications"].append({
            "name": complication_key,
            "description": complications[complication_key]
        })

    return character_motivations_and_complications

def generate_random_age():
    age_ranges = [(18, 31), (8, 17), (32, 100)]
    weights = [0.80, 0.05, 0.15]
    selected_range = random.choices(age_ranges, weights)[0]
    return random.randint(selected_range[0], selected_range[1])

def generate_random_gender():
    # Load the names from JSON files
    male_names = load_data_from_json('male_names.json')
    female_names = load_data_from_json('female_names.json')
    
    # Choose a random gender
    gender = random.choice(["Male", "Female"])
    
    # Pick a random name based on the gender
    if gender == "Male":
        name = random.choice(male_names)
    else:
        name = random.choice(female_names)
    
    return gender, name

def generate_random_physical_trait(trait_category):
    physical_traits = load_data_from_json('physical_traits.json')
    return random.choice(physical_traits["PHYSICAL_TRAITS"][trait_category])

def generate_random_costume_style():
    physical_traits = load_data_from_json('physical_traits.json')
    return random.choice(physical_traits["COSTUME_STYLES"])

def generate_random_distinctive_feature():
    physical_traits = load_data_from_json('physical_traits.json')
    return random.choice(physical_traits["DISTINCTIVE_FEATURES"])

def calculate_attack_bonuses(character):
    melee_attack_bonus = character["stats"].get("Fighting", {}).get("value", 0)
    ranged_attack_bonus = character["stats"].get("Dexterity", {}).get("value", 0)

    for advantage in character.get("advantages", []):
        if advantage["name"] == "Close Attack":
            melee_attack_bonus += advantage.get("rank", 0)
        elif advantage["name"] == "Ranged Attack":
            ranged_attack_bonus += advantage.get("rank", 0)

    for skill in character.get("skills", []):
        if skill["name"] == "Close Combat":
            melee_attack_bonus += skill.get("rank", 0)
        elif skill["name"] == "Ranged Combat":
            ranged_attack_bonus += skill.get("rank", 0)

    return melee_attack_bonus, ranged_attack_bonus

def calculate_initiative(character):
    initiative = character["stats"].get("Agility", {}).get("value", 0)
    
    for advantage in character.get("advantages", []):
        if advantage["name"] == "Improved Initiative":
            initiative_bonus_per_rank = 4
            initiative += advantage.get("rank", 0) * initiative_bonus_per_rank
        elif "Initiative" in advantage.get("tags", []):
            initiative += advantage.get("rank", 0)
    
    return initiative
