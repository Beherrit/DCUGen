import random
import pandas as pd
import tkinter as tk
from tkinter import messagebox, ttk
import json
from gmcheatsheet import *
from initiative_tracker import *
from calculate_powers import *
from reference import *
from notes import *
from utils import *
from hideout import *
from equipment import *
from database import *
from export import *
import settings
from vehicles import *
import logging
import os

# Set up logging
log_file_path = os.path.join(os.path.dirname(__file__), 'character_generation.log')
logging.basicConfig(filename=log_file_path, level=logging.DEBUG, format='%(asctime)s %(message)s')

# Add a logger instance
logger = logging.getLogger(__name__)

POWER_POINTS_PER_LEVEL = 15
hideout_details = {}
characters = {}
current_theme = None
gm_cheat_sheet_app = None  # Store the GM Cheat Sheet app instance

def load_json(file_path):
    try:
        with open(file_path, 'r') as file:
            return json.load(file)
    except Exception as e:
        logger.exception(f"Error loading JSON file {file_path}: {e}")
        raise

# Load JSON files
stats_data = load_json('json/stats.json')
skills_data = load_json('json/skills.json')
defenses_data = load_json('json/defenses.json')
advantages_data = load_json('json/advantages.json')
powers_data = load_json('json/powers.json')
extras_data = load_json('json/extras.json')
flaws_data = load_json('json/flaws.json')

def enforce_rules(character, power_level):
    max_defense_toughness = power_level * 2

    # Ensure defenses are initialized
    character['defenses'] = character.get('defenses', {
        'Dodge': {"stat_bonus": 0, "bought_rank": 0, "total_rank": 0},
        'Fortitude': {"stat_bonus": 0, "bought_rank": 0, "total_rank": 0},
        'Parry': {"stat_bonus": 0, "bought_rank": 0, "total_rank": 0},
        'Will': {"stat_bonus": 0, "bought_rank": 0, "total_rank": 0},
        'Toughness': {"stat_bonus": 0, "bought_rank": 0, "total_rank": 0}
    })

    # Ensure the combined defenses don't exceed the max allowed
    if (character['defenses']['Parry']['total_rank'] + character['defenses']['Toughness']['total_rank']) > max_defense_toughness:
        raise ValueError("Parry and Toughness exceed the allowed limit")
    if (character['defenses']['Dodge']['total_rank'] + character['defenses']['Toughness']['total_rank']) > max_defense_toughness:
        raise ValueError("Dodge and Toughness exceed the allowed limit")
    if (character['defenses']['Fortitude']['total_rank'] + character['defenses']['Will']['total_rank']) > max_defense_toughness:
        raise ValueError("Fortitude and Will exceed the allowed limit")

    return character

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

def calculate_totals(character):
    attribute_total_cost = sum(stat['cost'] for stat in character['stats'].values())
    advantage_total_cost = sum(advantage['cost'] for advantage in character['advantages'])
    skill_total_cost = sum(skill['cost'] for skill in character['skills'])
    power_total_cost = sum(power['cost'] for power in character.get('powers', []))
    defense_total_cost = sum(defense['bought_rank'] for defense in character['defenses'].values())
    total_cost = attribute_total_cost + advantage_total_cost + skill_total_cost + power_total_cost + defense_total_cost
    return attribute_total_cost, advantage_total_cost, skill_total_cost, power_total_cost, defense_total_cost, total_cost

def allocate_points(power_level, stat_percent, advantage_percent, skill_percent, defense_percent, power_percent):
    total_points = power_level * POWER_POINTS_PER_LEVEL

    stat_points = int(total_points * (stat_percent / 100))
    advantage_points = int(total_points * (advantage_percent / 100))
    skill_points = int(total_points * (skill_percent / 100))
    defense_points = int(total_points * (defense_percent / 100))
    power_points = int(total_points * (power_percent / 100))

    return stat_points, advantage_points, skill_points, defense_points, power_points

