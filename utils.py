import random
import pandas as pd
import tkinter as tk
from tkinter import messagebox
from openpyxl import load_workbook
import json
import pyperclip

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
    file_path = f'../json/{file_name}'
    with open(file_name, 'r', encoding='utf-8') as file:
        data = json.load(file)
    return data

def generate_random_traits():
    # Load the traits from the JSON file
    traits = load_data_from_json('./json/PersonalityTraits.json')

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
    themes = load_data_from_json('./json/theme.json')['theme']
    return random.choice(themes)

def random_failure_effects():
    failures = {
        'Failure 1 Degree': ['dazed', 'entranced', 'fatigued', 'hindered', 'impaired', 'vulnerable'],
        'Failure 2 Degrees': ['compelled', 'defenseless', 'disabled', 'exhausted', 'immobile', 'prone', 'stunned'],
        'Failure 3 Degrees': ['asleep', 'controlled', 'incapacitated', 'paralyzed', 'transformed', 'unaware']
    }
    return {key: random.choice(value) for key, value in failures.items()}

def generate_random_origin():
    origins = load_data_from_json('./json/characterOrigins.json')
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
    all_languages = load_data_from_json('./json/languages.json')
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
    motivations = load_data_from_json('./json/motivations.json')  # Load the data from JSON file
    complications = load_data_from_json('./json/complications.json')
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
    male_names = load_data_from_json('./json/male_names.json')
    female_names = load_data_from_json('./json/female_names.json')
    
    # Choose a random gender
    gender = random.choice(["Male", "Female"])
    
    # Pick a random name based on the gender
    if gender == "Male":
        name = random.choice(male_names)
    else:
        name = random.choice(female_names)
    
    return gender, name

def generate_random_physical_trait(trait_category):
    physical_traits = load_data_from_json('./json/physical_traits.json')
    return random.choice(physical_traits["PHYSICAL_TRAITS"][trait_category])

def generate_random_costume_style():
    physical_traits = load_data_from_json('./json/physical_traits.json')
    return random.choice(physical_traits["COSTUME_STYLES"])

def generate_random_distinctive_feature():
    physical_traits = load_data_from_json('./json/physical_traits.json')
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

def generate_encounter():
    encounters = load_data_from_json('./json/encounters.json')['encounters']
    encounter = random.choice(encounters)
    messagebox.showinfo("Random Encounter", f"Encounter Type: {encounter['type']}\nDescription: {encounter['description']}")

def generate_weight():
    weights = list(range(110, 351))
    probabilities = (
        [0.4] * 41 +   # 110-150
        [0.4] * 50 +   # 151-200
        [0.10] * 50 +   # 201-250
        [0.05] * 50 +  # 251-300
        [0.05] * 50    # 301-350
    )
    weight = random.choices(weights, probabilities, k=1)[0]
    return weight


def copy_prompt_to_clipboard(notebook, characters):
    # Get the name of the currently selected tab
    current_tab = notebook.tab(notebook.select(), "text")
    
    # Retrieve the character associated with the current_tab
    character = characters.get(current_tab)
    
    if not character:
        messagebox.showerror("Error", "No character found for the current tab.")
        return

    prompt = generate_character_description(character)
    pyperclip.copy(prompt)
    messagebox.showinfo("AI Prompt Copied", "The AI prompt has been copied to the clipboard.")

def generate_character_description(character):
    gender = character.get('gender', 'person')
    age = character.get('age', 'unknown age')
    nationality = character['origin'].get('country', 'an unknown country')
    origin = character['origin'].get('region', 'an unknown region')
    height = character['physical_traits'].get('height', 'unknown height')
    weight = character['physical_traits'].get('weight', 'unknown weight')
    hair_color = character['physical_traits'].get('hair_color', 'unknown hair color')
    eye_color = character['physical_traits'].get('eye_color', 'unknown eye color')
    power_theme = character.get('theme', 'an unknown power theme')
    costume_style = character.get('costume_style', 'unknown costume style')
    distinctive_feature = character.get('distinctive_feature', 'no distinctive features')
    descriptions = load_data_from_json('./json/descriptions.json')

    if gender.lower() == 'male':
        template = random.choice(descriptions['male'])
    elif gender.lower() == 'female':
        template = random.choice(descriptions['female'])
    else:
        template = (
            "Create a full body image of a {gender} that is around the age of {age}. "
            "They are from {nationality} in {origin}. {gender.capitalize()} has {hair_color} hair "
            "that complements their striking features and {eye_color} eyes that seem to hold a world of secrets. "
            "They have a {height} height and a weight of {weight} pounds. "
            "Their abilities revolve around a {power_theme}, giving them control over specific aspects related to it. "
            "They don a {costume_style} costume that reflects their persona and powers. "
            "A distinctive feature of theirs is {distinctive_feature}, making them easily recognizable."
        )

    description = template.format(
        gender=gender,
        age=age,
        nationality=nationality,
        origin=origin,
        height=height,
        weight=weight,
        hair_color=hair_color,
        eye_color=eye_color,
        power_theme=power_theme,
        costume_style=costume_style,
        distinctive_feature=distinctive_feature
    )

    return description

def calculate_accuracy(character, power):
    accuracy = 0
    extras = {extra: rank for extra, rank in zip(power.get('extras', []), power.get('extras_ranks', []))}
    
    if power['type'] == 'Combat':
        if power['range'] == 'Ranged':
            dex_stat = character['stats'].get('Dexterity', {}).get('value', 0)
            ranged_attack_bonus = sum(adv['rank'] for adv in character['advantages'] if adv['name'] == 'Ranged Attack')
            accurate_bonus = extras.get('Accurate', 0) * 2  # Each rank of Accurate provides a +2 bonus
            accuracy = dex_stat + ranged_attack_bonus + accurate_bonus
        
        elif power['range'] == 'Melee':
            fighting_stat = character['stats'].get('Fighting', {}).get('value', 0)
            close_attack_bonus = sum(adv['rank'] for adv in character['advantages'] if adv['name'] == 'Close Attack')
            accurate_bonus = extras.get('Accurate', 0) * 2
            accuracy = fighting_stat + close_attack_bonus + accurate_bonus
    
    return accuracy

def close_all_tabs(notebook, text_widgets, characters):
    tabs = notebook.tabs()
    for tab in tabs:
        tab_name = notebook.tab(tab, "text")
        if tab_name in characters:
            del characters[tab_name]
        notebook.forget(tab)
        if tab in text_widgets:
            del text_widgets[tab]
