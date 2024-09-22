import display_character_sheet
from imports import *
from validation import *
import math
from map import MapEditor
from tkinter import messagebox
from beasts import open_beastiary
from migration import update_program


open_windows = {}

def open_gm_map():
    gm_window = tk.Toplevel()
    MapEditor(gm_window)

def get_log_file_path():
    if getattr(sys, 'frozen', False):  # Check if the program is running as an executable
        application_path = os.path.dirname(sys.executable)
    else:
        application_path = os.path.dirname(os.path.abspath(__file__))
    
    log_dir = os.path.join(application_path, 'logs')
    os.makedirs(log_dir, exist_ok=True)  # Create log directory if it does not exist
    return os.path.join(log_dir, 'character_generation.log')

log_file_path = get_log_file_path()

# Clear the log file contents
with open(log_file_path, 'w'):
    pass

logging.basicConfig(filename=log_file_path, level=logging.DEBUG, format='%(asctime)s %(message)s')

# Add a logger instance
logger = logging.getLogger(__name__)

POWER_POINTS_PER_LEVEL = 15
hideout_details = {}
characters = {}
current_theme = None
gm_cheat_sheet_app = None  # Store the GM Cheat Sheet app instance

# Load JSON files
stats_data = load_data_from_json('json/stats.json')
skills_data = load_data_from_json('json/skills.json')
defenses_data = load_data_from_json('json/defenses.json')
advantages_data = load_data_from_json('json/advantages.json')
powers_data = load_data_from_json('json/powers.json')
extras_data = load_data_from_json('json/extras.json')
flaws_data = load_data_from_json('json/flaws.json')
expanded_traits_data = load_data_from_json('json/expanded_traits.json')

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
    attribute_total_cost = sum(stat['cost'] if isinstance(stat, dict) else stat * 2 for stat in character['stats'].values())
    advantage_total_cost = sum(advantage['cost'] for advantage in character['advantages'] if advantage['name'] != 'Unspent Points')
    
    # Calculate skill total cost based on ranks
    total_skill_ranks = sum(skill['rank'] for skill in character['skills'])
    skill_total_cost = math.ceil(total_skill_ranks / 2)
    
    power_total_cost = sum(power['cost'] for power in character.get('powers', []))
    
    # Handle both dictionary and integer values for defenses
    defense_total_cost = sum(
        defense['bought_rank'] if isinstance(defense, dict) else defense
        for defense_name, defense in character['defenses'].items()
        if defense_name != 'Unspent Points'
    )
    
    total_cost = attribute_total_cost + advantage_total_cost + skill_total_cost + power_total_cost + defense_total_cost
    return attribute_total_cost, advantage_total_cost, skill_total_cost, power_total_cost, defense_total_cost, total_cost