def allocate_stats(stat_points, stats_data):
    logger.debug(f"Allocating {stat_points} points to stats.")
    allocated_stats = {}
    remaining_points = stat_points // 2  # Since cost is value * 2, we divide the available points by 2

    # Define the categories
    high_stats = 3
    moderate_stats = 3
    low_stats = 2

    # Determine point allocations for each category
    high_points = remaining_points * 0.4  # 40% of points to high stats
    moderate_points = remaining_points * 0.3  # 30% of points to moderate stats
    low_points = remaining_points * 0.3  # 30% of points to low stats

    # Shuffle the stats to ensure random distribution
    stat_names = [stat['name'] for stat in stats_data['STATS']]
    random.shuffle(stat_names)

    # Allocate points to high stats
    for _ in range(high_stats):
        if not stat_names:
            break
        stat_name = stat_names.pop()
        max_value = high_points // high_stats
        value = random.randint(int(max_value * 0.7), int(max_value * 1.3))
        value = min(value, remaining_points // high_stats)
        remaining_points -= value
        allocated_stats[stat_name] = {'value': value, 'cost': value * 2}
        logger.debug(f"Allocated {value} points to {stat_name} (High).")

    # Allocate points to moderate stats
    for _ in range(moderate_stats):
        if not stat_names:
            break
        stat_name = stat_names.pop()
        max_value = moderate_points // moderate_stats
        value = random.randint(int(max_value * 0.7), int(max_value * 1.3))
        value = min(value, remaining_points // moderate_stats)
        remaining_points -= value
        allocated_stats[stat_name] = {'value': value, 'cost': value * 2}
        logger.debug(f"Allocated {value} points to {stat_name} (Moderate).")

    # Allocate points to low stats
    for _ in range(low_stats):
        if not stat_names:
            break
        stat_name = stat_names.pop()
        max_value = low_points // low_stats
        value = random.randint(int(max_value * 0.7), int(max_value * 1.3))
        value = min(value, remaining_points // low_stats)
        remaining_points -= value
        allocated_stats[stat_name] = {'value': value, 'cost': value * 2}
        logger.debug(f"Allocated {value} points to {stat_name} (Low).")

    # Distribute any remaining points
    for stat_name in allocated_stats.keys():
        if remaining_points <= 0:
            break
        additional_value = min(remaining_points, 1)
        allocated_stats[stat_name]['value'] += additional_value
        allocated_stats[stat_name]['cost'] += additional_value * 2
        remaining_points -= additional_value
        logger.debug(f"Distributed remaining points to {stat_name}, adding {additional_value} points.")

    return allocated_stats

def allocate_defenses(defense_points, character, power_level):
    logger.debug(f"Allocating {defense_points} points to defenses.")
    max_defense_toughness = power_level * 2
    defense_allocation = {
        "Dodge": 0,
        "Fortitude": 0,
        "Parry": 0,
        "Will": 0,
        "Toughness": 0
    }

    # Distribute defense points equally among defenses
    while defense_points > 0:
        for defense in defense_allocation.keys():
            if defense_points <= 0:
                break
            stat_bonus = character['defenses'][defense]['stat_bonus']
            bought_rank = character['defenses'][defense]['bought_rank']
            total_rank = stat_bonus + bought_rank
            if total_rank < max_defense_toughness / 2:
                defense_allocation[defense] += 1
                character['defenses'][defense]['bought_rank'] += 1
                character['defenses'][defense]['total_rank'] += 1
                defense_points -= 1
                logger.debug(f"Allocated 1 point to {defense}, total rank is now {total_rank + 1}.")

    return character, defense_points

def allocate_skills(skill_points, character):
    logger.debug(f"Starting skill allocation with {skill_points} points.")

    skill_allocation = {
        "high": 4,
        "moderate": 8,
        "low": 4
    }
    skills = []
    selected_skills = set()

    remaining_points = skill_points
    categories = list(skill_allocation.keys())
    random.shuffle(categories)

    for category in categories:
        for _ in range(skill_allocation[category]):
            if remaining_points <= 0:
                break
            skill = random.choice(skills_data)
            skill_name = skill['name']

            while skill_name in selected_skills:
                skill = random.choice(skills_data)
                skill_name = skill['name']

            selected_skills.add(skill_name)

            rank = 0
            if category == "high":
                rank = random.randint(6, 10)
            elif category == "moderate":
                rank = random.randint(3, 5)
            elif category == "low":
                rank = random.randint(0, 2)

            cost = (rank + 1) // 2  # Ensuring costs are always whole numbers
            if remaining_points < cost:
                rank = remaining_points * 2 - 1  # Adjust rank to fit remaining points
                cost = remaining_points

            associated_attribute = skill['tags'][0]
            if associated_attribute not in character['stats']:
                character['stats'][associated_attribute] = {'value': 0, 'cost': 0}

            total = rank + character['stats'][associated_attribute]['value']

            skills.append({
                "name": skill_name,
                "rank": rank,
                "cost": cost,
                "total": total,
                "sub_skill": random.choice(skill.get('sub_skills', [None]))
            })

            remaining_points -= cost

            logger.debug(f"Allocated {skill_name}: rank {rank}, cost {cost}, remaining points {remaining_points}")

        if remaining_points <= 0:
            break

    # Ensure all skills from skills_data are present and sorted
    all_skills = {skill['name']: {"name": skill['name'], "rank": 0, "cost": 0, "total": 0, "sub_skill": None} for skill in skills_data}
    for skill in skills:
        all_skills[skill['name']] = skill

    logger.debug("Skill allocation complete.")
    return sorted(list(all_skills.values()), key=lambda x: x["name"])

def allocate_advantages(max_advantages, total_points):
    logger.debug(f"Allocating {total_points} points to advantages with a max of {max_advantages} advantages.")
    selected_advantages = []
    total_cost = 0
    available_advantages = advantages_data.copy()
    
    for _ in range(max_advantages):
        if not available_advantages:
            break
        
        advantage = random.choice(available_advantages)
        available_advantages.remove(advantage)

        rank = random.randint(1, advantage.get('max_rank', 1))
        cost = rank * advantage['cost']
        
        if total_cost + cost > total_points:
            continue

        total_cost += cost
        selected_advantages.append({
            "name": advantage["name"],
            "rank": rank,
            "cost": cost
        })
        logger.debug(f"Allocated advantage {advantage['name']} with rank {rank} and cost {cost}.")

    # Allocate remaining points to Equipment if any points are left
    remaining_points = total_points - total_cost
    if remaining_points > 0:
        equipment_rank = remaining_points
        selected_advantages.append({
            "name": "Equipment",
            "rank": equipment_rank,
            "cost": equipment_rank * 1  # Each rank of Equipment costs 1 point
        })
        total_cost += equipment_rank
        logger.debug(f"Allocated remaining points to Equipment, rank {equipment_rank}.")

    return selected_advantages, total_cost

def allocate_powers(character, power_points, power_level, max_powers, selected_power_types):
    logger.debug(f"Allocating {power_points} points to powers with a max of {max_powers} powers.")
    if power_points == 0:
        return character, power_points

    random.shuffle(powers_data)
    selected_power_names = []
    
    for power_type, range_type, num_powers in selected_power_types:
        for _ in range(num_powers):
            if power_points <= 0:
                break
            available_powers = [power for power in powers_data if power['type'] == power_type]
            if range_type:
                available_powers = [power for power in available_powers if power.get('range') == range_type]
            if not available_powers:
                continue
            power = random.choice(available_powers)

            if power["name"] in selected_power_names:
                continue

            base_cost = power["cost"]
            max_rank = power.get("max_rank", power_level)
            if max_rank > 0 and base_cost <= power_points:
                rank = random.randint(1, min(max_rank, power_points))

                available_extras = [extra for extra in extras_data if extra["name"] not in power.get("excluded_extras", [])]
                available_flaws = [flaw for flaw in flaws_data if flaw["name"] not in power.get("excluded_flaws", [])]

                num_extras = random.randint(0, min(3, len(available_extras)))
                num_flaws = random.randint(0, min(3, len(available_flaws)))

                selected_extras = random.sample(available_extras, num_extras)
                selected_flaws = random.sample(available_flaws, num_flaws)

                selected_extras_with_ranks = [(extra["name"], random.randint(1, min(extra["max_rank"], rank))) for extra in selected_extras]
                selected_flaws_with_ranks = [(flaw["name"], random.randint(1, min(flaw["max_rank"], rank))) for flaw in selected_flaws]

                if power_level <= 3:
                    accurate_rank_range = (0, 0)
                elif power_level <= 7:
                    accurate_rank_range = (1, 2)
                elif power_level <= 12:
                    accurate_rank_range = (2, 4)
                else:
                    accurate_rank_range = (3, 5)

                if power["type"] == "Combat":
                    accurate_rank = random.randint(*accurate_rank_range)
                    if accurate_rank > 0:
                        selected_extras_with_ranks.append(("Accurate", accurate_rank))

                total_cost, adjusted_cost_per_rank, adjusted_flats = calculate_modified_cost(
                    base_cost, rank, selected_extras_with_ranks, selected_flaws_with_ranks, extras_data, flaws_data
                )

                max_total = power_level * 2
                for i, (extra_name, extra_rank) in enumerate(selected_extras_with_ranks):
                    if extra_name == "Accurate" and extra_rank + rank > max_total:
                        adjusted_accurate_rank = max_total - rank
                        selected_extras_with_ranks[i] = (extra_name, adjusted_accurate_rank)
                        total_cost += adjusted_accurate_rank - extra_rank

                total_cost = max(total_cost, 1)
                if total_cost <= power_points:
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
                            character['defenses'][defense_name]['total_rank'] += power_entry['rank']

                    character["powers"].append(power_entry)
                    selected_power_names.append(power["name"])
                    power_points -= total_cost
                    logger.debug(f"Allocated power {power['name']} with rank {rank} and total cost {total_cost}.")

    return character, power_points

def generate_character(power_level, include_powers, stat_percent, advantage_percent, skill_percent, defense_percent, power_percent, max_advantages, max_powers, selected_power_types, random_physical_features=True, random_costume_style=True, random_distinctive_feature=True):
    try:
        logger.debug(f"Starting character generation with Power Level: {power_level}")
        stat_points, advantage_points, skill_points, defense_points, power_points = allocate_points(power_level, stat_percent, advantage_percent, skill_percent, defense_percent, power_percent)

        random.seed()
        random_theme = generate_random_theme() if include_powers else "Mundane"

        # Initialize character basics
        gender, name = generate_random_gender()
        origin = generate_random_origin()
        personality_traits = generate_random_traits()
        motivations_and_complications = generate_motivations_and_complications()
        languages = assign_languages({'advantages': []})  # Pass an empty list for advantages to get base language
        initiative = calculate_initiative({'advantages': [], 'stats': {}})  # Initialize with default values for stats and advantages

        # Generate physical traits early for description
        physical_traits = {
            "height": generate_random_physical_trait("HEIGHT") if random_physical_features else "Not Specified",
            "weight": generate_weight(),
            "eye_color": generate_random_physical_trait("EYE_COLOR") if random_physical_features else "Not Specified",
            "hair_color": generate_random_physical_trait("HAIR_COLOR") if random_physical_features else "Not Specified",
            "skin_tone": generate_random_physical_trait("SKIN_TONE") if random_physical_features else "Not Specified"
        }

        character = {
            "defenses": {
                "Dodge": {"stat_bonus": 0, "bought_rank": 0, "total_rank": 0},
                "Fortitude": {"stat_bonus": 0, "bought_rank": 0, "total_rank": 0},
                "Parry": {"stat_bonus": 0, "bought_rank": 0, "total_rank": 0},
                "Will": {"stat_bonus": 0, "bought_rank": 0, "total_rank": 0},
                "Toughness": {"stat_bonus": 0, "bought_rank": 0, "total_rank": 0}
            },
            "name": name,
            "gender": gender,
            "theme": random_theme,
            "origin": origin,
            "stats": {},
            "advantages": [],
            "skills": [],
            "powers": [],
            "total_cost": 0,
            "power_level": power_level,
            'age': generate_random_age(),
            "physical_traits": physical_traits,
            "costume_style": generate_random_costume_style() if random_costume_style else "Not Specified",
            "distinctive_feature": generate_random_distinctive_feature() if random_distinctive_feature else "Not Specified",
            "personality_traits": personality_traits,
            "languages": languages,
            "initiative": initiative,
            "Motivation": motivations_and_complications["Motivation"],
            "Complications": motivations_and_complications["Complications"]
        }

        # Generate the character description for the AI image prompt
        character["description"] = generate_character_description({
            'gender': gender,
            'age': character['age'],
            'origin': origin,
            'physical_traits': physical_traits,
            'theme': random_theme,
            'costume_style': character['costume_style'],
            'distinctive_feature': character['distinctive_feature']
        })

        logger.debug("Allocated Points - Stats: %d, Advantages: %d, Skills: %d, Defenses: %d, Powers: %d",
                     stat_points, advantage_points, skill_points, defense_points, power_points)

        # Allocate stats
        allocated_stats = allocate_stats(stat_points, stats_data)
        character['stats'] = allocated_stats
        logger.debug("Allocated Stats.")

        # Update defenses based on stats
        character = update_defenses(character, allocated_stats)
        logger.debug("Updated Defenses.")

        # Allocate skills
        character['skills'] = allocate_skills(skill_points, character)
        logger.debug("Allocated Skills.")

        # Allocate advantages
        advantages, advantage_total_cost = allocate_advantages(max_advantages, advantage_points)
        character['advantages'] = advantages
        logger.debug("Allocated Advantages.")

        # Allocate defenses
        character, remaining_defense_points = allocate_defenses(defense_points, character, power_level)
        logger.debug("Allocated Defenses.")

        # Allocate powers
        character, remaining_power_points = allocate_powers(character, power_points, power_level, max_powers, selected_power_types)
        logger.debug("Allocated Powers.")

        # Allocate equipment if Equipment advantage is present
        equipment_points = calculate_equipment_points(character)
        if equipment_points > 0:
            gadgets = load_gadgets()
            items, total_cost = random_gadget_generator(equipment_points, gadgets)
            character['equipment'] = items

        # Update initiative with actual values after advantages are assigned
        character['languages'] = assign_languages(character)
        character['initiative'] = calculate_initiative(character)

        # Enforce rules
        character = enforce_rules(character, power_level)

        # Calculate total cost
        attribute_total_cost, advantage_total_cost, skill_total_cost, power_total_cost, defense_total_cost, total_cost = calculate_totals(character)
        character['total_cost'] = total_cost

        # Set maximum points allowed
        character['max_points'] = power_level * POWER_POINTS_PER_LEVEL

        logger.debug("Character generation completed.")
        return character

    except Exception as e:
        logger.exception("An error occurred during character generation.")
        raise

def update_defenses(character, stats):
    for stat_name, stat_value in stats.items():
        for stat_data in stats_data["STATS"]:
            if stat_data["name"] == stat_name:
                if 'tags' in stat_data:
                    for tag in stat_data['tags']:
                        if tag in character['defenses']:
                            character['defenses'][tag]['stat_bonus'] += stat_value['value']
                            character['defenses'][tag]['total_rank'] = character['defenses'][tag]['stat_bonus'] + character['defenses'][tag]['bought_rank']
    return character

def open_character_filters_window():
    def on_generate_character_filters():
        try:
            power_level = int(pl_entry.get())
            if power_level < 1 or power_level > 20:
                raise ValueError

            include_powers_value = include_powers.get()
            stat_percent = float(stat_percent_entry.get())
            advantage_percent = float(advantage_percent_entry.get())
            skill_percent = float(skill_percent_entry.get())
            defense_percent = float(defense_percent_entry.get())
            power_percent = float(power_percent_entry.get())
            max_advantages = int(max_advantages_entry.get())
            max_powers = int(max_powers_entry.get())

            selected_power_types = []
            if include_powers_value:
                for power_type, power_range, entry in power_type_entries:
                    selected_power_types.append((power_type, power_range, int(entry.get())))

            logger.debug(f"Selected Power Types: {selected_power_types}")

            # Generate character
            character = generate_character(power_level, include_powers_value, stat_percent, advantage_percent, skill_percent, defense_percent, power_percent, max_advantages, max_powers, selected_power_types)

            # Create a new tab with the character's name
            character_name = character.get('name', 'Unnamed Character')
            new_tab = ttk.Frame(notebook)
            notebook.add(new_tab, text=character_name)
            
            # Create a new text widget in the new tab
            new_character_summary_text = tk.Text(new_tab, height=15, width=50)
            new_character_summary_text.pack(expand=True, fill='both')
            new_character_summary_text.tag_configure("bold", font=("Helvetica", 12, "bold", "underline"))
            new_character_summary_text.tag_configure("bold_no_underline", font=("Helvetica", 10, "bold"))
            new_character_summary_text.tag_configure("normal_format", font=("Helvetica", 10))
            
            # Display the character information in the new text widget
            pretty_print_character(character, new_character_summary_text)
            text_widgets[new_tab] = new_character_summary_text
            characters[character_name] = character  # Store the character in the dictionary
            # Switch to the new tab
            notebook.select(new_tab)
            colors = dark_mode_colors if dark_mode else light_mode_colors
            apply_color_scheme_to_tab(new_tab, colors)

        except ValueError:
            messagebox.showerror("Invalid Input", "Please ensure all inputs are valid.")
            return

    def generate_random_percentages():
        stat_percent_entry.delete(0, 'end')
        advantage_percent_entry.delete(0, 'end')
        skill_percent_entry.delete(0, 'end')
        defense_percent_entry.delete(0, 'end')
        power_percent_entry.delete(0, 'end')

        percentages = [random.uniform(0, 100) for _ in range(5)]
        total = sum(percentages)
        normalized_percentages = [round(p / total * 100, 2) for p in percentages]

        stat_percent_entry.insert(0, normalized_percentages[0])
        advantage_percent_entry.insert(0, normalized_percentages[1])
        skill_percent_entry.insert(0, normalized_percentages[2])
        defense_percent_entry.insert(0, normalized_percentages[3])
        power_percent_entry.insert(0, normalized_percentages[4])

        max_advantages_entry.delete(0, 'end')
        max_powers_entry.delete(0, 'end')

        max_advantages_entry.insert(0, random.randint(0, 15))
        max_powers_entry.insert(0, random.randint(0, 8))

    filters_window = tk.Toplevel(root)
    filters_window.title("Generate Character Filters")

    pl_label = ttk.Label(filters_window, text="Power Level:")
    pl_label.grid(row=0, column=0, padx=5, pady=5)
    pl_entry = ttk.Entry(filters_window)
    pl_entry.grid(row=0, column=1, padx=5, pady=5)

    include_powers = tk.BooleanVar(value=False)
    include_powers_button = ttk.Checkbutton(filters_window, text="Include Powers", variable=include_powers)
    include_powers_button.grid(row=1, column=0, padx=5, pady=5, columnspan=2)

    stat_percent_label = ttk.Label(filters_window, text="Stats Percent:")
    stat_percent_label.grid(row=2, column=0, padx=5, pady=5)
    stat_percent_entry = ttk.Entry(filters_window)
    stat_percent_entry.grid(row=2, column=1, padx=5, pady=5)

    advantage_percent_label = ttk.Label(filters_window, text="Advantages Percent:")
    advantage_percent_label.grid(row=3, column=0, padx=5, pady=5)
    advantage_percent_entry = ttk.Entry(filters_window)
    advantage_percent_entry.grid(row=3, column=1, padx=5, pady=5)

    skill_percent_label = ttk.Label(filters_window, text="Skills Percent:")
    skill_percent_label.grid(row=4, column=0, padx=5, pady=5)
    skill_percent_entry = ttk.Entry(filters_window)
    skill_percent_entry.grid(row=4, column=1, padx=5, pady=5)

    defense_percent_label = ttk.Label(filters_window, text="Defenses Percent:")
    defense_percent_label.grid(row=5, column=0, padx=5, pady=5)
    defense_percent_entry = ttk.Entry(filters_window)
    defense_percent_entry.grid(row=5, column=1, padx=5, pady=5)

    power_percent_label = ttk.Label(filters_window, text="Powers Percent:")
    power_percent_label.grid(row=6, column=0, padx=5, pady=5)
    power_percent_entry = ttk.Entry(filters_window)
    power_percent_entry.grid(row=6, column=1, padx=5, pady=5)

    max_advantages_label = ttk.Label(filters_window, text="Max Advantages:")
    max_advantages_label.grid(row=7, column=0, padx=5, pady=5)
    max_advantages_entry = ttk.Entry(filters_window)
    max_advantages_entry.grid(row=7, column=1, padx=5, pady=5)

    max_powers_label = ttk.Label(filters_window, text="Max Powers:")
    max_powers_label.grid(row=8, column=0, padx=5, pady=5)
    max_powers_entry = ttk.Entry(filters_window)
    max_powers_entry.grid(row=8, column=1, padx=5, pady=5)

    # Add power type options
    power_type_frame = ttk.LabelFrame(filters_window, text="Power Types")
    power_type_frame.grid(row=9, column=0, columnspan=2, padx=5, pady=5)

    power_type_entries = []
    power_types = [
        ("Combat", "Melee"),
        ("Combat", "Ranged"),
        ("Utility", None),
        ("Support", None),
        ("Movement", None),
        ("Defensive", None)
    ]

    for power_type, power_range in power_types:
        frame = ttk.Frame(power_type_frame)
        frame.pack(fill="x", padx=5, pady=2)

        label = ttk.Label(frame, text=f"{power_type} ({power_range if power_range else 'Any'})")
        label.pack(side="left")

        entry = ttk.Entry(frame)
        entry.pack(side="right")
        power_type_entries.append((power_type, power_range, entry))

    generate_character_button = ttk.Button(filters_window, text="Generate Character Now", command=on_generate_character_filters)
    generate_character_button.grid(row=10, column=0, columnspan=2, padx=5, pady=5)

    random_percent_button = ttk.Button(filters_window, text="Random Percentages", command=generate_random_percentages)
    random_percent_button.grid(row=11, column=0, columnspan=2, padx=5, pady=5)

def pretty_print_character(character, text_widget):
    description = character.get("description", "No description available")
    text_widget.insert("end", "Character Creation Summary\n", "bold")
    text_widget.insert("end", "-" * 40 + "\n\n")

    total_cost = character.get("total_cost", 0)
    power_level = character.get("power_level", "N/A")
    max_points = character.get("max_points", "N/A")

    attribute_total_cost, advantage_total_cost, skill_total_cost, power_total_cost, defense_total_cost, _ = calculate_totals(character)

    text_widget.insert("end", f"Power Level: {power_level}\n", "bold")
    text_widget.insert("end", f"TOTAL COST: {int(total_cost)}\n", "bold")
    text_widget.insert("end", f"Maximum Points Allowed: {max_points}\n", "bold")
    text_widget.insert("end", f"Attribute Total Cost: {attribute_total_cost}\n", "bold")
    text_widget.insert("end", f"Advantage Total Cost: {advantage_total_cost}\n", "bold")
    text_widget.insert("end", f"Skills Total Cost: {skill_total_cost}\n", "bold")
    text_widget.insert("end", f"Powers Total Cost: {power_total_cost}\n", "bold")
    text_widget.insert("end", f"Defenses Total Cost: {defense_total_cost}\n", "bold")

    text_widget.insert("end", "AI Image Generator Prompt:\n", "bold")
    text_widget.insert("end", description + "\n\n", "normal_format")

    text_widget.insert("end", "\nTHEME:\n", "bold")
    text_widget.insert("end", f"- {character.get('theme', 'N/A')}\n")

    text_widget.insert("end", "\nATTRIBUTES:\n", "bold")
    for stat in stats_data["STATS"]:
        stat_name = stat["name"]
        stat_details = character.get("stats", {}).get(stat_name, {"value": 0, "cost": 0})
        text_widget.insert("end", f"- {stat_name}: {stat_details['value']} (Cost: {stat_details['cost']})\n")

    text_widget.insert("end", "\nDEFENSES:\n", "bold")
    for defense, details in character.get("defenses", {}).items():
        text_widget.insert("end", f"- {defense}: Stat Bonus: {details['stat_bonus']}, Bought Rank: {details['bought_rank']}, Total Rank: {details['total_rank']}\n")

    text_widget.insert("end", "\nADVANTAGES:\n", "bold")
    sorted_advantages = sorted(character.get("advantages", []), key=lambda x: x["name"])
    for advantage in sorted_advantages:
        text_widget.insert("end", f"- {advantage['name']} (Rank: {advantage['rank']}, Cost: {advantage['cost']})\n")

    text_widget.insert("end", "\nSKILLS:\n", "bold")
    sorted_skills = sorted(character.get("skills", []), key=lambda x: x["name"])
    for skill in sorted_skills:
        skill_name = skill["name"]
        sub_skill_display = f" : {skill['sub_skill']}" if skill.get("sub_skill") else ""
        associated_attribute = next((s['tags'][0] for s in skills_data if s['name'] == skill_name), None)
        attribute_rank = character['stats'][associated_attribute]['value'] if associated_attribute else 0
        total = skill['rank'] + attribute_rank
        text_widget.insert("end", f"- {skill_name}{sub_skill_display} (Rank: {skill['rank']}, Attribute Rank: {attribute_rank}, Total: {total}, Cost: {skill['cost']})\n")

    text_widget.insert("end", "\nPOWERS:\n", "bold")
    for power in character.get("powers", []):
        text_widget.insert("end", f"- {power['name']} (Rank: {power['rank']}, Cost: {power['cost']})\n")
        if power['extras']:
            text_widget.insert("end", f"  Extras: {', '.join([f'{extra} (Rank: {rank})' for extra, rank in zip(power['extras'], power['extras_ranks'])])}\n")
        if power['flaws']:
            text_widget.insert("end", f"  Flaws: {', '.join([f'{flaw} (Rank: {rank})' for flaw, rank in zip(power['flaws'], power['flaws_ranks'])])}\n")
        if 'resisted' in power:
            text_widget.insert("end", f"  Resisted by: {power['resisted']}\n")
        if 'range' in power and power['range'] == "Ranged":
            text_widget.insert("end", f"  Accuracy: {power['extras_ranks'][power['extras'].index('Accurate')]} if 'Accurate' in power['extras'] else 'N/A'\n")

    text_widget.insert("end", "\nEQUIPMENT:\n", "bold")
    for item in character.get('equipment', []):
        text_widget.insert("end", f"- {item['name']}\n")
        if 'description' in item:
            text_widget.insert("end", f"  Description: {item['description']}\n")
        if 'effects' in item:
            text_widget.insert("end", f"  Effects: {', '.join(item['effects'])}\n")
        if 'rank' in item:
            text_widget.insert("end", f"  Rank: {item['rank']}\n")
        if 'cost' in item:
            text_widget.insert("end", f"  Cost: {item['cost']}\n")
        if 'total_cost' in item:
            text_widget.insert("end", f"  Total Cost: {item['total_cost']}\n")

    text_widget.insert("end", f"\nNAME: {character.get('name', 'Unnamed Character')}\n", "bold")
    text_widget.insert("end", f"GENDER: {character.get('gender', 'N/A')}\n", "bold")
    text_widget.insert("end", f"AGE: {character.get('age', 'N/A')}\n", "bold")
    text_widget.insert("end", "\nORIGIN:\n", "bold")
    origin = character.get('origin', {})
    text_widget.insert("end", f"Region: {origin.get('region', 'N/A')}\n")
    text_widget.insert("end", f"Country: {origin.get('country', 'N/A')}\n")
    text_widget.insert("end", f"Language: {origin.get('language', 'N/A')}\n")

    text_widget.insert("end", "\nPHYSICAL TRAITS:\n", "bold")
    for trait, value in character.get("physical_traits", {}).items():
        text_widget.insert("end", f"{trait.capitalize()}: {value}\n")
    text_widget.insert("end", f"Costume Style: {character.get('costume_style', 'N/A')}\n")
    text_widget.insert("end", f"Distinctive Feature: {character.get('distinctive_feature', 'N/A')}\n")

    text_widget.insert("end", "\nPERSONALITY TRAITS:\n", "bold")
    text_widget.insert("end", "Positive Traits:\n", "bold")
    positive_traits = " | ".join(character.get('personality_traits', {}).get('positive_traits', []))
    text_widget.insert("end", f"{positive_traits}\n")

    text_widget.insert("end", "Negative Traits:\n", "bold")
    negative_traits = " | ".join(character.get('personality_traits', {}).get('negative_traits', []))
    text_widget.insert("end", f"{negative_traits}\n")

    text_widget.insert("end", "Quirky Traits:\n", "bold")
    quirky_traits = character.get('personality_traits', {}).get('quirky_traits', [])
    text_widget.insert("end", f"{' | '.join(quirky_traits) if quirky_traits else 'None'}\n")

    text_widget.insert("end", "\nLANGUAGES:\n", "bold")
    for language in character.get('languages', []):
        text_widget.insert("end", f"- {language}\n")

    text_widget.insert("end", "\nINITIATIVE:\n", "bold")
    text_widget.insert("end", f"{character.get('initiative', 'N/A')}\n")

    text_widget.insert("end", "\nMOTIVATION:\n", "bold")
    motivation = character.get("Motivation", {})
    text_widget.insert("end", f"- {motivation.get('name', 'N/A')}: {motivation.get('description', 'N/A')}\n")

    text_widget.insert("end", "\nCOMPLICATIONS:\n", "bold")
    for complication in character.get("Complications", []):
        text_widget.insert("end", f"- {complication['name']}: {complication['description']}\n")

def export_to_gm_screen():
    global gm_cheat_sheet_app
    
    if not gm_cheat_sheet_app or not gm_cheat_sheet_app.master.winfo_exists():
        gm_cheat_sheet_app = open_gm_cheat_sheet()

    # Clear existing data in the GM Cheat Sheet
    for item in gm_cheat_sheet_app.tree.get_children():
        gm_cheat_sheet_app.tree.delete(item)

    for item in gm_cheat_sheet_app.tree_secondary.get_children():
        gm_cheat_sheet_app.tree_secondary.delete(item)

    # Transfer characters from the tabs
    for tab in notebook.tabs():
        tab_name = notebook.tab(tab, "text")
        character = characters.get(tab_name)

        if character:
            # Insert primary character details into the GM Cheat Sheet
            row_data = [
                character.get('name', ''),
                character['stats'].get('Strength', {}).get('value', ''),
                character['stats'].get('Stamina', {}).get('value', ''),
                character['stats'].get('Agility', {}).get('value', ''),
                character['stats'].get('Dexterity', {}).get('value', ''),
                character['stats'].get('Fighting', {}).get('value', ''),
                character['stats'].get('Intellect', {}).get('value', ''),
                character['stats'].get('Awareness', {}).get('value', ''),
                character['stats'].get('Presence', {}).get('value', ''),
                character['defenses'].get('Dodge', ''),
                character['defenses'].get('Fortitude', ''),
                character['defenses'].get('Parry', ''),
                character['defenses'].get('Will', ''),
                character['defenses'].get('Toughness', ''),
                character.get('initiative', ''),
                character['Motivation'].get('name', ''),
                character['Complications'][0].get('description', '') if character['Complications'] else '',
                character['Complications'][1].get('description', '') if len(character['Complications']) > 1 else '',
                ""  # Summary field
            ]
            gm_cheat_sheet_app.tree.insert("", "end", values=row_data)
            gm_cheat_sheet_app.import_character_secondary(character)

    gm_cheat_sheet_app.master.lift()  # Bring the GM Cheat Sheet window to the front

class CollapsibleSection:
    def __init__(self, master, title, start_collapsed=True):
        self.frame = ttk.Frame(master)
        self.title = title
        self.is_collapsed = start_collapsed

        self.header = ttk.Label(self.frame, text=title, anchor="w", cursor="hand2")
        self.header.pack(fill="x")
        self.header.bind("<Button-1>", self.toggle)

        self.body_frame = ttk.Frame(self.frame)
        if not self.is_collapsed:
            self.body_frame.pack(fill="x", expand=True)

    def toggle(self, event=None):
        if self.is_collapsed:
            self.body_frame.pack(fill="x", expand=True)
        else:
            self.body_frame.forget()
        self.is_collapsed = not self.is_collapsed

    def add_widget(self, widget):
        widget.pack(fill="x", padx=5, pady=2)

    def pack(self, **kwargs):
        self.frame.pack(**kwargs)

def main():
    global root, notebook, dark_mode, include_powers, pl_entry, text_widgets, equipment_points_entry, search_var, hideout_details
    root = tk.Tk()
    root.title("Character Creation Version 3.4 Prod")
    dark_mode = True
    include_powers = tk.BooleanVar(value=False)  # Set include_powers to False by default (unchecked)

    text_widgets = {}
    hideout_details = {}  # Initialize hideout details dictionary
    create_table_if_not_exists()

    # Define colors for different button groups
    equipment_button_color = "#a2d9ce"  # Soft teal
    hideout_button_color = "#f9e79f"  # Light yellow
    character_button_color = "#aed6f1"  # Light blue
    encounter_button_color = "#f5b7b1"  # Light red
    initiative_button_color = "#d7bde2"  # Light purple
    vehicle_button_color = "#a3e4d7"  # Light green
    reference_button_color = "#d3d3d3"  # Light grey

    # Style Configuration
    style = ttk.Style()
    style.theme_use('clam')
    
    # Configure styles for frames and buttons
    style.configure("Character.TFrame", background=character_button_color)
    style.configure("Character.TButton", background=character_button_color, foreground="black")
    style.map("Character.TButton", background=[("active", character_button_color)])

    style.configure("Equipment.TFrame", background=equipment_button_color)
    style.configure("Equipment.TButton", background=equipment_button_color, foreground="black")
    style.map("Equipment.TButton", background=[("active", equipment_button_color)])

    style.configure("Hideout.TFrame", background=hideout_button_color)
    style.configure("Hideout.TButton", background=hideout_button_color, foreground="black")
    style.map("Hideout.TButton", background=[("active", hideout_button_color)])

    style.configure("Encounter.TFrame", background=encounter_button_color)
    style.configure("Encounter.TButton", background=encounter_button_color, foreground="black")
    style.map("Encounter.TButton", background=[("active", encounter_button_color)])

    style.configure("Initiative.TFrame", background=initiative_button_color)
    style.configure("Initiative.TButton", background=initiative_button_color, foreground="black")
    style.map("Initiative.TButton", background=[("active", initiative_button_color)])

    style.configure("Vehicle.TFrame", background=vehicle_button_color)
    style.configure("Vehicle.TButton", background=vehicle_button_color, foreground="black")
    style.map("Vehicle.TButton", background=[("active", vehicle_button_color)])

    style.configure("Reference.TFrame", background=reference_button_color)
    style.configure("Reference.TButton", background=reference_button_color, foreground="black")
    style.map("Reference.TButton", background=[("active", reference_button_color)])

    style.configure("TLabel", padding=2, font=("Helvetica", 8))  # Smaller padding and font size
    style.configure("TFrame", background="#f0f0f0")
    style.configure("TCheckbutton", padding=2, font=("Helvetica", 8))  # Smaller padding and font size

    # Main layout frames
    left_frame = ttk.Frame(root)
    left_frame.grid(row=0, column=0, sticky="ns", padx=5, pady=5)

    right_frame = ttk.Frame(root)
    right_frame.grid(row=0, column=1, sticky="nsew", padx=5, pady=5)

    # Notebook for character display
    notebook = ttk.Notebook(right_frame)
    notebook.pack(expand=True, fill='both')

    # Search Box Widgets
    search_frame = ttk.Frame(right_frame)
    search_frame.pack(side='top', anchor='ne', pady=2)

    # Adding the label "SEARCH" next to the search entry
    search_label = ttk.Label(search_frame, text="SEARCH")
    search_label.pack(side='left')

    search_var = tk.StringVar()
    search_entry = ttk.Entry(search_frame, textvariable=search_var)
    search_entry.pack(side='right')

    # Set up a trace on the search_var after it's defined
    search_var.trace_add('write', lambda *args: on_search_change(search_var, text_widgets, notebook, dark_mode))

    # Bind KeyRelease event to search function
    search_entry.bind('<KeyRelease>', lambda event: on_search_change(search_var, text_widgets, notebook, dark_mode))

    # Character Management Frame (start open)
    char_frame = CollapsibleSection(left_frame, "Character Management (Click to open/close)", start_collapsed=False)
    char_frame.pack(fill="x", pady=5)

    generate_character_filters_button = ttk.Button(char_frame.body_frame, text="Generate Character Filters", command=open_character_filters_window, style='Character.TButton')
    char_frame.add_widget(generate_character_filters_button)

    export_character_sheet_button = ttk.Button(char_frame.body_frame, text="Export to Character Sheet", command=lambda: on_export_character_sheet_click(notebook, characters, text_widgets), style='Character.TButton')
    char_frame.add_widget(export_character_sheet_button)

    close_tab_button = ttk.Button(char_frame.body_frame, text="Close Tab", command=lambda: close_current_tab(notebook, text_widgets), style='Character.TButton')
    char_frame.add_widget(close_tab_button)

    close_all_tabs_button = ttk.Button(char_frame.body_frame, text="Close All Tabs", command=lambda: close_all_tabs(notebook, text_widgets, characters), style='Character.TButton')
    char_frame.add_widget(close_all_tabs_button)

    copy_prompt_button = ttk.Button(char_frame.body_frame, text="Select AI Prompt", command=lambda: copy_prompt_to_clipboard(notebook, characters), style='Character.TButton')
    char_frame.add_widget(copy_prompt_button)

    export_to_gm_screen_button = ttk.Button(char_frame.body_frame, text="Export to GM Screen", command=export_to_gm_screen, style='Character.TButton')
    char_frame.add_widget(export_to_gm_screen_button)

    # Equipment Management Frame (start collapsed)
    equip_frame = CollapsibleSection(left_frame, "Equipment Management (Click to open/close)", start_collapsed=True)
    equip_frame.pack(fill="x", pady=5)

    equipment_points_label = ttk.Label(equip_frame.body_frame, text="Equipment Points:")
    equip_frame.add_widget(equipment_points_label)

    equipment_points_entry = ttk.Entry(equip_frame.body_frame)
    equip_frame.add_widget(equipment_points_entry)

    generate_equipment_button = ttk.Button(equip_frame.body_frame, text="Generate Equipment", command=lambda: on_generate_equipment_click(equipment_points_entry, notebook, text_widgets), style='Equipment.TButton')
    equip_frame.add_widget(generate_equipment_button)

    save_equipment_button = ttk.Button(equip_frame.body_frame, text="Save Equipment", command=lambda: on_save_equipment_click(notebook, text_widgets), style='Equipment.TButton')
    equip_frame.add_widget(save_equipment_button)

    # Vehicle Management Frame (start collapsed)
    vehicle_frame = CollapsibleSection(left_frame, "Vehicle Management (Click to open/close)", start_collapsed=True)
    vehicle_frame.pack(fill="x", pady=5)

    vehicle_points_label = ttk.Label(vehicle_frame.body_frame, text="Vehicle Points:")
    vehicle_frame.add_widget(vehicle_points_label)

    vehicle_points_entry = ttk.Entry(vehicle_frame.body_frame)
    vehicle_frame.add_widget(vehicle_points_entry)

    generate_vehicle_button = ttk.Button(vehicle_frame.body_frame, text="Generate Vehicle", command=lambda: on_generate_vehicle_click(vehicle_points_entry, notebook, text_widgets), style='Vehicle.TButton')
    vehicle_frame.add_widget(generate_vehicle_button)

    save_vehicle_button = ttk.Button(vehicle_frame.body_frame, text="Save Vehicle", command=lambda: on_save_vehicle_click(notebook, text_widgets), style='Vehicle.TButton')
    vehicle_frame.add_widget(save_vehicle_button)

    # Hideout Management Frame (start collapsed)
    hideout_frame = CollapsibleSection(left_frame, "Hideout Management (Click to open/close)", start_collapsed=True)
    hideout_frame.pack(fill="x", pady=5)

    generate_hideout_button = ttk.Button(hideout_frame.body_frame, text="Generate Hideout", command=lambda: generate_hideout(notebook, text_widgets), style='Hideout.TButton')
    hideout_frame.add_widget(generate_hideout_button)

    save_hideout_button = ttk.Button(hideout_frame.body_frame, text="Save Hideout", command=lambda: save_hideout(hideout_details), style='Hideout.TButton')
    hideout_frame.add_widget(save_hideout_button)

    # Miscellaneous Frame (start collapsed)
    misc_frame = CollapsibleSection(left_frame, "Miscellaneous", start_collapsed=True)
    misc_frame.pack(fill="x", pady=5)

    generate_encounter_button = ttk.Button(misc_frame.body_frame, text="Generate Encounter", command=generate_encounter, style='Encounter.TButton')
    misc_frame.add_widget(generate_encounter_button)

    init_tracker_button = ttk.Button(misc_frame.body_frame, text="Initiative Tracker", command=open_initiative_tracker, style='Initiative.TButton')
    misc_frame.add_widget(init_tracker_button)

    settings_button = ttk.Button(misc_frame.body_frame, text="Settings", command=lambda: settings.open_settings(root), style='Initiative.TButton')  # Add settings button
    misc_frame.add_widget(settings_button)

    # Reference Management Frame (start collapsed)
    reference_frame = CollapsibleSection(left_frame, "Reference Management (Click to open/close)", start_collapsed=True)
    reference_frame.pack(fill="x", pady=5)

    calculate_powers_button = ttk.Button(reference_frame.body_frame, text="Calculate Powers", command=open_calculate_powers_window, style='Reference.TButton')
    reference_frame.add_widget(calculate_powers_button)

    reference_data_button = ttk.Button(reference_frame.body_frame, text="Reference Data", command=open_reference_data, style='Reference.TButton')
    reference_frame.add_widget(reference_data_button)

    notes_button = ttk.Button(reference_frame.body_frame, text="Notes", command=open_notes_window, style='Reference.TButton')
    reference_frame.add_widget(notes_button)

    gm_cheat_sheet_button = ttk.Button(reference_frame.body_frame, text="GM Cheat Sheet", command=open_gm_cheat_sheet, style='Reference.TButton')
    reference_frame.add_widget(gm_cheat_sheet_button)

    # Configure the main window to resize properly
    root.grid_rowconfigure(0, weight=1)
    root.grid_columnconfigure(1, weight=1)

    update_color_scheme(dark_mode, root)

    root.protocol("WM_DELETE_WINDOW", lambda: [save_tabs(notebook, text_widgets, characters), root.destroy()])  # Save tabs and close the program
    root.mainloop()

if __name__ == "__main__":
    main()
