import random
import pandas as pd
import tkinter as tk
from tkinter import messagebox, ttk
from gmcheatsheet import open_gm_cheat_sheet
from initiative_tracker import open_initiative_tracker
from calculate_powers import open_calculate_powers_window
from reference import open_reference_data
from notes import *
from utils import *
from hideout import *
from equipment import *
from database import *
from export import *
import settings
from vehicles import *

hideout_details = {}
characters = {}
POWER_POINTS_PER_LEVEL = 15
current_theme = None
gm_cheat_sheet_app = None  # Store the GM Cheat Sheet app instance

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
    if "powers" in character:
        for power in character["powers"]:
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
    if "powers" in allocated_points:
        allocated_points["powers"] += refund
    else:
        allocated_points["stats"] += refund  # Allocate refund to stats if no powers key is present
    return refund  # Return the amount refunded

def allocate_and_calculate_defenses(character, power_level, allocated_points, allocations):
    stats = load_data_from_json('./json/stats.json')

    total_range = sum(details["range"][1] - details["range"][0] + 1 for details in stats["STATS"])

    defenses = {
        "Dodge": character["stats"].get("Agility", {}).get("value", 0),
        "Fortitude": character["stats"].get("Stamina", {}).get("value", 0),
        "Parry": character["stats"].get("Fighting", {}).get("value", 0),
        "Toughness": character["stats"].get("Stamina", {}).get("value", 0),
        "Will": character["stats"].get("Awareness", {}).get("value", 0),
    }

    defense_types = ["Dodge", "Fortitude", "Parry", "Will"]
    defense_allocation_ranges = allocations.get("defenses", [0.1, 0.2])

    for defense in defense_types:
        defense_percentage = random.uniform(*defense_allocation_ranges)
        defense_points = int(defense_percentage * power_level * POWER_POINTS_PER_LEVEL)
        defense_value, cost = allocate_stat(defense, defense_points, total_range, stats, power_level)
        defenses[defense] += defense_value
        allocated_points["stats"] -= cost

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
                    refund = reduce_stat(character, defense, excess, allocated_points)
                    defenses[defense] = max(0, defenses[defense])
                    total = sum(defenses[defense] for defense in defense_pair)
                    if total <= cap:
                        break

    # Add enhancements from powers
    for power in character.get("powers", []):
        if power["name"].startswith("Enhanced Trait"):
            defense_name = power["name"].replace("Enhanced Trait ", "")
            if defense_name in defenses:
                defenses[defense_name] += power["rank"]

    # Add Defensive Roll to Toughness
    defensive_roll_bonus = sum(advantage.get("rank", 0) for advantage in character.get("advantages", []) if advantage["name"] == "Defensive Roll")
    defenses["Toughness"] += defensive_roll_bonus

    # Add Protection Power to Toughness
    protection_bonus = sum(power.get("rank", 0) for power in character.get("powers", []) if power["name"] == "Protection")
    defenses["Toughness"] += protection_bonus

    # Enforce power level caps for defense pairs (again after adding power effects)
    for defense_pair, cap in defense_pairs.items():
        total = sum(defenses[defense] for defense in defense_pair)
        if total > cap:
            excess = total - cap
            for defense in defense_pair:
                if defenses[defense] > 0:
                    refund = reduce_stat(character, defense, excess, allocated_points)
                    defenses[defense] = max(0, defenses[defense])
                    total = sum(defenses[defense] for defense in defense_pair)
                    if total <= cap:
                        break

    character["defenses"] = defenses
    return character, allocated_points

def calculate_total_cost(character):
    total_stat_cost = sum(details['cost'] for details in character['stats'].values())
    total_advantage_cost = sum(advantage['cost'] for advantage in character['advantages'])
    total_skill_cost = sum(skill['cost'] for skill in character['skills'])
    total_power_cost = sum(power['cost'] for power in character['powers'])
    
    return total_stat_cost + total_advantage_cost + total_skill_cost + total_power_cost

