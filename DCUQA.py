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

def load_data_from_json(file_name):
    with open(file_name, 'r', encoding='utf-8') as file:
        data = json.load(file)
    return data

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

def load_archetypes():
    with open('archetypes.json', 'r', encoding='utf-8') as file:
        return json.load(file)

def calculate_range(rank):
    range_chart = [
        60, 120, 250, 500, 900, 1800, 2640, 5280, 10560, 21120, 42240,
        84480, 158400, 316800, 633600, 1320000, 2640000, 5280000, 10560000, 21120000
    ]
    return range_chart[rank - 1] if rank <= len(range_chart) else "Beyond chart"

def calculate_equipment_points(character):
    equipment_advantage = next((adv for adv in character['advantages'] if adv['name'] == 'Equipment'), None)
    if equipment_advantage:
        rank = equipment_advantage['rank']
        equipment_points = rank * 5  # Each rank of Equipment provides 5 equipment points
        return equipment_points
    return 0

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

def highlight_text(text_widget, search_query):
    # Convert the search query to lowercase for case-insensitive search
    search_query = search_query.lower()

    # Remove previous highlights
    text_widget.tag_remove('highlight', '1.0', tk.END)

    # If search query is not empty, highlight the matching text
    if search_query:
        start_index = '1.0'
        while True:
            # Use the text widget's search method with the 'nocase' option for case-insensitive search
            start_index = text_widget.search(search_query, start_index, tk.END, nocase=True)
            if not start_index:
                break
            end_index = f"{start_index}+{len(search_query)}c"
            text_widget.tag_add('highlight', start_index, end_index)
            start_index = end_index

        # Configure the highlight color based on the current mode
        highlight_color = dark_mode_colors['highlight'] if dark_mode else 'yellow'
        text_widget.tag_configure('highlight', background=highlight_color)

def on_search_change(search_var):
    search_query = search_var.get()
    selected_tab = notebook.nametowidget(notebook.select())
    text_widget = text_widgets.get(selected_tab)
    if text_widget:
        highlight_text(text_widget, search_query)

def load_gadgets():
    with open('gadget_data.json', 'r', encoding='utf-8') as json_file:
        return json.load(json_file)

def random_gadget_generator(points, gadgets):
    selected_gadgets = []
    total_cost = 0

    while points > 0 and gadgets:
        chosen_gadget = random.choice(gadgets).copy()  # Copy the gadget to avoid modifying the original list
        chosen_gadget['total_cost'] = 0  # Set default total_cost

        if 'cost' in chosen_gadget:  # Check if 'cost' key exists
            base_cost = int(chosen_gadget['cost'])

            if base_cost <= points:
                if 'rank' in chosen_gadget and isinstance(chosen_gadget['rank'], str):
                    rank_range = [int(x) for x in chosen_gadget['rank'].split('-') if x.isdigit()]
                    if len(rank_range) == 2:
                        max_rank = min(rank_range[1], points // base_cost)  # Adjust max rank based on remaining points
                        if rank_range[0] <= max_rank:
                            chosen_rank = random.randint(rank_range[0], max_rank)
                            chosen_gadget['total_cost'] = chosen_rank * base_cost
                            chosen_gadget['rank'] = chosen_rank
                        else:
                            # If max_rank is less than the lower bound, skip this gadget
                            gadgets = [g for g in gadgets if g['name'] != chosen_gadget['name']]
                            continue
                    else:
                        # If the rank is not a range, use the base rank
                        chosen_gadget['rank'] = base_cost
                        chosen_gadget['total_cost'] = base_cost
                else:
                    # If there's no rank, only use the base cost
                    chosen_gadget['rank'] = base_cost
                    chosen_gadget['total_cost'] = base_cost

                total_cost += chosen_gadget['total_cost']
                points -= chosen_gadget['total_cost']
                selected_gadgets.append(chosen_gadget)
                gadgets = [g for g in gadgets if g['name'] != chosen_gadget['name']]
            else:
                gadgets = [g for g in gadgets if g['name'] != chosen_gadget['name']]
        else:
            gadgets = [g for g in gadgets if g['name'] != chosen_gadget['name']]  # Remove gadget if 'cost' key is missing

    return selected_gadgets, total_cost

def display_gadgets(items, total_cost, allocated_points, text_widget):
    text_widget.delete("1.0", tk.END)
    
    for item in items:
        text_widget.insert(tk.END, f"{item['name']}\n")
        if 'description' in item:
            text_widget.insert(tk.END, f"- Description: {item['description']}\n")
        if 'effects' in item:
            text_widget.insert(tk.END, f"- Effect: {', '.join(item['effects'])}\n")
        if 'speed' in item:
            text_widget.insert(tk.END, f"- Speed: {item['speed']}\n")    
        if 'total_cost' in item:
            text_widget.insert(tk.END, f"- Cost: {item['cost']}, Rank: {item['rank']}, Total Cost: {item['total_cost']}\n")
        text_widget.insert(tk.END, "\n")
    
    text_widget.insert(tk.END, f"Total cost spent: {total_cost} of {allocated_points}\n")

def save_to_txt(items, filename):
    with open(filename, 'w') as file:
        for item in items:
            file.write(f"{item['name']}\n")
            if 'description' in item:
                file.write(f"- Description: {item['description']}\n")
            if 'effects' in item and isinstance(item['effects'], list):
                file.write(f"- Effect: {', '.join(item['effects'])}\n")
            if 'total_cost' in item:
                file.write(f"- Cost: {item['cost']}, Rank: {item['rank']}, Total Cost: {item['total_cost']}\n")
            file.write("\n")

def on_generate_equipment_click():
    points = int(equipment_points_entry.get())
    gadgets = load_gadgets()  # Make sure you have this function defined
    items, total_cost = random_gadget_generator(points, gadgets)

    # Create a new tab for displaying the equipment
    new_tab = ttk.Frame(notebook)
    notebook.add(new_tab, text=f"Equipment")
    equipment_text = tk.Text(new_tab, height=15, width=50)
    equipment_text.pack(expand=True, fill='both')
    text_widgets[new_tab] = equipment_text

    # Display the generated equipment
    display_gadgets(items, total_cost, points, equipment_text)

def on_save_equipment_click():
    selected_tab = notebook.nametowidget(notebook.select())
    text_widget = text_widgets.get(selected_tab)

    if text_widget:
        content = text_widget.get("1.0", tk.END)
        filename = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt")],
            initialdir=os.path.expanduser("~/Desktop")
        )
        if filename:
            with open(filename, 'w') as file:
                file.write(content)
            messagebox.showinfo("Save Equipment", f"Equipment saved to {filename}")

