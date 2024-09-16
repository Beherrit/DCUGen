import random
from utils import load_data_from_json

def validate_character(power_level, stats, defenses, skills, advantages, powers):
    validation_messages = []
    total_cost = 0

    # Validate stats
    stat_total = sum(stats.values())
    if stat_total > power_level * 7:
        validation_messages.append(f"Total stats ({stat_total}) exceed PL limit ({power_level * 7})")

    # Validate defenses
    for defense, value in defenses.items():
        if value > power_level + 10:
            validation_messages.append(f"{defense} ({value}) exceeds PL limit ({power_level + 10})")

    # Validate attack/effect and defense/toughness trade-offs
    attack_bonus = max(stats['Fighting'], stats['Dexterity'])
    effect_rank = max(stats['Strength'], max(power['rank'] for power in powers if power['type'] == 'Offensive'))

    if attack_bonus + effect_rank > power_level * 2:
        validation_messages.append(f"Attack bonus ({attack_bonus}) + effect rank ({effect_rank}) exceeds PL limit ({power_level * 2})")

    dodge = defenses['Dodge']
    toughness = defenses['Toughness']
    parry = defenses['Parry']

    if dodge + toughness > power_level * 2:
        validation_messages.append(f"Dodge ({dodge}) + Toughness ({toughness}) exceeds PL limit ({power_level * 2})")

    if parry + toughness > power_level * 2:
        validation_messages.append(f"Parry ({parry}) + Toughness ({toughness}) exceeds PL limit ({power_level * 2})")

    # Calculate total point cost
    stat_cost = sum(value * 2 for value in stats.values())
    defense_cost = sum(defenses.values())
    skill_cost = sum(skill['rank'] // 2 for skill in skills)
    advantage_cost = sum(advantage['cost'] for advantage in advantages)
    power_cost = sum(power['rank'] * 2 for power in powers)

    total_cost = stat_cost + defense_cost + skill_cost + advantage_cost + power_cost

    if total_cost > power_level * 15:
        validation_messages.append(f"Total point cost ({total_cost}) exceeds PL limit ({power_level * 15})")

    return validation_messages, total_cost

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

    # Validate Toughness including Protection, Force Field, and Defensive Roll
    character = validate_toughness(character)

    # Ensure the combined defenses don't exceed the max allowed
    if (character['defenses']['Parry']['total_rank'] + character['defenses']['Toughness']['total_rank']) > max_defense_toughness:
        raise ValueError("Parry and Toughness exceed the allowed limit")
    if (character['defenses']['Dodge']['total_rank'] + character['defenses']['Toughness']['total_rank']) > max_defense_toughness:
        raise ValueError("Dodge and Toughness exceed the allowed limit")
    if (character['defenses']['Fortitude']['total_rank'] + character['defenses']['Will']['total_rank']) > max_defense_toughness:
        raise ValueError("Fortitude and Will exceed the allowed limit")

    return character

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

def update_initiative(character):
    new_initiative = calculate_initiative(character)
    character["stats"]["Initiative"] = {"value": new_initiative}
    character["defenses"]["Initiative"] = new_initiative

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

def validate_luck_advantage(character, advantage_name, rank):
    if advantage_name.lower() == "luck":
        max_luck_rank = character["power_level"] // 2
        if rank > max_luck_rank:
            return False, f"Luck can only be ranked up to half the Power Level ({max_luck_rank})."
    return True, None

def enforce_luck_advantage_rule(character):
    for advantage in character["advantages"]:
        if advantage["name"].lower() == "luck":
            max_luck_rank = character["power_level"] // 2
            if advantage["rank"] > max_luck_rank:
                advantage["rank"] = max_luck_rank
                advantage["cost"] = max_luck_rank  # Assuming cost is equal to rank for Luck
    return character


def validate_toughness(character):
    power_level = character['power_level']
    max_defense_toughness = power_level * 2

    # Calculate additional toughness from Protection, Force Field, or Toughness powers
    additional_toughness = 0
    for power in character.get('powers', []):
        if power['name'] in ['Protection', 'Force Field']:
            additional_toughness += power['rank']

    # Check for Defensive Roll advantage
    defensive_roll = 0
    for advantage in character.get('advantages', []):
        if advantage['name'] == 'Defensive Roll':
            defensive_roll = advantage['rank']

    # Update the total Toughness rank
    character['defenses']['Toughness']['power_bonus'] = additional_toughness
    character['defenses']['Toughness']['defensive_roll'] = defensive_roll
    character['defenses']['Toughness']['total_rank'] = (
        character['defenses']['Toughness']['stat_bonus'] +
        character['defenses']['Toughness']['bought_rank'] +
        additional_toughness
    )

    # Validate against the rules
    if (character['defenses']['Parry']['total_rank'] + character['defenses']['Toughness']['total_rank']) > max_defense_toughness:
        raise ValueError("Parry and Toughness (including Protection/Force Field) exceed the allowed limit")
    if (character['defenses']['Dodge']['total_rank'] + character['defenses']['Toughness']['total_rank']) > max_defense_toughness:
        raise ValueError("Dodge and Toughness (including Protection/Force Field) exceed the allowed limit")

    return character