def allocate_stat(stat_name, allocated_points, total_range, stats, power_level):
    stat_details = next(stat for stat in stats["STATS"] if stat["name"] == stat_name)
    stat_range = stat_details["range"][1] - stat_details["range"][0] + 1
    max_possible_allocation = allocated_points * (stat_range / total_range)
    
    if stat_name in ["Parry", "Dodge", "Fortitude", "Will"]:
        attribute_value = random.randint(stat_details["range"][0], int(stat_details["range"][0] + max_possible_allocation))
        cost = abs(attribute_value - stat_details["range"][0])  # 1 point per rank
    else:
        attribute_value = random.randint(stat_details["range"][0], int(stat_details["range"][0] + max_possible_allocation))
        cost = abs(attribute_value - stat_details["range"][0]) * 2  # 2 points per rank

    if cost <= allocated_points:
        return (attribute_value, cost)
    else:
        max_value = stat_details["range"][0] + allocated_points
        return (max_value, allocated_points)

def allocate_stats(character, power_level, allocated_points, total_range, allocations):
    stats = load_data_from_json('./json/stats.json')

    if not isinstance(allocations["stats"], list):
        raise ValueError(f"Expected allocations['stats'] to be a list or tuple, got {type(allocations['stats'])}")

    for stat in stats["STATS"]:
        stat_name = stat["name"]
        stat_percentage = random.uniform(*allocations["stats"])
        stat_points = int(stat_percentage * power_level * POWER_POINTS_PER_LEVEL)
        attribute_value, cost = allocate_stat(stat_name, stat_points, total_range, stats, power_level)
        character["stats"][stat_name] = {"value": attribute_value, "cost": cost}
        allocated_points["stats"] -= cost

    return character, allocated_points

def allocate_advantages(character, allocated_points, power_level, max_advantages, allocations):
    advantages = load_data_from_json('./json/advantages.json')
    random.shuffle(advantages)
    
    allocated_advantage_points = 0
    
    for advantage in advantages:
        if allocated_points["advantages"] <= 0 or len(character["advantages"]) >= max_advantages:
            break
        
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
            allocated_advantage_points += adjusted_cost
    
    allocated_points["advantages"] += (allocated_advantage_points - sum(advantage['cost'] for advantage in character["advantages"]))  # Adjust remaining points
    
    return character, allocated_points

def allocate_skills(character, allocated_points, power_level, allocations):
    skills = load_data_from_json('./json/skills.json')
    skill_list = list(skills)
    random.shuffle(skill_list)

    # Calculate total skill points to allocate based on the percentage defined in allocations
    min_skill_percentage, max_skill_percentage = allocations["skills"]
    skill_points_percentage = random.uniform(min_skill_percentage, max_skill_percentage)
    total_skill_points = int(skill_points_percentage * power_level * POWER_POINTS_PER_LEVEL)

    # Each skill rank costs 0.5 points, so double the total_skill_points for the actual points to allocate
    skill_points = total_skill_points * 2

    # Divide skills into groups
    high_value_skills = random.sample(skill_list, 4)
    remaining_skills = [skill for skill in skill_list if skill not in high_value_skills]
    moderate_value_skills = random.sample(remaining_skills, 8)
    zero_value_skills = [skill for skill in remaining_skills if skill not in moderate_value_skills]

    def allocate_to_skills(skill_group, min_rank, max_rank):
        nonlocal skill_points
        for skill in skill_group:
            if skill_points <= 0:
                break
            stat_value = sum(character["stats"].get(tag, {}).get("value", 0) for tag in skill.get("tags", []))
            max_skill_rank = min(power_level + 10 - stat_value, max_rank)

            if max_skill_rank <= 0:
                continue

            rank = random.randint(min_rank, max_skill_rank)
            adjusted_cost = rank / 2

            if adjusted_cost > skill_points:
                rank = int(skill_points)
                adjusted_cost = rank / 2

            if skill["name"] == "Expertise" and "sub_skills" in skill:
                sub_skill = random.choice(skill["sub_skills"])
            else:
                sub_skill = None

            character["skills"].append({
                "name": skill["name"],
                "rank": rank,
                "cost": adjusted_cost,
                "tags": skill.get("tags", []),
                "sub_skill": sub_skill
            })

            skill_points -= rank * 2
            allocated_points["skills"] -= adjusted_cost

    # Allocate points to high value skills
    allocate_to_skills(high_value_skills, max(0, power_level - 5), power_level)

    # Allocate points to moderate value skills
    allocate_to_skills(moderate_value_skills, max(0, power_level - 10), max(0, power_level - 5))

    # Allocate rank 0 to remaining skills
    for skill in zero_value_skills:
        if skill["name"] == "Expertise" and "sub_skills" in skill:
            sub_skill = random.choice(skill["sub_skills"])
        else:
            sub_skill = None

        character["skills"].append({
            "name": skill["name"],
            "rank": 0,
            "cost": 0,
            "tags": skill.get("tags", []),
            "sub_skill": sub_skill
        })

    return character, allocated_points