def allocate_points(power_level, stat_percent, advantage_percent, skill_percent, defense_percent, power_percent, max_advantages, max_powers):
    total_points = power_level * POWER_POINTS_PER_LEVEL

    # Initial allocation with rounding
    stat_points = round(total_points * (stat_percent / 100))
    advantage_points = round(total_points * (advantage_percent / 100))
    skill_points = round(total_points * (skill_percent / 100))
    defense_points = round(total_points * (defense_percent / 100))
    power_points = round(total_points * (power_percent / 100))

    allocated_points = stat_points + advantage_points + skill_points + defense_points + power_points
    remaining_points = total_points - allocated_points

    # Distribute remaining points proportionally
    while remaining_points > 0:
        if stat_points < total_points * (stat_percent / 100):
            stat_points += 1
        elif advantage_points < total_points * (advantage_percent / 100):
            advantage_points += 1
        elif skill_points < total_points * (skill_percent / 100):
            skill_points += 1
        elif defense_points < total_points * (defense_percent / 100):
            defense_points += 1
        elif power_points < total_points * (power_percent / 100):
            power_points += 1
        remaining_points -= 1

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

    # Add any remaining points to "Unspent Points"
    if remaining_points > 0:
        allocated_stats['Unspent Points'] = {'value': remaining_points, 'cost': remaining_points * 2}
        logger.debug(f"Allocated remaining points to Unspent Points: {remaining_points}.")

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

    max_rank = max_defense_toughness // 2

    # Distribute defense points equally among defenses
    while defense_points > 0:
        all_maxed_out = True
        for defense in defense_allocation.keys():
            if defense_points <= 0:
                break
            stat_bonus = character['defenses'][defense]['stat_bonus']
            bought_rank = character['defenses'][defense]['bought_rank']
            total_rank = stat_bonus + bought_rank
            if total_rank < max_rank:
                defense_allocation[defense] += 1
                character['defenses'][defense]['bought_rank'] += 1
                character['defenses'][defense]['total_rank'] += 1
                defense_points -= 1
                all_maxed_out = False
                logger.debug(f"Allocated 1 point to {defense}, total rank is now {total_rank + 1}.")
        
        if all_maxed_out:
            break

    # Add any remaining points to "Unspent Points"
    if defense_points > 0:
        character['defenses']['Unspent Points'] = defense_points
        logger.debug(f"Allocated remaining points to Unspent Points: {defense_points}.")

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

    remaining_points = skill_points * 2  # Convert power points to skill ranks
    categories = list(skill_allocation.keys())
    random.shuffle(categories)

    total_skill_ranks = 0

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
                rank = random.randint(1, 2)

            if remaining_points < rank:
                rank = remaining_points

            associated_attribute = skill['tags'][0]
            if associated_attribute not in character['stats']:
                character['stats'][associated_attribute] = {'value': 0, 'cost': 0}

            total = rank + character['stats'][associated_attribute]['value']

            skills.append({
                "name": skill_name,
                "rank": rank,
                "total": total,
                "sub_skill": random.choice(skill.get('sub_skills', [None]))
            })

            remaining_points -= rank
            total_skill_ranks += rank

            logger.debug(f"Allocated {skill_name}: rank {rank}, remaining ranks {remaining_points}")

        if remaining_points <= 0:
            break

    # Ensure all skills from skills_data are present and sorted
    all_skills = {skill['name']: {"name": skill['name'], "rank": 0, "total": 0, "sub_skill": None} for skill in skills_data}
    for skill in skills:
        all_skills[skill['name']] = skill

    # Calculate the actual power points spent
    power_points_spent = math.ceil(total_skill_ranks / 2)
    
    logger.debug(f"Skill allocation complete. Total ranks: {total_skill_ranks}, Power points spent: {power_points_spent}")
    return sorted(list(all_skills.values()), key=lambda x: x["name"]), skill_points - power_points_spent

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

    remaining_points = total_points - total_cost
    logger.debug(f"Remaining points after allocation: {remaining_points}")

    return selected_advantages, total_cost, remaining_points

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
            available_powers = [power for power in powers_data if power['type'] == power_type and (range_type is None or power.get('range') == range_type)]
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

                # Calculate total extras and flaws costs
                extras_cost = sum(extra["value"] * extra_rank for extra, extra_rank in zip(selected_extras, [r for _, r in selected_extras_with_ranks]))
                flaws_cost = sum(flaw["value"] * flaw_rank for flaw, flaw_rank in zip(selected_flaws, [r for _, r in selected_flaws_with_ranks]))

                # Calculate flat modifiers
                flat_modifiers = sum(extra["value"] for extra in selected_extras if extra["type"] == "flat") - \
                                 sum(flaw["value"] for flaw in selected_flaws if flaw["type"] == "flat")

                # Calculate total cost using the provided formula
                total_cost = ((base_cost + extras_cost - flaws_cost) * rank) + flat_modifiers

                # Ensure the total cost is at least 1
                total_cost = max(total_cost, 1)

                if total_cost <= power_points:
                    power_entry = {
                        "name": power["name"],
                        "rank": rank,
                        "type": power["type"],
                        "base_cost": base_cost,
                        "range": power.get("range"),
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

                    # Check for "Area" extra and adjust "Accuracy"
                    has_area_extra = any("Area" in extra for extra, _ in selected_extras_with_ranks)
                    if has_area_extra:
                        selected_extras_with_ranks = [(extra, rank) for extra, rank in selected_extras_with_ranks if "Accuracy" not in extra]
                        max_rank = min(max_rank, power_level)  # Limit max rank to PL

                    character["powers"].append(power_entry)
                    selected_power_names.append(power["name"])
                    power_points -= total_cost
                    logger.debug(f"Allocated power {power['name']} with rank {rank}, total cost {total_cost}, extras {selected_extras_with_ranks}, flaws {selected_flaws_with_ranks}.")

    # Return remaining unspent points instead of appending as a power
    return character, power_points

def update_defense(character, allocated_stats):
    # Map stats to their corresponding defenses
    stat_to_defense = {
        'Agility': 'Dodge',
        'Awareness': 'Will',
        'Stamina': 'Fortitude',
        'Fighting': 'Parry'
    }

    # Update defenses based on stats
    for stat, defense in stat_to_defense.items():
        if stat in allocated_stats:
            stat_value = allocated_stats[stat]['value']
            if defense not in character['defenses']:
                character['defenses'][defense] = {'stat_bonus': 0, 'bought_rank': 0, 'total_rank': 0}
            character['defenses'][defense]['stat_bonus'] = stat_value
            character['defenses'][defense]['total_rank'] = stat_value + character['defenses'][defense]['bought_rank']

    # Update Toughness based on Stamina
    if 'Stamina' in allocated_stats:
        stamina_value = allocated_stats['Stamina']['value']
        if 'Toughness' not in character['defenses']:
            character['defenses']['Toughness'] = {'stat_bonus': 0, 'bought_rank': 0, 'total_rank': 0}
        character['defenses']['Toughness']['stat_bonus'] = stamina_value
        character['defenses']['Toughness']['total_rank'] = stamina_value + character['defenses']['Toughness']['bought_rank']

    return character

def edit_character(root, notebook, text_widgets, characters, dark_mode):
    current_tab = notebook.select()
    if current_tab:
        character_name = notebook.tab(current_tab, "text")
        if character_name in characters:
            expanded_traits = load_data_from_json('json/expanded_traits.json')
            CharacterEditor(root, notebook, text_widgets, characters, dark_mode, expanded_traits, characters[character_name])
        else:
            messagebox.showerror("Error", "No character selected to edit.")
    else:
        messagebox.showerror("Error", "No character selected to edit.")

def pretty_print_character(character, text_widget):
    # Clear existing content
    text_widget.delete('1.0', tk.END)

    # Set base font and styles
    base_font = ("Helvetica", 10)
    text_widget.configure(font=base_font)
    text_widget.tag_configure("header", font=("Helvetica", 12, "bold"))
    text_widget.tag_configure("subheader", font=("Helvetica", 11, "bold"))
    text_widget.tag_configure("bold", font=("Helvetica", 10, "bold"))

    def insert_header(text):
        text_widget.insert(tk.END, f"\n{text}\n", "header")
        text_widget.insert(tk.END, "="*len(text) + "\n\n")

    def insert_subheader(text):
        text_widget.insert(tk.END, f"{text}\n", "subheader")
        text_widget.insert(tk.END, "-"*len(text) + "\n")

    # Character Stats
    insert_header("Character Stats")
    text_widget.insert(tk.END, f"Power Level: {character['power_level']}\n")
    text_widget.insert(tk.END, f"Total Cost: {character['total_cost']}\n")
    text_widget.insert(tk.END, f"Unspent Points: {character['unspent_points']}\n")
    text_widget.insert(tk.END, f"Maximum Points Allowed: {character['max_points']}\n\n")

    # Basic Information
    insert_header("Character Creation Summary")
    
    insert_subheader("Basic Information")
    text_widget.insert(tk.END, f"Name: {character.get('name', 'Unnamed Character')}\n", "bold")
    text_widget.insert(tk.END, f"Gender: {character.get('gender', 'N/A')}\n")
    text_widget.insert(tk.END, f"Age: {character.get('age', 'N/A')}\n")
    text_widget.insert(tk.END, f"Theme: {character.get('theme', 'N/A')}\n")
    text_widget.insert(tk.END, f"Occupation: {character.get('occupation', 'N/A')}\n\n\n")

    # Origin
    insert_subheader("Origin")
    origin = character.get('origin', {})
    text_widget.insert(tk.END, f"Region: {origin.get('region', 'N/A')}\n")
    text_widget.insert(tk.END, f"Country: {origin.get('country', 'N/A')}\n")
    text_widget.insert(tk.END, f"Language: {origin.get('language', 'N/A')}\n\n\n")

    # Expanded Traits
    insert_subheader("Expanded Traits")
    if "expanded_traits" in character and character["expanded_traits"]:
        text_widget.insert(tk.END, "\nExpanded Traits:\n", "heading")
        for trait_type, trait_info in character["expanded_traits"].items():
            text_widget.insert(tk.END, f"  {trait_type.replace('_', ' ').title()}:\n", "subheading")
            text_widget.insert(tk.END, f"    Name: {trait_info['name']}\n")
            text_widget.insert(tk.END, f"    Description: {trait_info['description']}\n")

    # Character Stats
    insert_header("Character Stats")
    text_widget.insert(tk.END, f"Power Level: {character.get('power_level', 'N/A')}\n", "bold")
    text_widget.insert(tk.END, f"Total Cost: {int(character.get('total_cost', 0))}\n")
    text_widget.insert(tk.END, f"Unspent Points: {character.get('unspent_points', 0)}\n")
    text_widget.insert(tk.END, f"Maximum Points Allowed: {character.get('max_points', 'N/A')}\n\n")

    attribute_total_cost, advantage_total_cost, skill_total_cost, power_total_cost, defense_total_cost, _ = calculate_totals(character)
    text_widget.insert(tk.END, f"Attribute Total Cost: {attribute_total_cost}\n")
    text_widget.insert(tk.END, f"Advantage Total Cost: {advantage_total_cost}\n")
    text_widget.insert(tk.END, f"Skills Total Cost: {skill_total_cost}\n")
    text_widget.insert(tk.END, f"Powers Total Cost: {power_total_cost}\n")
    text_widget.insert(tk.END, f"Defenses Total Cost: {defense_total_cost}\n")

    # Attributes
    insert_header("Attributes")
    for stat in stats_data["STATS"]:
        stat_name = stat["name"]
        stat_details = character.get("stats", {}).get(stat_name, {"value": 0, "cost": 0})
        text_widget.insert(tk.END, f"{stat_name}: {stat_details['value']} (Cost: {stat_details['cost']})\n")

    # Defenses
    insert_header("Defenses")
    for defense, values in character['defenses'].items():
        if defense != 'Unspent Points':
            stat_bonus = values.get('stat_bonus', 0)
            bought_rank = values.get('bought_rank', 0)
            stored_total_rank = values.get('total_rank', 0)
            
            if defense == 'Toughness':
                power_bonus = values.get('power_bonus', 0)
                defensive_roll = values.get('defensive_roll', 0)
                calculated_total_rank = stat_bonus + power_bonus + defensive_roll
            else:
                calculated_total_rank = stat_bonus + bought_rank
            
            if defense == 'Toughness':
                text_widget.insert(tk.END, f"{defense}: Stat Bonus: {stat_bonus}, Power Bonus: {power_bonus}, Defensive Roll: {defensive_roll}, Total Rank: {calculated_total_rank}\n")
            else:
                text_widget.insert(tk.END, f"{defense}: Stat Bonus: {stat_bonus}, Bought Rank: {bought_rank}, Total Rank: {calculated_total_rank}\n")
    # Advantages
    insert_header("Advantages")
    sorted_advantages = sorted(character.get("advantages", []), key=lambda x: x["name"])
    for advantage in sorted_advantages:
        text_widget.insert(tk.END, f"{advantage['name']} (Rank: {advantage['rank']}, Cost: {advantage['cost']})\n")

    # Skills
    insert_header("Skills")
    sorted_skills = sorted(character.get("skills", []), key=lambda x: x["name"])
    for skill in sorted_skills:
        skill_name = skill["name"]
        sub_skill_display = f" : {skill['sub_skill']}" if skill.get("sub_skill") else ""
        associated_attribute = next((s['tags'][0] for s in skills_data if s['name'] == skill_name), None)
        attribute_rank = character['stats'][associated_attribute]['value'] if associated_attribute else 0
        total = skill['rank'] + attribute_rank
        cost = math.ceil(skill['rank'] / 2)  # Calculate cost based on rank
        text_widget.insert(tk.END, f"{skill_name}{sub_skill_display} (Rank: {skill['rank']}, Attribute Rank: {attribute_rank}, Total: {total}, Cost: {cost})\n")

    # Powers
    insert_header("Powers")
    for power in character.get("powers", []):
        # Calculate the correct cost
        base_cost = power.get('base_cost', power.get('cost', 1))  # Default to 'cost' or 1 if 'base_cost' is missing
        
        
        # Helper function to find extra/flaw data
        def find_in_data(name, data_list):
            return next((item for item in data_list if item['name'] == name), None)

        extras_cost = sum(find_in_data(extra, extras_data)['value'] * rank 
                          for extra, rank in zip(power['extras'], power['extras_ranks']) 
                          if find_in_data(extra, extras_data))
        
        flaws_cost = sum(find_in_data(flaw, flaws_data)['value'] * rank 
                         for flaw, rank in zip(power['flaws'], power['flaws_ranks']) 
                         if find_in_data(flaw, flaws_data))
        
        flat_modifiers = sum(find_in_data(extra, extras_data)['value'] 
                             for extra in power['extras'] 
                             if find_in_data(extra, extras_data) and find_in_data(extra, extras_data)['type'] == 'flat') - \
                         sum(find_in_data(flaw, flaws_data)['value'] 
                             for flaw in power['flaws'] 
                             if find_in_data(flaw, flaws_data) and find_in_data(flaw, flaws_data)['type'] == 'flat')
        
        total_cost = ((base_cost + extras_cost - flaws_cost) * power['rank']) + flat_modifiers
        total_cost = max(total_cost, 1)  # Ensure minimum cost of 1

        text_widget.insert(tk.END, f"{power['name']} (Rank: {power['rank']}, Cost: {total_cost})\n", "bold")
        text_widget.insert(tk.END, f"  Type: {power['type']}\n")
        if 'range' in power:
            text_widget.insert(tk.END, f"  Range: {power['range']}\n")
        if power['extras']:
            extras_str = ', '.join([f"{extra} (Rank: {rank})" for extra, rank in zip(power['extras'], power['extras_ranks'])])
            text_widget.insert(tk.END, f"  Extras: {extras_str}\n")
        if power['flaws']:
            flaws_str = ', '.join([f"{flaw} (Rank: {rank})" for flaw, rank in zip(power['flaws'], power['flaws_ranks'])])
            text_widget.insert(tk.END, f"  Flaws: {flaws_str}\n")
        resisted_by = power.get('resisted', 'N/A')
        text_widget.insert(tk.END, f"  Resisted by: {resisted_by}\n")
        accuracy = calculate_accuracy(character, power)
        text_widget.insert(tk.END, f"  Accuracy: {accuracy}\n")
        
        if all(key in power for key in ['close_range', 'medium_range', 'long_range']):
            text_widget.insert(tk.END, f"  Close Range: {power['close_range']} ft, Medium Range: {power['medium_range']} ft, Long Range: {power['long_range']} ft\n")
        
        if power['type'] == 'Combat':
            accuracy = calculate_accuracy(character, power)
            effect_rank = power['rank']
            total = accuracy + effect_rank
            max_total = character['power_level'] * 2
            text_widget.insert(tk.END, f"  Accuracy + Effect: {total}/{max_total} (Accuracy: {accuracy}, Effect: {effect_rank})\n")

    # Attacks
    insert_header("Attacks")
    melee_attack_bonus, ranged_attack_bonus = calculate_attack_bonuses(character)
    text_widget.insert(tk.END, f"Melee Attack Bonus: {melee_attack_bonus}\n", "bold")
    for power in character["powers"]:
        if power.get("range") == "Melee":
            text_widget.insert(tk.END, f"  {power['name']} (Effect Rank: {power['rank']})\n")

    text_widget.insert(tk.END, f"\nRanged Attack Bonus: {ranged_attack_bonus}\n", "bold")
    for power in character["powers"]:
        if power.get("range") == "Ranged":
            text_widget.insert(tk.END, f"  {power['name']} (Effect Rank: {power['rank']})\n")
            if all(key in power for key in ['close_range', 'medium_range', 'long_range']):
                text_widget.insert(tk.END, f"    Close Range: {power['close_range']} ft, Medium Range: {power['medium_range']} ft, Long Range: {power['long_range']} ft\n")

    # Equipment
    insert_header("Equipment")
    for item in character.get('equipment', []):
        text_widget.insert(tk.END, f"{item['name']}\n", "bold")
        if 'description' in item:
            text_widget.insert(tk.END, f"  Description: {item['description']}\n")
        if 'effects' in item:
            text_widget.insert(tk.END, f"  Effects: {', '.join(item['effects'])}\n")
        if 'rank' in item:
            text_widget.insert(tk.END, f"  Rank: {item['rank']}\n")
        if 'cost' in item:
            text_widget.insert(tk.END, f"  Cost: {item['cost']}\n")
        if 'total_cost' in item:
            text_widget.insert(tk.END, f"  Total Cost: {item['total_cost']}\n")

    # Physical Traits
    insert_header("Physical Traits")
    for trait, value in character.get("physical_traits", {}).items():
        text_widget.insert(tk.END, f"{trait.capitalize()}: {value}\n")
    text_widget.insert(tk.END, f"Costume Style: {character.get('costume_style', 'N/A')}\n")
    text_widget.insert(tk.END, f"Distinctive Feature: {character.get('distinctive_feature', 'N/A')}\n")

    # Personality Traits
    insert_header("Personality Traits")
    text_widget.insert(tk.END, "Positive Traits:\n", "bold")
    positive_traits = " | ".join(character.get('personality_traits', {}).get('positive_traits', []))
    text_widget.insert(tk.END, f"{positive_traits}\n\n")

    text_widget.insert(tk.END, "Negative Traits:\n", "bold")
    negative_traits = " | ".join(character.get('personality_traits', {}).get('negative_traits', []))
    text_widget.insert(tk.END, f"{negative_traits}\n\n")

    text_widget.insert(tk.END, "Quirky Traits:\n", "bold")
    quirky_traits = character.get('personality_traits', {}).get('quirky_traits', [])
    text_widget.insert(tk.END, f"{' | '.join(quirky_traits) if quirky_traits else 'None'}\n")

    # Languages
    insert_header("Languages")
    for language in character.get('languages', []):
        text_widget.insert(tk.END, f"{language}\n")

    # Initiative
    insert_header("Initiative")
    text_widget.insert(tk.END, f"{character.get('initiative', 'N/A')}\n")

    # Motivation
    insert_header("Motivation")
    motivation = character.get("Motivation", {})
    text_widget.insert(tk.END, f"{motivation.get('name', 'N/A')}: {motivation.get('description', 'N/A')}\n")

    # Complications
    insert_header("Complications")
    for complication in character.get("Complications", []):
        text_widget.insert(tk.END, f"{complication['name']}: {complication['description']}\n")

    # AI Image Generator Prompt
    insert_header("AI Image Generator Prompt")
    description = character.get("description", "No description available")
    text_widget.insert(tk.END, description + "\n")

def generate_character(power_level, include_powers, stat_percent, advantage_percent, skill_percent, defense_percent, power_percent, max_advantages, max_powers, selected_power_types, random_physical_features=True, random_costume_style=True, random_distinctive_feature=True, villain=False):
    # Load the stats data at the beginning of the function
    stats_data = load_data_from_json('json/stats.json')

    max_retries = 10
    for attempt in range(max_retries):
        try:
            logger.debug(f"Starting character generation attempt {attempt + 1} with Power Level: {power_level}")

            # Allocate initial points with constraints and redistribution
            stat_points, advantage_points, skill_points, defense_points, power_points = allocate_points(
                power_level, 
                stat_percent, 
                advantage_percent, 
                skill_percent, 
                defense_percent, 
                power_percent,
                max_advantages, 
                max_powers
            )
            random.seed()
            random_theme = generate_random_theme() if include_powers else "Mundane"
            # Generate age and occupation
            age = generate_random_age()  # Call the function to get the age
            occupation = generate_random_occupation(age)  # Pass the age value, not the function


            # Initialize character basics
            gender, name = generate_random_gender()
            origin = generate_random_origin()
            personality_traits = generate_random_traits()
            motivations_and_complications = generate_motivations_and_complications(villain=villain)
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
                'age': age,
                'occupation': occupation,
                "physical_traits": physical_traits,
                "costume_style": generate_random_costume_style() if random_costume_style else "Not Specified",
                "distinctive_feature": generate_random_distinctive_feature() if random_distinctive_feature else "Not Specified",
                "personality_traits": personality_traits,
                "languages": languages,
                "initiative": initiative,
                "Motivation": motivations_and_complications["Motivation"],
                "Complications": motivations_and_complications["Complications"],
                "expanded_traits": generate_expanded_traits()
            }

            # Generate the character description for the AI image prompt
            character["description"] = generate_character_description({
                'name': character.get('name', 'The character'),
                'gender': gender,
                'age': character['age'],
                'origin': origin,
                'physical_traits': physical_traits,
                'theme': random_theme,
                'costume_style': character['costume_style'],
                'distinctive_feature': character['distinctive_feature'],
                'personality_traits': character.get('personality_traits', {}),
                'Motivation': character.get('Motivation', {}),
                'Complications': character.get('Complications', [])
            })

            logger.debug("Allocated Points - Stats: %d, Advantages: %d, Skills: %d, Defenses: %d, Powers: %d",
                         stat_points, advantage_points, skill_points, defense_points, power_points)

            # Allocate stats
            allocated_stats = allocate_stats(stat_points, stats_data)
            character['stats'] = allocated_stats
            logger.debug("Allocated Stats.")

            # Update defenses based on stats
            character = update_defense(character, allocated_stats)
            logger.debug("Updated Defenses.")

            # Allocate skills
            allocated_skills, remaining_skill_points = allocate_skills(skill_points, character)
            character['skills'] = allocated_skills
            logger.debug("Allocated Skills.")

            # Allocate advantages
            advantages, advantage_total_cost, remaining_advantage_points = allocate_advantages(max_advantages, advantage_points)
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

            # Enforce rules and validate toughness
            character = enforce_rules(character, power_level)
            character = validate_toughness(character)

            # Calculate total cost
            attribute_total_cost, advantage_total_cost, skill_total_cost, power_total_cost, defense_total_cost, total_cost = calculate_totals(character)
            character['total_cost'] = total_cost

            # Set maximum points allowed
            character['max_points'] = power_level * POWER_POINTS_PER_LEVEL

            # Handle unspent points
            character['unspent_points'] = remaining_power_points + remaining_skill_points

            logger.debug("Character generation completed.")
            return character

        except ValueError as e:
            logger.warning(f"Character generation attempt {attempt + 1} failed due to enforcement rules: {e}")
            continue  # Retry character generation

    # If all attempts fail, raise an exception
    raise ValueError("Failed to generate a valid character within the maximum number of retries.")

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