def save_equipment():
    selected_tab = notebook.nametowidget(notebook.select())
    text_widget = text_widgets.get(selected_tab)

    if text_widget and text_widget.get("1.0", tk.END).strip():
        content = text_widget.get("1.0", tk.END)
        filename = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt")],
            initialdir=os.path.expanduser("~/Desktop")
        )
        if filename:
            save_to_txt(content, filename)
            messagebox.showinfo("Save Equipment", f"Equipment saved to {filename}")
    else:
        messagebox.showerror("Error", "Please generate equipment before saving.")

def create_table_if_not_exists():
    with sqlite3.connect('tabs_data.db') as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS tabs
                     (content TEXT)''')
        conn.commit()

def save_tabs():
    with sqlite3.connect('tabs_data.db') as conn:
        c = conn.cursor()
        c.execute('DELETE FROM tabs')  # Clear existing data
        for tab in notebook.winfo_children():
            text_widget = text_widgets.get(tab)
            if text_widget:
                tab_content = text_widget.get("1.0", tk.END)
                c.execute('INSERT INTO tabs VALUES (?)', (tab_content,))
        conn.commit()

def load_tabs():
    conn = sqlite3.connect('tabs_data.db')
    c = conn.cursor()
    c.execute('SELECT * FROM tabs')
    tabs_data = c.fetchall()
    for tab_content, in tabs_data:
        create_new_tab(tab_content)
    conn.close()

def create_new_tab(content=""):
    new_tab = ttk.Frame(notebook)
    notebook.add(new_tab, text=f"Tab {notebook.index('end') + 1}")
    new_character_summary_text = tk.Text(new_tab, height=15, width=50)
    new_character_summary_text.pack(expand=True, fill='both')
    new_character_summary_text.insert("1.0", content)
    text_widgets[new_tab] = new_character_summary_text
    notebook.select(new_tab)  

    # Configure the highlight tag for the text widget
    new_character_summary_text.tag_configure('highlight', background='yellow')

def close_current_tab():
    # Get the currently selected tab widget
    current_tab = notebook.nametowidget(notebook.select())

    # Check if there is at least one tab open
    if notebook.tabs():
        # Close the selected tab
        notebook.forget(current_tab)
        # Remove the associated text widget from the dictionary
        text_widgets.pop(current_tab, None)

def apply_color_scheme_to_tab(tab, colors):
    for widget in tab.winfo_children():
        if isinstance(widget, tk.Text):
            widget.configure(bg=colors['text_background'], fg=colors['text_foreground'])
        # Add more types here if necessary
            
def update_color_scheme(mode, notebook):
    colors = dark_mode_colors if mode else light_mode_colors
    for tab in notebook.winfo_children(): 
        apply_color_scheme_to_tab(tab, colors)

def toggle_dark_mode():
    global dark_mode, notebook
    dark_mode = not dark_mode
    update_color_scheme(dark_mode, notebook)

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

def get_items_by_names(items_dict, names):
    return [items_dict[name] for name in names if name in items_dict]

def on_generate_button_click():
    global character, selected_archetype
    try:
        power_level = int(pl_entry.get())
        if power_level < 1 or power_level > 20:
            raise ValueError
    except ValueError:
        messagebox.showerror("Invalid Input", "Please enter a valid Power Level (1-20).")
        return

    archetype = selected_archetype.get()
    character = generate_character(power_level, archetype, include_powers=include_powers.get(), random_physical_features=True, random_costume_style=True, random_distinctive_feature=True)

    # Create a new tab
    new_tab = ttk.Frame(notebook)
    notebook.add(new_tab, text=f"Tab {notebook.index('end') + 1}")
    # Create a new text widget in the new tab
    new_character_summary_text = tk.Text(new_tab, height=15, width=50)
    new_character_summary_text.pack(expand=True, fill='both')
    new_character_summary_text.tag_configure("bold", font=("Helvetica", 12, "bold", "underline"))
    new_character_summary_text.tag_configure("bold_no_underline", font=("Helvetica", 10, "bold"))
    new_character_summary_text.tag_configure("normal_format", font=("Helvetica", 10))
    
    # Display the character information in the new text widget
    pretty_print_character(character, new_character_summary_text)
    text_widgets[new_tab] = new_character_summary_text
    # Switch to the new tab
    notebook.select(new_tab)
    colors = dark_mode_colors if dark_mode else light_mode_colors
    apply_color_scheme_to_tab(new_tab, colors)

def calculate_modified_cost(base_cost, rank, selected_extras_with_ranks, selected_flaws_with_ranks, extras, flaws):
    # Create dictionaries for easy access
    extras_dict = {extra["name"]: extra for extra in extras}
    flaws_dict = {flaw["name"]: flaw for flaw in flaws}

    # Calculate the total cost
    total_cost = base_cost * rank
    adjusted_cost_per_rank = base_cost
    adjusted_flats = 0

    for extra_name, extra_rank in selected_extras_with_ranks:
        extra_data = extras_dict[extra_name]
        extra_type = extra_data["type"]
        if extra_type == "per_rank":
            total_cost += extra_data["value"] * extra_rank
            adjusted_cost_per_rank += extra_data["value"]
        elif extra_type == "flat_per_rank":
            total_cost += extra_data["value"]
            adjusted_flats += extra_data["value"]

    for flaw_name, flaw_rank in selected_flaws_with_ranks:
        flaw_data = flaws_dict[flaw_name]
        flaw_type = flaw_data["type"]
        if flaw_type == "per_rank":
            total_cost -= flaw_data["value"] * flaw_rank
            adjusted_cost_per_rank -= flaw_data["value"]
        elif flaw_type == "flat_per_rank":
            total_cost -= flaw_data["value"]
            adjusted_flats -= flaw_data["value"]

    return total_cost, adjusted_cost_per_rank, adjusted_flats

def reduce_stat(character, stat_name, amount, allocated_points):
    refund = 0

    # Attempt to reduce from powers like 'Enhanced Trait'
    for power in character.get("powers", []):
        if power["name"] == f"Enhanced Trait {stat_name}" and power["rank"] > 0:
            reduction = min(power["rank"], amount)
            power["rank"] -= reduction
            amount -= reduction
            refund += reduction  # Add the points back to the pool
            if amount == 0:
                break

    # Attempt to reduce from advantages, like 'Defensive Roll' for Toughness
    if stat_name == "Toughness":
        for advantage in character.get("advantages", []):
            if advantage["name"] == "Defensive Roll" and advantage["rank"] > 0:
                reduction = min(advantage["rank"], amount)
                advantage["rank"] -= reduction
                amount -= reduction
                refund += reduction  # Add the points back to the pool
                if amount == 0:
                    break

    # Attempt to reduce from the corresponding base stat
    if amount > 0:
        base_stats = {
            "Dodge": "Agility",
            "Parry": "Fighting",
            "Fortitude": "Stamina",
            "Toughness": "Stamina",
            "Will": "Awareness"
        }
        base_stat = base_stats.get(stat_name)
        if base_stat and character["stats"].get(base_stat, {}).get("value", 0) > 0:
            available_reduction = character["stats"][base_stat]["value"]
            reduction = min(available_reduction, amount)
            character["stats"][base_stat]["value"] -= reduction
            amount -= reduction
            refund += reduction  # Add the points back to the pool

    # Update allocated points
    allocated_points["powers"] += refund
    return refund  # Return the amount refunded

def calculate_total_cost(character):
    total_stat_cost = sum(details['cost'] for details in character['stats'].values())
    total_advantage_cost = sum(advantage['cost'] for advantage in character['advantages'])
    total_skill_cost = sum(skill['cost'] for skill in character['skills'])
    total_power_cost = sum(power['cost'] for power in character['powers'])
    
    return total_stat_cost + total_advantage_cost + total_skill_cost + total_power_cost

def calculate_defenses(character, power_level,allocated_points):
    defenses = {
        "Dodge": character["stats"].get("Agility", {}).get("value", 0) + character["stats"].get("Dodge", {}).get("value", 0),
        "Fortitude": character["stats"].get("Stamina", {}).get("value", 0) + character["stats"].get("Fortitude", {}).get("value", 0),
        "Parry": character["stats"].get("Fighting", {}).get("value", 0) + character["stats"].get("Parry", {}).get("value", 0),
        "Toughness": character["stats"].get("Stamina", {}).get("value", 0),
        "Will": character["stats"].get("Awareness", {}).get("value", 0) + character["stats"].get("Will", {}).get("value", 0),
    }

    # Add enhancements from powers
    for power in character.get("powers", []):
        if power["name"].startswith("Enhanced Trait"):
            defense_name = power["name"].split()[-1]
            if defense_name in defenses:
                defenses[defense_name] += power["rank"]

    # Add Defensive Roll to Toughness
    defensive_roll_bonus = sum(advantage.get("rank", 0) for advantage in character.get("advantages", []) if advantage["name"] == "Defensive Roll")
    defenses["Toughness"] += defensive_roll_bonus

    # Add Protection Power to Toughness
    protection_bonus = sum(power.get("rank", 0) for power in character.get("powers", []) if power["name"] == "Protection")
    defenses["Toughness"] += protection_bonus

    # Enforce power level caps for defense pairs
    defense_pairs = {
        ("Dodge", "Toughness"): power_level * 2,
        ("Parry", "Toughness"): power_level * 2,
        ("Fortitude", "Will"): power_level * 2
    }

    for defense_pair, cap in defense_pairs.items():
        total = sum(defenses[defense] for defense in defense_pair)
        if total > cap:
            excess = total - cap
            for defense in defense_pair:
                if defenses[defense] > 0:
                    # Note: The refund from reduce_stat should update allocated_points
                    refund = reduce_stat(character, defense, excess, allocated_points)
                    defenses[defense] = max(0, defenses[defense])
                    total = sum(defenses[defense] for defense in defense_pair)
                    if total <= cap:
                        break

    return defenses

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

def on_export_character_sheet_click(character):
    # Retrieve origin details from character
    origin_region = character['origin']['region']
    origin_country = character['origin']['country']
    origin_language = character['origin']['language']
    total_cost = calculate_total_cost(character)
    # Retrieve equipment from character
    equipment = character.get('equipment', [])

    # Retrieve languages from character and format them
    languages = character['languages']  # Assuming this is a list of language names
    formatted_languages = ", ".join(languages)
    # Check if a character has been generated
    character["total_cost"] = calculate_total_cost(character)
    selected_tab = notebook.nametowidget(notebook.select())
    text_widget = text_widgets.get(selected_tab)
    if not text_widget or not text_widget.get("1.0", tk.END).strip():
        messagebox.showerror("Error", "Please generate a character before exporting.")
        return
    
    # Open the existing character sheet
    wb = load_workbook(filename='CharacterName.xlsx')
    sheet = wb.active

    default_font = Font(size=8)
    for row in sheet.iter_rows():
        for cell in row:
            cell.font = default_font

    # Update the cells with data from the character summary
    sheet['K2'] = character['name']
    sheet['AP2'] = character['gender']
    sheet['BD2'] = character['age']
    sheet['W33'] = character['power_level']
    sheet['AD26'] = f"{character['theme']}" 
    sheet['R38'] = formatted_languages
    sheet['G93'] = f"{origin_region} | {origin_country} | {origin_language}"
    sheet['BE5'] = character['physical_traits']['height']
    sheet['BE8'] = character['physical_traits']['build']
    sheet['AP5'] = character['physical_traits']['eye_color']
    sheet['AP8'] = character['physical_traits']['hair_color'] 
    sheet['N18'] = character['stats'].get('Strength', {}).get('value', '')
    sheet['N26'] = character['stats'].get('Agility', {}).get('value', '')
    sheet['N34'] = character['stats'].get('Fighting', {}).get('value', '')
    sheet['N42'] = character['stats'].get('Awareness', {}).get('value', '')   
    sheet['N22'] = character['stats'].get('Stamina', {}).get('value', '')       
    sheet['N30'] = character['stats'].get('Dexterity', {}).get('value', '')
    sheet['N38'] = character['stats'].get('Intellect', {}).get('value', '')
    sheet['N46'] = character['stats'].get('Presence', {}).get('value', '')
    sheet['Z18'] = character['defenses'].get('Dodge', '')
    sheet['Z24'] = character['defenses'].get('Parry', '')
    sheet['Z21'] = character['defenses'].get('Fortitude', '')
    sheet['Z30'] = character['defenses'].get('Toughness', '')
    sheet['Z27'] = character['defenses'].get('Will', '')
    sheet['AK18'] = character['initiative']
    sheet['AD33'] = f"{int(total_cost)}"

    # Compile personality traits
    positive_traits = " | ".join(character['personality_traits']['positive_traits'])
    negative_traits = " | ".join(character['personality_traits']['negative_traits'])
    quirky_traits = " | ".join(character['personality_traits']['quirky_traits'])
    all_traits = f"Personality: {positive_traits} | {negative_traits} | {quirky_traits}"

    # Assign traits to cell K11
    sheet['AK90'] = all_traits

    # Calculate attack bonuses
    melee_attack_bonus, ranged_attack_bonus = calculate_attack_bonuses(character)

    # Write Melee and Ranged Attack Bonuses
    sheet['AN20'] = "Melee Attack Bonus"
    sheet['BB20'] = melee_attack_bonus  # This cell for the bonus total only

    sheet['AN36'] = "Ranged Attack Bonus"
    sheet['BB36'] = ranged_attack_bonus  # This cell for the bonus total only

    melee_row = 22
    ranged_row = 38

    for power in character["powers"]:
        # Calculate accuracy for each power
        accuracy = calculate_accuracy(character, power)  # Ensure this function is defined and working correctly

        power_details = f"{power['name']}"
        if 'resisted' in power:
            power_details += f", Res: {power['resisted']}"

        if power["range"] == "Melee" and melee_row <= 34:
            if 'close_range' in power:
                power_details += f" | {power['close_range']},{power['medium_range']},{power['long_range']}"
            sheet[f'AN{melee_row}'] = power_details
            sheet[f'BF{melee_row}'] = power['rank']
            sheet[f'BB{melee_row}'] = accuracy
            melee_row += 2  # Increment to move to the next cell for the next melee power

        elif power["range"] == "Ranged" and ranged_row <= 50:
            if 'close_range' in power:
                power_details += f" | {power['close_range']},{power['medium_range']},{power['long_range']}"
            sheet[f'AN{ranged_row}'] = power_details
            sheet[f'BF{ranged_row}'] = power['rank']
            sheet[f'BB{ranged_row}'] = accuracy
            ranged_row += 2  # Increment to move to the next cell for the next ranged power

    # Write the sum to the merged cell N12-O12
    total_advantage_cost = sum(advantage['cost'] for advantage in character['advantages'])
    sheet['AQ14'] = total_advantage_cost

    # Load advantages data including descriptions
    advantages_data = load_data_from_json('advantages.json')
    advantage_descriptions = {adv['name']: adv['description'] for adv in advantages_data}

    # Prepare cell mappings for names, ranks, and descriptions
    advantage_name_cells = [f'X{i}' for i in range(104, 142, 2)]
    advantage_rank_cells = [f'AE{i}' for i in range(104, 142, 2)]
    advantage_description_cells = [f'AG{i}' for i in range(104, 142, 2)]

    # Write advantage data to Excel
    for advantage, name_cell, rank_cell, desc_cell in zip(character['advantages'], advantage_name_cells, advantage_rank_cells, advantage_description_cells):
        try:
            sheet[name_cell] = advantage['name']
            sheet[rank_cell] = advantage['rank']
            sheet[desc_cell] = advantage_descriptions.get(advantage['name'], "No description available.")
        except KeyError as e:
            print(f"Error writing advantage data for {advantage['name']}: {str(e)}")

    # Add Skills
    skills = load_data_from_json('skills.json')
    skill_rank_cells = {
        "Acrobatics": "P104",
        "Athletics": "P106",
        "Melee H2H": "P108",
        "Close Combat": "P110",  # Assuming all Melee entries are under this, further differentiation needed if not
        "Deception": "P118",
        "Expertise": "P120",  # Assuming multiple Expertise entries map to different rows
        "Insight": "P130",
        "Intimidation": "P132",
        "Investigation": "P134",
        "Perception": "P136",
        "Persuasion": "P138",
        "Ranged Combat": "P140",
        "Stealth": "P150",
        "Technology": "P152",
        "Treatment": "P154",
        "Vehicles": "P156",
        "Sleight of Hand": "P148"
    }
    skill_total_cells = {key: 'S' + value[1:] for key, value in skill_rank_cells.items()}  # Mapping rank cells to total cells

    total_skills_cost = 0
    for skill_template in skills:
        skill_name = skill_template['name']
        if skill_name in skill_rank_cells:
            try:
                # Get the skill from the character if it exists, otherwise use a default of 0 for rank
                skill = next((s for s in character['skills'] if s['name'] == skill_name), {'rank': 0})
                stat_bonus = sum(character['stats'][tag]['value'] for tag in skill_template['tags'])  # Calculate stat bonus
                rank = skill['rank']
                total_bonus = rank + stat_bonus  # Calculate total

                # Write rank and total to the specified cells
                sheet[skill_rank_cells[skill_name]] = rank
                sheet[skill_total_cells[skill_name]] = total_bonus

                # Sum up costs for the total skills cost
                total_skills_cost += skill_template.get('cost', 0) * rank  # Assuming cost per rank
            except AttributeError:
                print(f"Error writing skill data for {skill_name}. Skipping.")
        else:
            print(f"Skill {skill_name} not found in the cell mapping. Skipping.")

    # Directly calculate and write the total skills cost to the Excel cell
    total_skills_cost = sum(skill['cost'] for skill in character['skills'])
    sheet['BF14'] = total_skills_cost

    # Write Motivation
    motivation_name = character['Motivation']['name']
    motivation_description = character['Motivation']['description']
    sheet['F88'] = f"{motivation_name}: {motivation_description}"

    # Write Complications
    complication_cells = ['F90', 'AK88']
    for comp, cell in zip(character["Complications"], complication_cells):
        comp_name = comp['name']
        comp_description = comp['description']
        sheet[cell] = f"{comp_name}: {comp_description}"

    # Concatenate equipment details
    equipment_details = ""
    for item in equipment:
        item_name = item.get('name', 'Unknown')
        rank = item.get('rank', 'Unknown')
        cost = item.get('cost', 'Unknown')
        effect = item.get('effect', '')

        # Format effect
        effect_str = f"Effect: {effect}" if effect else ''

        # Concatenate item details
        item_details = f"{item_name} | Rank: {rank} | Cost: {cost} | {effect_str}\n"
        equipment_details += f"{item_details}"

    # Write equipment details to cell AI55
    sheet['AI55'] = equipment_details.strip()


# Writing power details to the Excel sheet
    power_cells = [f'B{i}' for i in range(54, 84, 3)]  # Adjust the range as needed for more powers
    total_cost_cells = [f'AE{i}' for i in range(54, 84, 3)]
        
    for power, cell, total_cost_cell in zip(character['powers'], power_cells, total_cost_cells):
        # Simplify the construction of power details string
        power_details = f"{power['name']} | Rank: {power['rank']} | "
        extras_details = ', '.join([f"{extra} ({rank})" for extra, rank in zip(power['extras'], power['extras_ranks'])]) if 'extras' in power else ""
        flaws_details = ', '.join([f"{flaw} ({rank})" for flaw, rank in zip(power['flaws'], power['flaws_ranks'])]) if 'flaws' in power else ""

        # Append failure effects if the power is "Affliction" or "Ranged Affliction"
        if power['name'] in ["Affliction", "Ranged Affliction"] and 'failure_effects' in power:
            effects_text = " | ".join([effect for _, effect in power['failure_effects'].items()])
            power_details += f"Effects: {effects_text} | "

        # Combine details with extras and flaws
        power_full_details = f"{power_details}Extras: {extras_details} | Flaws: {flaws_details} |"

        # Write to Excel
        sheet[cell] = power_full_details.strip()

        # Optionally, you might want to adjust how total costs are handled if they are still required:
        # sheet[total_cost_cell] = power['cost']  # Write the individual power's total cost to its respective cell if necessary

        sheet[total_cost_cell] = power['cost']  # Write the individual power's total cost to its respective cell

    # Directly calculate and write the total powers cost to the Excel cell
    total_powers_cost = sum(power['cost'] for power in character['powers'])
    sheet['AB14'] = total_powers_cost

    # Calculate and write the total abilities cost to the Excel cell
    total_abilities_cost = sum(details['cost'] for details in character['stats'].values())
    sheet['M14'] = total_abilities_cost
    
    # Ask the user for a filename and save the updated character sheet
    filename = filedialog.asksaveasfilename(
        defaultextension=".xlsx",
        filetypes=[("Excel files", "*.xlsx")],
        initialdir=os.path.expanduser("~/Desktop")
    )
    if filename:
        wb.save(filename)
        messagebox.showinfo("Export to Character Sheet", f"Character sheet exported to {filename}")

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

def allocate_stat(stat_name, allocated_points, total_range, stats):
    stat_details = next(stat for stat in stats["STATS"] if stat["name"] == stat_name)
    stat_range = stat_details["range"][1] - stat_details["range"][0] + 1
    max_possible_allocation = allocated_points * (stat_range / total_range)
    
    if stat_name in ["Parry", "Dodge", "Fortitude", "Will"]:
        attribute_value = random.randint(stat_details["range"][0], int(stat_details["range"][0] + max_possible_allocation))
        cost = abs(attribute_value - stat_details["range"][0])  # 1 point per rank
    else:
        attribute_value = random.randint(stat_details["range"][0], int(stat_details["range"][0] + max_possible_allocation))
        cost = abs(attribute_value - stat_details["range"][0]) * 2  # 2 points per rank

    return (attribute_value, cost) if cost <= allocated_points else (allocated_points, allocated_points)

def allocate_stats(character, power_level, allocated_points, total_range, allocations):
    stats = load_data_from_json('stats.json')

    # Ensure that allocations["stats"] is an iterable
    if not isinstance(allocations["stats"], (list, tuple)):
        raise ValueError(f"Expected allocations['stats'] to be a list or tuple, got {type(allocations['stats'])}")

    # Allocate points for each stat
    for stat in stats["STATS"]:
        stat_name = stat["name"]
        # Use allocated_percentages for determining the range
        stat_percentage = random.uniform(*allocations["stats"])
        stat_points = int(stat_percentage * power_level * POWER_POINTS_PER_LEVEL)
        attribute_value, cost = allocate_stat(stat_name, stat_points, total_range, stats)
        character["stats"][stat_name] = {"value": attribute_value, "cost": cost}
        allocated_points["stats"] -= cost

    return character, allocated_points

def allocate_advantages(character, allocated_points, power_level, max_advantages, allocations):
    advantages = load_data_from_json('advantages.json')
    random.shuffle(advantages)  # Shuffle the list of advantages
    for advantage in advantages:
        if allocated_points["advantages"] <= 0 or len(character["advantages"]) >= max_advantages:
            break
        if advantage["cost"] <= allocated_points["advantages"]:
            max_rank = min(advantage.get("max_rank", power_level), allocated_points["advantages"] // advantage["cost"])
            if max_rank > 0:
                rank = random.randint(1, max_rank)
                adjusted_cost = advantage["cost"] * rank
                character["advantages"].append({
                    "name": advantage["name"],
                    "rank": rank,
                    "cost": adjusted_cost
                })
                allocated_points["advantages"] -= adjusted_cost

            # Adjust the rank for the "Languages" advantage
            if advantage["name"] == "Languages":
                weights = [0.06, 0.05, 0.04, 0.03, 0.02, 0.01]
                for i, weight in enumerate(weights, start=2):
                    if random.random() <= weight:
                        rank = i
                        break

    return character, allocated_points

def allocate_skills(character, allocated_points, power_level, allocations):
    skills = load_data_from_json('skills.json')
    for skill in skills:
        if allocated_points["skills"] <= 0:
            break
        rank = random.randint(1, min(power_level + 10, allocated_points["skills"]))
        rank -= 1 if rank % 2 != 0 else 0
        adjusted_cost = rank / 2
        character["skills"].append({
            "name": skill["name"],
            "rank": rank,
            "cost": adjusted_cost,
            "tags": skill.get("tags", [])
        })
        allocated_points["skills"] -= skill["cost"] * rank
    return character, allocated_points

def allocate_powers(character, allocated_points, power_level, allocations):
    powers = load_data_from_json('powers.json')
    random.shuffle(powers)  # Shuffle the list of powers to randomize their order
    extras = load_data_from_json('extras.json')
    flaws = load_data_from_json('flaws.json')
    power_range = allocations.get("power_range", [1, 3])
    num_powers = random.randint(*power_range)
    selected_power_names = []

    while len(character["powers"]) < num_powers and allocated_points["powers"] > 0:
        for power in powers:
            if power["name"] in selected_power_names:
                continue
            base_cost = power["cost"]
            max_rank = power.get("max_rank", power_level)
            if max_rank > 0 and base_cost <= allocated_points["powers"]:
                rank = random.randint(1, min(max_rank, allocated_points["powers"]))

                available_extras = [extra for extra in extras if extra["name"] not in power.get("excluded_extras", [])]
                available_flaws = [flaw for flaw in flaws if flaw["name"] not in power.get("excluded_flaws", [])]

                num_extras = random.randint(0, min(3, len(available_extras)))
                num_flaws = random.randint(0, min(3, len(available_flaws)))

                selected_extras = random.sample(available_extras, num_extras)
                selected_flaws = random.sample(available_flaws, num_flaws)

                selected_extras_with_ranks = [(extra["name"], random.randint(1, min(extra["max_rank"], rank))) for extra in selected_extras]
                selected_flaws_with_ranks = [(flaw["name"], random.randint(1, min(flaw["max_rank"], rank))) for flaw in selected_flaws]

                # Determine the range for Accurate extra based on power level
                if power_level <= 3:
                    accurate_rank_range = (0, 0)
                elif power_level <= 7:
                    accurate_rank_range = (1, 2)
                elif power_level <= 12:
                    accurate_rank_range = (2, 4)
                else:
                    accurate_rank_range = (3, 5)

                # Add "Accurate" extra if it's a combat power
                if power["type"] == "Combat":
                    accurate_rank = random.randint(*accurate_rank_range)  # Assign a random rank within the determined range
                    if accurate_rank > 0:  # Only add Accurate if the rank is greater than 0
                        selected_extras_with_ranks.append(("Accurate", accurate_rank))  # Add Accurate with a randomly chosen rank

                total_cost, adjusted_cost_per_rank, adjusted_flats = calculate_modified_cost(
                    base_cost, rank, selected_extras_with_ranks, selected_flaws_with_ranks, extras, flaws
                )

                # Ensure accuracy + rank <= PL * 2
                max_total = power_level * 2
                for i, (extra_name, extra_rank) in enumerate(selected_extras_with_ranks):
                    if extra_name == "Accurate" and extra_rank + rank > max_total:
                        adjusted_accurate_rank = max_total - rank
                        selected_extras_with_ranks[i] = (extra_name, adjusted_accurate_rank)
                        total_cost += adjusted_accurate_rank - extra_rank

                total_cost = max(total_cost, 1)
                if total_cost <= allocated_points["powers"]:
                    power_entry = {
                        "name": power["name"],
                        "rank": rank,
                        "type": power["type"],
                        "base_cost": base_cost,
                        "range": power.get("range"),
                        "adjusted_cost_per_rank": adjusted_cost_per_rank,
                        "adjusted_flats": adjusted_flats,
                        "extras": [extra[0] for extra in selected_extras_with_ranks],
                        "extras_ranks": [extra[1] for extra in selected_extras_with_ranks],
                        "flaws": [flaw[0] for flaw in selected_flaws_with_ranks],
                        "flaws_ranks": [flaw[1] for flaw in selected_flaws_with_ranks],
                        "cost": total_cost
                    }

                    if 'resisted' in power:
                        power_entry['resisted'] = random.choice(power['resisted']) if isinstance(power['resisted'], list) else power['resisted']

                    if power["name"] == "Affliction" or power["name"] == "Ranged Affliction":
                        power_entry['failure_effects'] = random_failure_effects()

                    if 'Increased Range' in power_entry['extras']:
                        increased_range_rank = power_entry['extras_ranks'][power_entry['extras'].index('Increased Range')]
                        power_entry['increased_range'] = calculate_range(increased_range_rank)
                    if power_entry.get("range") == "Ranged":
                        base_rank = power_entry["rank"]
                        if "Increased Range" in power_entry["extras"]:
                            increased_range_index = power_entry["extras"].index("Increased Range")
                            increased_range_rank = power_entry["extras_ranks"][increased_range_index]
                            base_rank += increased_range_rank
                        power_entry["close_range"] = base_rank * 25
                        power_entry["medium_range"] = base_rank * 50
                        power_entry["long_range"] = base_rank * 100

                    if power_entry['name'].startswith('Enhanced Trait'):
                        defense_name = power_entry['name'].replace('Enhanced Trait ', '')
                        if defense_name in ['Dodge', 'Parry', 'Fortitude', 'Will']:
                            character['defenses'][defense_name] += power_entry['rank']

                    character["powers"].append(power_entry)
                    selected_power_names.append(power["name"])
                    allocated_points["powers"] -= total_cost

    return character, allocated_points

def generate_character(power_level, archetype, include_powers=True, random_physical_features=False, random_costume_style=False, random_distinctive_feature=False):
    random.seed()
    random_theme = generate_random_theme() 
    
    # Load stats data from JSON
    stats = load_data_from_json('stats.json')
    if not isinstance(stats.get("STATS"), list):
        print("Error: 'stats.json' does not contain a list of stats.")
        return None

    # Initialize character
    gender, name = generate_random_gender()
    character = {
        "defenses": {
            "Dodge": 0,
            "Fortitude": 0,
            "Parry": 0,
            "Will": 0
        },
        "name": name,
        "gender": gender,
        "power_level": power_level,
        "theme": random_theme,
        "stats": {},
        "advantages": [],
        "skills": [],
        "powers": [],
        "total_cost": 0,
        'age': generate_random_age(),
        "physical_traits": {
            "height": generate_random_physical_trait("HEIGHT") if random_physical_features else "Not Specified",
            "build": generate_random_physical_trait("BUILD") if random_physical_features else "Not Specified",
            "eye_color": generate_random_physical_trait("EYE_COLOR") if random_physical_features else "Not Specified",
            "hair_color": generate_random_physical_trait("HAIR_COLOR") if random_physical_features else "Not Specified",
            "skin_tone": generate_random_physical_trait("SKIN_TONE") if random_physical_features else "Not Specified"
        },
        "costume_style": generate_random_costume_style() if random_costume_style else "Not Specified",
        "distinctive_feature": generate_random_distinctive_feature() if random_distinctive_feature else "Not Specified",
        "personality_traits": generate_random_traits()  # Add the randomly generated traits here
        
    }

    # Load archetypes from the JSON file
    archetypes = load_archetypes()
    allocation_key = "with_powers" if include_powers else "without_powers"
    allocations = archetypes[archetype][allocation_key]
    max_points = power_level * POWER_POINTS_PER_LEVEL
    allocated_points = {category: int(allocations[category][1] * max_points) for category in allocations if category != "max_advantages" and category != "max_powers" and category != "power_range"}
    allocated_points["skills"] = math.floor(allocated_points["skills"])
    max_advantages = allocations["max_advantages"]
    character['failure_effects'] = random_failure_effects() 

    # Allocate stats, advantages, skills, and powers
    total_range = sum(details["range"][1] - details["range"][0] + 1 for details in stats["STATS"])
    character, allocated_points = allocate_stats(character, power_level, allocated_points, total_range, allocations)
    character, allocated_points = allocate_advantages(character, allocated_points, power_level, max_advantages, allocations)
    character, allocated_points = allocate_skills(character, allocated_points, power_level, allocations)

    # Check if powers are included and allocate accordingly
    if include_powers:
        character, allocated_points = allocate_powers(character, allocated_points, power_level, allocations)

    equipment_advantage = next((adv for adv in character["advantages"] if adv["name"] == "Equipment"), None)
    if equipment_advantage:
        # If they rolled Equipment, adjust the rank and cost to match the PL, if it's less
        if equipment_advantage['rank'] < power_level:
            equipment_advantage['rank'] = power_level
            allocated_points["advantages"] += equipment_advantage['cost']  # Refund the original cost
            equipment_advantage['cost'] = power_level  # Set new cost
            allocated_points["advantages"] -= power_level  # Deduct new cost
    else:
        # If they didn't roll Equipment, allocate new points equal to the PL
        equipment_advantage = {"name": "Equipment", "rank": power_level, "cost": power_level}
        character["advantages"].append(equipment_advantage)
        allocated_points["advantages"] -= power_level  # Deduct cost

    # Calculate equipment based on the updated rank in the Equipment advantage
    equipment_points = equipment_advantage["rank"] * 5  # Each rank of Equipment provides 5 equipment points
    gadgets = load_gadgets()
    items, total_cost = random_gadget_generator(equipment_points, gadgets)
    character['equipment'] = items

    # Calculate other character properties
    character["defenses"] = calculate_defenses(character, power_level, allocated_points)
    character["initiative"] = calculate_initiative(character)
    character["total_cost"] = calculate_total_cost(character)
    motivations_and_complications = generate_motivations_and_complications()
    character.update(motivations_and_complications)
    character["languages"] = assign_languages(character)
    character['origin'] = generate_random_origin()
    character['generation_log'] = []

    return character

def pretty_print_character(character, text_widget):
    text_widget.insert("end", "Character Creation Summary Version\n", "bold")
    text_widget.insert("end", "-" * 40 + "\n")

    text_widget.insert("end", "\nTHEME:\n", "bold")
    text_widget.insert("end", f"- {character['theme']}\n")

    text_widget.insert("end", "\nSTATS:\n", "bold")
    for stat, details in character["stats"].items():
        text_widget.insert("end", f"- ", "bold_no_underline")
        text_widget.insert("end", f"{stat}: ", "bold_no_underline")
        text_widget.insert("end", f"{details['value']} (Cost: {details['cost']})\n")

    text_widget.insert("end", "\nADVANTAGES:\n", "bold")
    for advantage in character["advantages"]:
        text_widget.insert("end", f"- ", "bold_no_underline")
        text_widget.insert("end", f"{advantage['name']} ", "bold_no_underline")
        text_widget.insert("end", f"(Rank: {advantage['rank']}, Cost: {advantage['cost']})\n")

    text_widget.insert("end", "\nSKILLS:\n", "bold")
    skills = load_data_from_json('skills.json')
    for skill_template in skills:
        skill_name = skill_template["name"]
        skill = next((s for s in character["skills"] if s["name"] == skill_name), None)
        rank = skill["rank"] if skill else 0
        total = rank + sum(character["stats"].get(tag, {}).get("value", 0) for tag in skill_template.get("tags", []))
        cost = rank / 2 if rank > 0 else 0
        text_widget.insert("end", f"- ", "bold_no_underline")
        text_widget.insert("end", f"{skill_name} ", "bold_no_underline")
        text_widget.insert("end", f"(Rank: {rank}, Cost: {cost:.1f}, Total: {total})\n")

    sorted_powers = sorted(character["powers"], key=lambda p: ["Combat", "Defensive", "Support", "Movement", "Utility", "Unknown"].index(p.get("type", "Unknown")))
    text_widget.insert("end", "\nPOWERS:\n", "bold")
    for power in sorted_powers:
        # Display power details
        power_details = f"{power['name']} (Rank: {power['rank']}, Cost: {power['cost']})"
        text_widget.insert("end", power_details + "\n")
        

        if 'resisted' in power:
            text_widget.insert("end", f"  Resisted by: {power['resisted']}\n")

        if power['type'] == 'Combat':
            accuracy = calculate_accuracy(character, power)
            text_widget.insert("end", f"  Accuracy: {accuracy}\n")

        # Display failure effects if it is the Affliction power
        if power['name'] == "Affliction" and 'failure_effects' in power:
            effects_text = " | ".join([effect for _, effect in power['failure_effects'].items()])
            text_widget.insert("end", f"Failure Effects: {effects_text}\n")

                    # Display failure effects if it is the Affliction power
        if power['name'] == "Ranged Affliction" and 'failure_effects' in power:
            effects_text = " | ".join([effect for _, effect in power['failure_effects'].items()])
            text_widget.insert("end", f"Failure Effects: {effects_text}\n")

        if 'extras' in power and power['extras']:
            extras_details = ", ".join([f"{extra_name} (Rank: {extra_rank})" for extra_name, extra_rank in zip(power['extras'], power['extras_ranks'])])
            text_widget.insert("end", f"- Extras: {extras_details}\n")

        if 'flaws' in power and power['flaws']:
            flaws_details = ", ".join([f"{flaw_name} (Rank: {flaw_rank})" for flaw_name, flaw_rank in zip(power['flaws'], power['flaws_ranks'])])
            text_widget.insert("end", f"- Flaws: {flaws_details}\n")

        if 'increased_range' in power:
            text_widget.insert("end", f"- Increased Range: {power['increased_range']} feet\n")

    if 'equipment' in character:
        text_widget.insert("end", "\nEQUIPMENT:\n", "bold")
        for item in character['equipment']:
            text_widget.insert("end", f"- {item['name']}\n")
            if 'description' in item:
                text_widget.insert("end", f"  Description: {item['description']}\n")
            if 'effects' in item:
                text_widget.insert("end", f"  Effects: {', '.join(item['effects'])}\n")
            if 'rank' in item:
                text_widget.insert("end", f"  Rank: {item['rank']}\n")
            if 'cost' in item:
                text_widget.insert("end", f"  Cost: {item['cost']}\n")

    text_widget.insert("end", "\nDEFENSES:\n", "bold")
    defenses = character["defenses"]
    for defense, value in defenses.items():
        text_widget.insert("end", f"- ", "bold_no_underline")
        text_widget.insert("end", f"{defense}: ", "bold_no_underline")
        text_widget.insert("end", f"{value}\n")

    text_widget.insert("end", "\nATTACKS:\n", "bold")
    melee_attack_bonus, ranged_attack_bonus = calculate_attack_bonuses(character)
    text_widget.insert("end", "Melee Attack Bonus: ", "bold_no_underline")
    text_widget.insert("end", f"{melee_attack_bonus}\n")

    # Display melee powers
    for power in character["powers"]:
        if power.get("range") == "Melee":
            text_widget.insert("end", f"    - {power['name']} (Effect Rank: {power['rank']})\n")

    text_widget.insert("end", "Ranged Attack Bonus: ", "bold_no_underline")
    text_widget.insert("end", f"{ranged_attack_bonus}\n")

    # Display ranged powers
    for power in character["powers"]:
        if power.get("range") == "Ranged":
            text_widget.insert("end", f"    - {power['name']} (Effect Rank: {power['rank']})\n")
            if "close_range" in power:
                text_widget.insert("end", f"        Close Range: {power['close_range']} ft, Medium Range: {power['medium_range']} ft, Long Range: {power['long_range']} ft\n")


    text_widget.insert("end", f"\nNAME: {character['name']}\n", "bold")
    text_widget.insert("end", f"GENDER: {character['gender']}\n", "bold")
    text_widget.insert("end", f"AGE: {character['age']}\n", "bold")
    text_widget.insert("end", "\nORIGIN:\n", "bold")
    origin = character['origin']
    text_widget.insert("end", f"Region: {origin['region']}\n")
    text_widget.insert("end", f"Country: {origin['country']}\n")
    text_widget.insert("end", f"Language: {origin['language']}\n")


    text_widget.insert("end", "\nPHYSICAL TRAITS:\n", "bold")
    for trait, value in character["physical_traits"].items():
        text_widget.insert("end", f"{trait.capitalize()}: ", "bold_no_underline")
        text_widget.insert("end", f"{value}\n")
    text_widget.insert("end", "Costume Style: ", "bold_no_underline")
    text_widget.insert("end", f"{character['costume_style']}\n")
    text_widget.insert("end", "Distinctive Feature: ", "bold_no_underline")
    text_widget.insert("end", f"{character['distinctive_feature']}\n")

    # Display Personality Traits
    text_widget.insert("end", "\nPERSONALITY TRAITS:\n", "bold")
    text_widget.insert("end", "Positive Traits:\n", "bold")
    positive_traits = " | ".join(character['personality_traits']['positive_traits'])
    text_widget.insert("end", f"{positive_traits}\n")

    text_widget.insert("end", "Negative Traits:\n", "bold")
    negative_traits = " | ".join(character['personality_traits']['negative_traits'])
    text_widget.insert("end", f"{negative_traits}\n")

    text_widget.insert("end", "Quirky Traits:\n", "bold")
    if character['personality_traits']['quirky_traits']:  # Check if there are any quirky traits
        quirky_traits = " | ".join(character['personality_traits']['quirky_traits'])
        text_widget.insert("end", f"{quirky_traits}\n")
    else:
        text_widget.insert("end", "None\n")


    text_widget.insert("end", "\nLANGUAGES:\n", "bold")
    for language in character['languages']:
        text_widget.insert("end", f"- {language}\n")

    text_widget.insert("end", "\nINITIATIVE:\n", "bold")
    initiative_value = character['initiative']
    text_widget.insert("end", f"{initiative_value}\n")

    text_widget.insert("end", "\nMOTIVATION:\n", "bold")
    motivation_name = character['Motivation']['name']
    motivation_description = character['Motivation']['description']
    text_widget.insert("end", f"- {motivation_name}: ", "bold_no_underline")
    text_widget.insert("end", f"{motivation_description}\n")

    text_widget.insert("end", "\nCOMPLICATIONS:\n", "bold")
    for complication in character["Complications"]:
        comp_name = complication['name']
        comp_description = complication['description']
        text_widget.insert("end", f"- {comp_name}: ", "bold_no_underline")
        text_widget.insert("end", f"{comp_description}\n")

    total_cost = calculate_total_cost(character)
    text_widget.insert("end", "\n" + "-" * 40 + "\n")
    text_widget.insert("end", f"Power Level: {character['power_level']}\n", "bold")
    text_widget.insert("end", f"TOTAL COST: {int(total_cost)}\n", "bold")  # Convert to int for display
    max_points = character['power_level'] * POWER_POINTS_PER_LEVEL
    text_widget.insert("end", f"Maximum Points Allowed: {max_points}\n", "bold")
    text_widget.insert("end", f"Attributes Total Cost: {int(sum(details['cost'] for details in character['stats'].values()))}\n", "bold")  # Convert to int
    text_widget.insert("end", f"Advantages Total Cost: {int(sum(advantage['cost'] for advantage in character['advantages']))}\n", "bold")  # Convert to int
    text_widget.insert("end", f"Skills Total Cost: {int(sum(skill['cost'] for skill in character['skills']))}\n", "bold")  # Convert to int
    text_widget.insert("end", f"Powers Total Cost (Adjusted): {int(sum(power['cost'] for power in character['powers']))}\n", "bold")  # Convert to int

def main():
    global root, notebook, dark_mode, include_powers, pl_entry, text_widgets, equipment_points_entry, search_var, selected_archetype
    root = tk.Tk()
    root.title("Character Creation Version 1.0.Prod")
    dark_mode = True
    include_powers = tk.BooleanVar()
    text_widgets = {}
    create_table_if_not_exists()

    # Main layout frames
    left_frame = tk.Frame(root)
    left_frame.grid(row=0, column=0, sticky="ns")

    right_frame = tk.Frame(root)
    right_frame.grid(row=0, column=1, sticky="nsew")

    # Notebook for character display
    notebook = ttk.Notebook(right_frame)
    notebook.pack(expand=True, fill='both')

    load_tabs()  # Load tabs when the program starts

    # Search Box Widgets
    search_frame = tk.Frame(right_frame)
    search_frame.pack(side='top', anchor='ne')

    search_var = StringVar()
    search_entry = tk.Entry(search_frame, textvariable=search_var)
    search_entry.pack(side='right')

    # Set up a trace on the search_var after it's defined
    search_var.trace_add('write', lambda *args: on_search_change(search_var))

    # Bind KeyRelease event to search function
    search_entry.bind('<KeyRelease>', lambda event: on_search_change(search_var))

    # Power Level Widgets
    pl_label = tk.Label(left_frame, text="Please select Power Level:")
    pl_label.pack(anchor="w")

    pl_entry = tk.Entry(left_frame)
    pl_entry.pack(fill="x")

    # Load archetypes from the JSON file
    archetypes = load_archetypes()
    archetype_names = list(archetypes.keys())

    # Set 'Powerhouse' as the default archetype if it exists in the list
    default_archetype = "Powerhouse" if "Powerhouse" in archetype_names else archetype_names[0]
    selected_archetype = tk.StringVar(value=default_archetype)
    selected_archetype = tk.StringVar()
    selected_archetype.set(archetype_names[0])

    # Archetype Dropdown
    archetype_label = tk.Label(left_frame, text="Select Archetype:")
    archetype_label.pack(anchor="w")

    archetype_menu = tk.OptionMenu(left_frame, selected_archetype, *archetype_names)
    archetype_menu.pack(anchor="w")

    generate_button = tk.Button(left_frame, text="Generate Character", command=on_generate_button_click)
    generate_button.pack(fill="x", pady=5)

    powers_checkbox = tk.Checkbutton(left_frame, text="Include Powers", variable=include_powers)
    powers_checkbox.pack(anchor="w")

    # Equipment Widgets
    equipment_points_label = tk.Label(left_frame, text="Equipment Points:")
    equipment_points_label.pack(anchor="w")

    equipment_points_entry = tk.Entry(left_frame)
    equipment_points_entry.pack(fill="x")

    generate_equipment_button = tk.Button(left_frame, text="Generate Equipment", command=on_generate_equipment_click)
    generate_equipment_button.pack(fill="x", pady=5)

    save_equipment_button = tk.Button(left_frame, text="Save Equipment", command=on_save_equipment_click)
    save_equipment_button.pack(fill="x", pady=5)

    close_tab_button = tk.Button(left_frame, text="Close Tab", command=close_current_tab)
    close_tab_button.pack(fill="x", pady=5)

    export_character_sheet_button = tk.Button(left_frame, text="Export to Character Sheet", command=lambda: on_export_character_sheet_click(character))
    export_character_sheet_button.pack(fill="x", pady=5)

    # Mode Toggle
    dark_mode_button = tk.Button(left_frame, text="Toggle Dark Mode", command=toggle_dark_mode)
    dark_mode_button.pack(fill="x", pady=5)

    # Configure the main window to resize properly
    root.grid_rowconfigure(0, weight=1)
    root.grid_columnconfigure(1, weight=1)

    update_color_scheme(dark_mode, root)

    root.protocol("WM_DELETE_WINDOW", lambda: [save_tabs(), root.destroy()])  # Save tabs and close the program
    root.mainloop()

if __name__ == "__main__":
    main()