def allocate_powers(character, allocated_points, power_level, allocations):
    max_powers = allocations.get("max_powers", 8)  # Default to 8 if not specified
    if allocations["powers"] == [0, 0]:
        remaining_power_points = allocated_points["powers"]
        allocated_points["stats"] += remaining_power_points * 0.4
        allocated_points["advantages"] += remaining_power_points * 0.3
        allocated_points["skills"] += remaining_power_points * 0.3
        allocated_points["powers"] = 0
        return character, allocated_points

    powers = load_data_from_json('./json/powers.json')
    random.shuffle(powers)
    extras = load_data_from_json('./json/extras.json')
    flaws = load_data_from_json('./json/flaws.json')
    power_range = allocations.get("power_range", [1, 3])
    num_powers = random.randint(*power_range)
    selected_power_names = []

    while len(character["powers"]) < num_powers and len(character["powers"]) < max_powers and allocated_points["powers"] > 0:
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
                    base_cost, rank, selected_extras_with_ranks, selected_flaws_with_ranks, extras, flaws
                )

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

def reroll_stats(character, text_widget):
    total_stats_cost = sum(details['cost'] for details in character['stats'].values())
    power_level = character['power_level']
    stats = load_data_from_json('./json/stats.json')
    total_range = sum(details["range"][1] - details["range"][0] + 1 for details in stats["STATS"])
    allocations = {"stats": [0.1, 0.3]}  # Adjust based on your allocation rules
    allocated_points = {"stats": total_stats_cost, "powers": 0, "advantages": 0, "skills": 0}  # Ensure 'powers' key is present
    character["stats"] = {}
    character, allocated_points = allocate_stats(character, power_level, allocated_points, total_range, allocations)
    character, allocated_points = allocate_and_calculate_defenses(character, power_level, allocated_points, allocations)  # Update defenses after reroll
    text_widget.delete("1.0", "end")
    pretty_print_character(character, text_widget)

def reroll_advantages(character, text_widget):
    total_advantage_cost = sum(advantage['cost'] for advantage in character['advantages'])
    power_level = character['power_level']
    max_advantages = 10  # Adjust based on your allocation rules
    allocations = {"advantages": [0.1, 0.3]}  # Adjust based on your allocation rules
    allocated_points = {"advantages": total_advantage_cost, "stats": 0, "skills": 0, "powers": 0}
    character["advantages"] = []
    character, allocated_points = allocate_advantages(character, allocated_points, power_level, max_advantages, allocations)
    character, allocated_points = allocate_and_calculate_defenses(character, power_level, allocated_points, allocations)  # Update defenses after reroll
    text_widget.delete("1.0", "end")
    pretty_print_character(character, text_widget)

def reroll_skills(character, text_widget):
    total_skill_cost = sum(skill['cost'] for skill in character['skills'])
    power_level = character['power_level']
    allocations = {"skills": [0.1, 0.3]}  # Adjust based on your allocation rules
    allocated_points = {"skills": total_skill_cost, "stats": 0, "advantages": 0, "powers": 0}
    character["skills"] = []
    character, allocated_points = allocate_skills(character, allocated_points, power_level, allocations)
    character, allocated_points = allocate_and_calculate_defenses(character, power_level, allocated_points, allocations)  # Update defenses after reroll
    text_widget.delete("1.0", "end")
    pretty_print_character(character, text_widget)