def open_excel_character_sheet():
    file_path = filedialog.askopenfilename(filetypes=[("Excel files", "*.xlsx")])
    if file_path:
        display_character_sheet.display_excel_data(file_path, notebook)

def main():
    global root, notebook, dark_mode, include_powers, pl_entry, text_widgets, equipment_points_entry, search_var, hideout_details, logger

    # Import ttkbootstrap
    import ttkbootstrap as ttk
    from ttkbootstrap import Style

    # Define the initial theme
    theme_name = "darkly"

    # Use ttkbootstrap for a modern look
    root = ttk.Window(themename="darkly")
    root.title("Character Creation Version 5.3.1 Prod")
    
    # Set base size for the main window
    root.geometry("1024x768")  # Width x Height

    # Initialize system optimizations
    log_file_path = get_log_file_path()
    system.initialize_system(root, log_file_path, theme_name)  # Pass both root and log_file_path

    dark_mode = True
    include_powers = tk.BooleanVar(value=False)  # Set include_powers to False by default (unchecked)

    text_widgets = {}
    hideout_details = {}  # Initialize hideout details dictionary
    create_table_if_not_exists()

    # Define colors for different button groups
    primary_button_color = "primary"
    secondary_button_color = "secondary"

    # Main layout frames
    left_frame = ttk.Frame(root, width=250)  # Set a fixed width for the left frame
    left_frame.grid(row=0, column=0, sticky="ns", padx=5, pady=5)
    left_frame.grid_propagate(False)  # Prevent the frame from shrinking

    # Create a canvas for the left frame
    canvas = tk.Canvas(left_frame, width=230)
    canvas.pack(side="left", fill="both", expand=True)

    # Add a scrollbar to the canvas
    scrollbar = ttk.Scrollbar(left_frame, orient="vertical", command=canvas.yview)
    scrollbar.pack(side="right", fill="y")

    # Configure the canvas
    canvas.configure(yscrollcommand=scrollbar.set)

    # Create a frame inside the canvas
    inner_frame = ttk.Frame(canvas)

    # Add that new frame to a window in the canvas
    canvas.create_window((0, 0), window=inner_frame, anchor="nw")

    def _on_mousewheel(event):
        canvas.yview_scroll(int(-1*(event.delta/120)), "units")

    # Bind mousewheel event to the left frame and its children
    left_frame.bind_all("<MouseWheel>", _on_mousewheel, add="+")

    def _bound_to_mousewheel(event):
        left_frame.bind_all("<MouseWheel>", _on_mousewheel)

    def _unbound_to_mousewheel(event):
        left_frame.unbind_all("<MouseWheel>")

    # Bind the functions to enter and leave events
    left_frame.bind('<Enter>', _bound_to_mousewheel)
    left_frame.bind('<Leave>', _unbound_to_mousewheel)

    # Update the scroll region when the inner frame changes
    inner_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))

        
    # Add that new frame to a window in the canvas
    canvas.create_window((0, 0), window=inner_frame, anchor="nw", width=230)

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

    def perform_search(*args):
        search_term = search_var.get().lower()
        for tab_id, text_widget in text_widgets.items():
            content = text_widget.get("1.0", tk.END).lower()
            if search_term in content:
                notebook.select(tab_id)
                start_index = content.index(search_term)
                end_index = start_index + len(search_term)
                text_widget.tag_remove("search", "1.0", tk.END)
                text_widget.tag_add("search", f"1.0+{start_index}c", f"1.0+{end_index}c")
                text_widget.tag_config("search", background="yellow" if not dark_mode else "blue", foreground="black" if not dark_mode else "white")
                text_widget.see(f"1.0+{start_index}c")
                break

    # Set up a trace on the search_var after it's defined
    search_var.trace_add('write', perform_search)

    # Bind KeyRelease event to search function
    search_entry.bind('<KeyRelease>', lambda event: perform_search())

    # Character Creator Section
    char_creator_frame = CollapsibleSection(inner_frame, "Character Creator", start_collapsed=False)
    char_creator_frame.pack(fill="x", pady=5)

    generate_character_filters_button = ttk.Button(
        char_creator_frame.body_frame, 
        text="Generate Character", 
        command=lambda: open_character_filters_window(root, notebook, text_widgets, characters, dark_mode, logger), 
        style=f'{primary_button_color}.TButton'
    )
    char_creator_frame.add_widget(generate_character_filters_button)
    ToolTip(generate_character_filters_button, "Open a window to set filters and generate a character.")

    create_custom_character_button = ttk.Button(
        char_creator_frame.body_frame, 
        text="Create Custom Character", 
        command=lambda: open_custom_character_window(root, notebook, text_widgets, characters, dark_mode), 
        style=f'{primary_button_color}.TButton'
    )
    char_creator_frame.add_widget(create_custom_character_button)
    ToolTip(create_custom_character_button, "Open a window to create a fully customized character.")

    # Edit Character button
    edit_character_button = ttk.Button(
        char_creator_frame.body_frame,
        text="Edit Character",
        command=lambda: edit_character(root, notebook, text_widgets, characters, dark_mode),
        style=f'{primary_button_color}.TButton'
    )
    char_creator_frame.add_widget(edit_character_button)
    ToolTip(edit_character_button, "Edit the currently selected character.")

    export_character_sheet_button = ttk.Button(char_creator_frame.body_frame, text="Export Character Sheet", command=lambda: on_export_character_sheet_click(notebook, characters, text_widgets), style=f'{primary_button_color}.TButton')
    char_creator_frame.add_widget(export_character_sheet_button)
    ToolTip(export_character_sheet_button, "Export the current character data to a character sheet.")

    close_tab_button = ttk.Button(char_creator_frame.body_frame, text="Close Tab", command=lambda: close_current_tab(notebook, text_widgets), style=f'{primary_button_color}.TButton')
    char_creator_frame.add_widget(close_tab_button)
    ToolTip(close_tab_button, "Close the currently selected tab.")

    close_all_tabs_button = ttk.Button(char_creator_frame.body_frame, text="Close All Tabs", command=lambda: close_all_tabs(notebook, text_widgets, characters), style=f'{primary_button_color}.TButton')
    char_creator_frame.add_widget(close_all_tabs_button)
    ToolTip(close_all_tabs_button, "Close all open tabs in the notebook.")

    copy_prompt_button = ttk.Button(char_creator_frame.body_frame, text="Copy AI Prompt", command=lambda: copy_prompt_to_clipboard(notebook, characters), style=f'{primary_button_color}.TButton')
    char_creator_frame.add_widget(copy_prompt_button)
    ToolTip(copy_prompt_button, "Copy the AI prompt for the character to the clipboard.")

    # GM Tools Section
    gm_tools_frame = CollapsibleSection(inner_frame, "GM Tools", start_collapsed=False)
    gm_tools_frame.pack(fill="x", pady=5)

    # Equipment Generator
    generate_equipment_button = ttk.Button(gm_tools_frame.body_frame, text="Generate Equipment", command=lambda: on_generate_equipment_click(notebook, text_widgets), style=f'{secondary_button_color}.TButton')
    gm_tools_frame.add_widget(generate_equipment_button)
    ToolTip(generate_equipment_button, "Generate equipment based on specified points.")

    # Vehicle Generator
    generate_vehicle_button = ttk.Button(gm_tools_frame.body_frame, text="Generate Vehicle", command=lambda: on_generate_vehicle_click(notebook, text_widgets), style=f'{secondary_button_color}.TButton')
    gm_tools_frame.add_widget(generate_vehicle_button)
    ToolTip(generate_vehicle_button, "Generate a vehicle using specified points.")

    # Hideout Generator
    generate_hideout_button = ttk.Button(gm_tools_frame.body_frame, text="Generate Hideout", command=lambda: on_generate_hideout_click(notebook, text_widgets), style=f'{secondary_button_color}.TButton')
    gm_tools_frame.add_widget(generate_hideout_button)
    ToolTip(generate_hideout_button, "Generate a new hideout.")

    save_as_text_button = ttk.Button(
        gm_tools_frame.body_frame,
        text="Save As Text",
        command=lambda: save_file_as_text(notebook, text_widgets),
        style=f'{secondary_button_color}.TButton'
    )
    gm_tools_frame.add_widget(save_as_text_button)
    ToolTip(save_as_text_button, "Save the current content as a text file.")

    # Encounter Generator
    generate_encounter_button = ttk.Button(gm_tools_frame.body_frame, text="Generate Encounter", command=generate_encounter, style=f'{secondary_button_color}.TButton')
    gm_tools_frame.add_widget(generate_encounter_button)
    ToolTip(generate_encounter_button, "Generate a random encounter.")

    # When setting up your menu or button:
    initiative_tracker_button = ttk.Button(
        gm_tools_frame.body_frame,
        text="Initiative Tracker",
        command=lambda: open_initiative_tracker(notebook, characters, []),
        style=f'{secondary_button_color}.TButton'
    )
    gm_tools_frame.add_widget(initiative_tracker_button)
    ToolTip(initiative_tracker_button, "Open the Initiative Tracker to manage combat order.")

    # Add new button for opening Excel character sheet
    open_excel_sheet_button = ttk.Button(
        gm_tools_frame.body_frame,
        text="Open Excel Character Sheet",
        command=open_excel_character_sheet,
        style=f'{secondary_button_color}.TButton'
    )
    gm_tools_frame.add_widget(open_excel_sheet_button)
    ToolTip(open_excel_sheet_button, "Open and view an Excel character sheet.")

    # Combat Calculator
    combat_calculator_button = ttk.Button(
        gm_tools_frame.body_frame,
        text="Combat Calculator",
        command=open_combat_calculator,
        style=f'{secondary_button_color}.TButton'
    )
    gm_tools_frame.add_widget(combat_calculator_button)
    ToolTip(combat_calculator_button, "Open the combat calculator for various combat-related calculations.")

    # Dice Roller
    dice_roller_button = ttk.Button(
        gm_tools_frame.body_frame,
        text="Dice Roller",
        command=open_dice_roller,
        style=f'{secondary_button_color}.TButton'
    )
    gm_tools_frame.add_widget(dice_roller_button)
    ToolTip(dice_roller_button, "Open the dice roller for various dice rolls.")

    # Function to open GM Cheat Sheet
    def open_gm_cheat_sheet():
        if 'gm_cheat_sheet' not in open_windows or not open_windows['gm_cheat_sheet'].winfo_exists():
            new_window = ttk.Toplevel(root)
            gm_app = GMSheetApp(new_window, notebook, characters)
            open_windows['gm_cheat_sheet'] = new_window
        else:
            open_windows['gm_cheat_sheet'].lift()

    # Complications
    complications = load_data_from_json('./json/complications.json')
    complications_button = ttk.Button(gm_tools_frame.body_frame, text="Complications", command=lambda: open_complications_window(complications), style=f'{secondary_button_color}.TButton')
    gm_tools_frame.add_widget(complications_button)
    ToolTip(complications_button, "Open the complications window to select and view random conflicts.")
    # Function to open HowTo guide
    def open_howto():
        new_window = ttk.Toplevel(root)
        howto_app = HowToApp(new_window)

    # GM Cheat Sheet
    gm_cheat_sheet_button = ttk.Button(gm_tools_frame.body_frame, text="GM Cheat Sheet", command=open_gm_cheat_sheet, style=f'{secondary_button_color}.TButton')
    gm_tools_frame.add_widget(gm_cheat_sheet_button)
    ToolTip(gm_cheat_sheet_button, "Open the GM Cheat Sheet for quick access to character details.")

    # Map Editor Button
    map_editor_button = ttk.Button(
        gm_tools_frame.body_frame,
        text="Open Map Editor",
        command=open_gm_map,
        style=f'{secondary_button_color}.TButton'
    )
    gm_tools_frame.add_widget(map_editor_button)
    ToolTip(map_editor_button, "Open the Map Editor for creating and managing game maps.")

    # Add a button in the main window setup
    beastiary_button = ttk.Button(gm_tools_frame.body_frame, text="Beastiary", command=open_beastiary, style=f'{secondary_button_color}.TButton')
    gm_tools_frame.add_widget(beastiary_button)
    ToolTip(beastiary_button, "Open the Beastiary to view and manage creature information.")

    # Reference Tools
    calculate_powers_button = ttk.Button(gm_tools_frame.body_frame, text="Calculate Powers", command=open_calculate_powers_window, style=f'{secondary_button_color}.TButton')
    gm_tools_frame.add_widget(calculate_powers_button)
    ToolTip(calculate_powers_button, "Open the power calculation window.")

    reference_data_button = ttk.Button(gm_tools_frame.body_frame, text="Reference Data", command=open_reference_data, style=f'{secondary_button_color}.TButton')
    gm_tools_frame.add_widget(reference_data_button)
    ToolTip(reference_data_button, "Open the reference data window.")

    notes_button = ttk.Button(gm_tools_frame.body_frame, text="GM Notes", command=lambda: NotesApp(ttk.Toplevel(root)), style=f'{secondary_button_color}.TButton')
    gm_tools_frame.add_widget(notes_button)
    ToolTip(notes_button, "Open the GM Notes window to manage and organize your game notes.")

    # Settings Section
    settings_frame = CollapsibleSection(inner_frame, "Settings", start_collapsed=False)
    settings_frame.pack(fill="x", pady=5)

    settings_button = ttk.Button(settings_frame.body_frame, text="Open Settings", command=lambda: settings.open_settings(root), style=f'{primary_button_color}.TButton')
    settings_frame.add_widget(settings_button)
    ToolTip(settings_button, "Open application settings.")

    howto_button = ttk.Button(settings_frame.body_frame, text="Guides / How To", command=open_howto, style=f'{primary_button_color}.TButton')
    settings_frame.add_widget(howto_button)
    ToolTip(howto_button, "Access guides and instructions for using the application.")


    changelog_button = ttk.Button(
        settings_frame.body_frame,
        text="View Changelog",
        command=lambda: open_changelog(root),  # Pass root as an argument
        style=f'{primary_button_color}.TButton'
    )
    settings_frame.add_widget(changelog_button)
    ToolTip(changelog_button, "View the changelog to see recent updates and changes.")

    settings_frame = CollapsibleSection(inner_frame, "Settings", start_collapsed=False)
    settings_frame.pack(fill="x", pady=5)

    update_program_button = ttk.Button(
        settings_frame.body_frame,
        text="Update Program",
        command=lambda: update_program_action(),
        style=f'{primary_button_color}.TButton'
    )
    settings_frame.add_widget(update_program_button)
    ToolTip(update_program_button, "Check for and apply program updates.")

    def update_program_action():
        current_version = "5.3.1"  # Replace with your version tracking method
        update_program(current_version)

    # Lock Window Button
    lock_window_var = tk.BooleanVar()
    lock_window_button = ttk.Checkbutton(settings_frame.body_frame, text="Lock Window", variable=lock_window_var, 
                                         command=lambda: toggle_window_lock(root, lock_window_var),
                                         style='primary.TCheckbutton')
    settings_frame.add_widget(lock_window_button)
    ToolTip(lock_window_button, "Toggle window lock to keep it on top of other windows.")

    # Configure the main window to resize properly
    root.grid_rowconfigure(0, weight=1)
    root.grid_columnconfigure(1, weight=1)

    # Update the canvas scroll region when the size of the inner frame changes
    inner_frame.bind('<Configure>', lambda e: canvas.configure(scrollregion=canvas.bbox("all")))

    update_color_scheme(dark_mode, root)

    root.protocol("WM_DELETE_WINDOW", lambda: [save_tabs(notebook, text_widgets, characters), root.destroy()])  # Save tabs and close the program
    root.mainloop()

def toggle_window_lock(window, lock_var):
    window.attributes('-topmost', lock_var.get())

if __name__ == "__main__":
    main()