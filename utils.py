import random
import pandas as pd
import tkinter as tk
from tkinter import filedialog, messagebox
from openpyxl import load_workbook
import json
import pyperclip
import os
import logging

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

def load_json(file_path):
    try:
        with open(file_path, 'r') as file:
            return json.load(file)
    except Exception as e:
        logging.exception(f"Error loading JSON file {file_path}: {e}")
        raise

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
    
def generate_motivations_and_complications(villain=False):
    motivations = load_data_from_json('./json/motivations.json')  # Load the data from JSON file
    complications = load_data_from_json('./json/complications.json')
    character_motivations_and_complications = {
        "Motivation": {},
        "Complications": []
    }

    # Choose the motivation type based on the villain flag
    motivation_type = "Villain" if villain else "Hero"

    # Randomly select a motivation from the specified type
    if motivation_type in motivations:
        motivation_key = random.choice(list(motivations[motivation_type].keys()))
        character_motivations_and_complications["Motivation"] = {
            "name": motivation_key,
            "description": motivations[motivation_type][motivation_key]
        }
    else:
        raise ValueError(f"Motivation type '{motivation_type}' not found in motivations.")

    # Randomly select two complications
    selected_complications_keys = random.sample(list(complications.keys()), 2)
    for complication_key in selected_complications_keys:
        complication = complications[complication_key]
        if isinstance(complication, dict) and 'description' in complication:
            character_motivations_and_complications["Complications"].append({
                "name": complication_key,
                "description": complication['description']
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
    current_tab = notebook.tab(notebook.select(), "text")
    character = characters.get(current_tab)
    
    if not character:
        print("Error: No character found for the current tab.")
        return

    prompt = generate_character_description(character)
    pyperclip.copy(prompt)
    messagebox.showinfo("Prompt Copied", "The AI prompt has been copied to the clipboard.")

def generate_character_description(character):
    template = "{name} is a {gender} {age} years old. "
    template += "They are {height} with {eye_color} eyes, {hair_color} hair, and {skin_tone} skin. "
    template += "{name} is from {region}, {country} and speaks {language}. "
    template += "Their theme is {theme}. "
    template += "{name}'s positive traits include {positive_traits}. "
    template += "Their negative traits are {negative_traits}. "
    template += "Some quirky traits of {name} are {quirky_traits}. "
    template += "{name} is motivated by {motivation}. "
    template += "Their complications include {complications}."

    description = template.format(
        name=character.get('name', 'The character'),
        gender=character.get('gender', 'unspecified').lower(),
        age=character.get('age', 'unspecified'),
        height=character.get('physical_traits', {}).get('height', 'unspecified').lower(),
        eye_color=character.get('physical_traits', {}).get('eye_color', 'unspecified').lower(),
        hair_color=character.get('physical_traits', {}).get('hair_color', 'unspecified').lower(),
        skin_tone=character.get('physical_traits', {}).get('skin_tone', 'unspecified').lower(),
        region=character.get('origin', {}).get('region', 'an unspecified region'),
        country=character.get('origin', {}).get('country', 'an unspecified country'),
        language=character.get('origin', {}).get('language', 'an unspecified language'),
        theme=character.get('theme', 'unspecified').lower(),
        positive_traits=', '.join(trait.lower() for trait in character.get('personality_traits', {}).get('positive_traits', ['unspecified'])),
        negative_traits=', '.join(trait.lower() for trait in character.get('personality_traits', {}).get('negative_traits', ['unspecified'])),
        quirky_traits=', '.join(trait.lower() for trait in character.get('personality_traits', {}).get('quirky_traits', ['unspecified'])),
        motivation=character.get('Motivation', {}).get('description', 'unspecified').lower(),
        complications=', '.join(complication.get('name', 'unspecified').lower() for complication in character.get('Complications', [{'name': 'unspecified'}]))
    )

    # Capitalize the first letter of each sentence
    description = '. '.join(sentence.capitalize() for sentence in description.split('. '))

    return description

def close_all_tabs(notebook, text_widgets, characters):
    tabs = notebook.tabs()
    for tab in tabs:
        tab_name = notebook.tab(tab, "text")
        if tab_name in characters:
            del characters[tab_name]
        notebook.forget(tab)
        if tab in text_widgets:
            del text_widgets[tab]

def generate_expanded_traits():
    with open('json/expanded_traits.json', 'r') as file:
        traits_data = json.load(file)
    
    expanded_traits = {}
    for category in traits_data:
        trait = random.choice(traits_data[category])
        expanded_traits[category] = {
            "name": trait["name"],
            "description": trait["description"],
            "effect": trait["effect"]
        }
    
    return expanded_traits

def apply_trait_effects(character, action):
    traits = character["expanded_traits"]
    
    if action == "problem_solving":
        if traits["core_traits"]["name"] == "Openness":
            return "tries an unconventional approach"
        elif traits["cognitive_traits"]["name"] == "Analytical":
            return "carefully analyzes the situation"
    
    elif action == "social_interaction":
        if traits["emotional_traits"]["name"] == "Empathetic":
            return "tries to understand others' perspectives"
        elif traits["behavioral_traits"]["name"] == "Impulsive":
            return "speaks without thinking"
    
    # ... more conditions for different actions and traits ...
    
    return "acts normally"

def generate_random_occupation(age):
    occupations = load_data_from_json('./json/occupations.json')
    
    if age < 18:
        return "Student"
    elif 18 <= age <= 22:
        return random.choice(occupations['entry_level'])
    elif 23 <= age <= 30:
        return random.choice(occupations['early_career'])
    elif 31 <= age <= 50:
        return random.choice(occupations['mid_career'])
    else:
        return random.choice(occupations['late_career'])

def save_file_as_text(notebook, text_widgets):
    current_tab = notebook.select()
    tab_name = notebook.tab(current_tab, "text")
    
    text_widget = text_widgets.get(current_tab)
    
    if text_widget is None:
        for child in notebook.nametowidget(current_tab).winfo_children():
            if isinstance(child, tk.Text):
                text_widget = child
                break
    
    if text_widget is None:
        return
    
    content = text_widget.get("1.0", tk.END).strip()
    if not content:
        return

    file_path = filedialog.asksaveasfilename(
        defaultextension=".txt",
        filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
        initialfile=f"{tab_name}.txt"
    )
    
    if not file_path:
        return  # User cancelled the save operation
    try:
        with open(file_path, "w", encoding="utf-8") as file:
            file.write(content)
    except IOError:
        pass