def reroll_powers(character, text_widget):
    total_power_cost = sum(power['cost'] for power in character['powers'])
    power_level = character['power_level']
    allocations = {"powers": [0.1, 0.3]}  # Adjust based on your allocation rules
    allocated_points = {"powers": total_power_cost, "stats": 0, "advantages": 0, "skills": 0}
    character["powers"] = []
    character, allocated_points = allocate_powers(character, allocated_points, power_level, allocations)
    character, allocated_points = allocate_and_calculate_defenses(character, power_level, allocated_points, allocations)  # Update defenses after reroll
    text_widget.delete("1.0", "end")
    pretty_print_character(character, text_widget)

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
    include_powers_value = not include_powers.get()  # Invert the checkbox value to match the new logic

    # Generate character with the correct include_powers value
    character = generate_character(power_level, archetype, include_powers=include_powers_value, random_physical_features=True, random_costume_style=True, random_distinctive_feature=True)

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

def generate_character(power_level, archetype, include_powers=True, random_physical_features=False, random_costume_style=False, random_distinctive_feature=False):
    random.seed()
    random_theme = generate_random_theme() if include_powers else "Mundane"
    
    # Load stats data from JSON
    stats = load_data_from_json('./json/stats.json')
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
            "weight": generate_weight(),
            "eye_color": generate_random_physical_trait("EYE_COLOR") if random_physical_features else "Not Specified",
            "hair_color": generate_random_physical_trait("HAIR_COLOR") if random_physical_features else "Not Specified",
            "skin_tone": generate_random_physical_trait("SKIN_TONE") if random_physical_features else "Not Specified"
        },
        "costume_style": generate_random_costume_style() if random_costume_style else "Not Specified",
        "distinctive_feature": generate_random_distinctive_feature() if random_distinctive_feature else "Not Specified",
        "personality_traits": generate_random_traits()  # Add the randomly generated traits here
    }

    # Allocate stats, advantages, skills, and powers
    allocation_key = "with_powers" if include_powers else "without_powers"
    archetypes = load_archetypes()
    allocations = archetypes[archetype][allocation_key]
    max_points = power_level * POWER_POINTS_PER_LEVEL
    allocated_points = {category: int(allocations[category][1] * max_points) for category in allocations if category != "max_advantages" and category != "max_powers" and category != "power_range"}
    max_advantages = allocations["max_advantages"]

    total_range = sum(details["range"][1] - details["range"][0] + 1 for details in stats["STATS"])
    character, allocated_points = allocate_stats(character, power_level, allocated_points, total_range, allocations)
    character, allocated_points = allocate_and_calculate_defenses(character, power_level, allocated_points, allocations)  # Allocate defenses
    character, allocated_points = allocate_advantages(character, allocated_points, power_level, max_advantages, allocations)
    character, allocated_points = allocate_skills(character, allocated_points, power_level, allocations)

    # Check if powers are included and allocate accordingly
    if include_powers:
        character, allocated_points = allocate_powers(character, allocated_points, power_level, allocations)
    else:
        remaining_power_points = allocated_points["powers"]
        allocated_points["stats"] += remaining_power_points * 0.4
        allocated_points["advantages"] += remaining_power_points * 0.3
        allocated_points["skills"] += remaining_power_points * 0.3
        allocated_points["powers"] = 0
        character, allocated_points = allocate_stats(character, power_level, allocated_points, total_range, allocations)
        character, allocated_points = allocate_advantages(character, allocated_points, power_level, max_advantages, allocations)
        character, allocated_points = allocate_skills(character, allocated_points, power_level, allocations)

    equipment_advantage = next((adv for adv in character["advantages"] if adv["name"] == "Equipment"), None)
    if equipment_advantage:
        if equipment_advantage['rank'] < power_level:
            equipment_advantage['rank'] = power_level
            allocated_points["advantages"] += equipment_advantage['cost']
            equipment_advantage['cost'] = power_level
            allocated_points["advantages"] -= power_level
    else:
        equipment_advantage = {"name": "Equipment", "rank": power_level, "cost": power_level}
        character["advantages"].append(equipment_advantage)
        allocated_points["advantages"] -= power_level

    equipment_points = equipment_advantage["rank"] * 5
    gadgets = load_gadgets()
    items, total_cost = random_gadget_generator(equipment_points, gadgets)
    character['equipment'] = items

    character["defenses"], allocated_points = allocate_and_calculate_defenses(character, power_level, allocated_points, allocations)  # Update defenses after reroll
    character["initiative"] = calculate_initiative(character)
    character["total_cost"] = calculate_total_cost(character)
    motivations_and_complications = generate_motivations_and_complications()
    character.update(motivations_and_complications)
    character["languages"] = assign_languages(character)
    character['origin'] = generate_random_origin()
    character['generation_log'] = []
    character["description"] = generate_character_description(character)  # Store the generated description

    return character

def pretty_print_character(character, text_widget):
    description = character["description"]  # Use the stored description
    text_widget.insert("end", "Character Creation Summary Version\n", "bold")
    text_widget.insert("end", "-" * 40 + "\n\n")

    total_cost = calculate_total_cost(character)
    text_widget.insert("end", f"Power Level: {character['power_level']}\n", "bold")
    text_widget.insert("end", f"TOTAL COST: {int(total_cost)}\n", "bold")
    max_points = character['power_level'] * POWER_POINTS_PER_LEVEL
    text_widget.insert("end", f"Maximum Points Allowed: {max_points}\n", "bold")
    text_widget.insert("end", f"Attributes Total Cost: {int(sum(details['cost'] for details in character['stats'].values()))}\n", "bold")
    text_widget.insert("end", f"Advantages Total Cost: {int(sum(advantage['cost'] for advantage in character['advantages']))}\n", "bold")
    text_widget.insert("end", f"Skills Total Cost: {int(sum(skill['cost'] for skill in character['skills']))}\n", "bold")
    text_widget.insert("end", f"Powers Total Cost (Adjusted): {int(sum(power['cost'] for power in character['powers']))}\n\n\n", "bold")

    # Insert the generated description into the text widget
    text_widget.insert("end", "AI Image Generator Prompt:\n", "bold")
    text_widget.insert("end", description + "\n\n", "normal_format")

    text_widget.insert("end", "\nTHEME:\n", "bold")
    text_widget.insert("end", f"- {character['theme']}\n")

    # Stats Section with Reroll Button
    text_widget.insert("end", "\nSTATS (Reroll Click Here):\n", "bold")
    reroll_stats_button = tk.Button(text_widget, text="Reroll Stats", command=lambda: reroll_stats(character, text_widget))
    text_widget.window_create("end", window=reroll_stats_button)
    text_widget.insert("end", "\n", "bold")
    for stat, details in character["stats"].items():
        text_widget.insert("end", f"- ", "bold_no_underline")
        text_widget.insert("end", f"{stat}: ", "bold_no_underline")
        text_widget.insert("end", f"{details['value']} (Cost: {details['cost']})\n")

    # Advantages Section with Reroll Button
    text_widget.insert("end", "\nADVANTAGES (Reroll Click Here):\n", "bold")
    reroll_advantages_button = tk.Button(text_widget, text="Reroll Advantages", command=lambda: reroll_advantages(character, text_widget))
    text_widget.window_create("end", window=reroll_advantages_button)
    text_widget.insert("end", "\n", "bold")
    for advantage in character["advantages"]:
        text_widget.insert("end", f"- ", "bold_no_underline")
        text_widget.insert("end", f"{advantage['name']} ", "bold_no_underline")
        text_widget.insert("end", f"(Rank: {advantage['rank']}, Cost: {advantage['cost']})\n")

    # Skills Section with Reroll Button
    text_widget.insert("end", "\nSKILLS (Reroll Click Here):\n", "bold")
    reroll_skills_button = tk.Button(text_widget, text="Reroll Skills", command=lambda: reroll_skills(character, text_widget))
    text_widget.window_create("end", window=reroll_skills_button)
    text_widget.insert("end", "\n", "bold")
    skills = load_data_from_json('./json/skills.json')
    for skill_template in skills:
        skill_name = skill_template["name"]
        skill = next((s for s in character["skills"] if s["name"] == skill_name), None)
        rank = skill["rank"] if skill else 0
        total = rank + sum(character["stats"].get(tag, {}).get("value", 0) for tag in skill_template.get("tags", []))
        cost = rank / 2 if rank > 0 else 0
        sub_skill_display = f" : {skill['sub_skill']}" if skill and skill["sub_skill"] else ""
        text_widget.insert("end", f"- ", "bold_no_underline")
        text_widget.insert("end", f"{skill_name}{sub_skill_display} ", "bold_no_underline")
        text_widget.insert("end", f"(Rank: {rank}, Cost: {cost:.1f}, Total: {total})\n")

    # Powers Section with Reroll Button
    text_widget.insert("end", "\nPOWERS (Reroll Click Here):\n", "bold")
    reroll_powers_button = tk.Button(text_widget, text="Reroll Powers", command=lambda: reroll_powers(character, text_widget))
    text_widget.window_create("end", window=reroll_powers_button)
    text_widget.insert("end", "\n", "bold")
    sorted_powers = sorted(character["powers"], key=lambda p: ["Combat", "Defensive", "Support", "Movement", "Utility", "Unknown"].index(p.get("type", "Unknown")))
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

    # Equipment Section with Reroll Button
    text_widget.insert("end", "\nEQUIPMENT:\n", "bold")
    text_widget.insert("end", "\n", "bold")
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
        text_widget.insert("end", f"{comp_description}\n\n\n")

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
                character['name'],
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
                character['initiative'],
                character['Motivation']['name'],
                character['Complications'][0],
                character['Complications'][1],
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
    global root, notebook, dark_mode, include_powers, pl_entry, text_widgets, equipment_points_entry, search_var, selected_archetype, hideout_details
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

    # Power Level Widgets
    pl_label = ttk.Label(left_frame, text="Please select Power Level:")
    pl_label.pack(anchor="w")

    pl_entry = ttk.Entry(left_frame)
    pl_entry.pack(fill="x", pady=2)

    # Load archetypes from the JSON file
    archetypes = load_archetypes()
    archetype_names = ["Please Select"] + list(archetypes.keys())
    selected_archetype = tk.StringVar(value="Please Select")

    # Archetype Dropdown
    archetype_label = ttk.Label(left_frame, text="Select Archetype:")
    archetype_label.pack(anchor="w")

    archetype_menu = ttk.OptionMenu(left_frame, selected_archetype, *archetype_names)
    archetype_menu.pack(anchor="w", pady=2)

    # Define the function to toggle include/exclude powers
    def toggle_include_powers():
        if include_powers.get():
            include_powers.set(False)
            toggle_button.config(text="Exclude Powers OFF")
        else:
            include_powers.set(True)
            toggle_button.config(text="Exclude Powers ON")

    # Character Management Frame (start open)
    char_frame = CollapsibleSection(left_frame, "Character Management (Click to open/close)", start_collapsed=False)
    char_frame.pack(fill="x", pady=5)

    generate_button = ttk.Button(char_frame.body_frame, text="Generate Character", command=on_generate_button_click, style='Character.TButton')
    char_frame.add_widget(generate_button)

    export_character_sheet_button = ttk.Button(char_frame.body_frame, text="Export to Character Sheet", command=lambda: on_export_character_sheet_click(notebook, characters, text_widgets), style='Character.TButton')
    char_frame.add_widget(export_character_sheet_button)

    toggle_button = ttk.Button(char_frame.body_frame, text="Exclude Powers OFF", command=toggle_include_powers, style='Character.TButton')
    char_frame.add_widget(toggle_button)

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
