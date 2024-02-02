import random

# Function to generate random stats
def generate_random_stats():
    return [random.randint(5, 18) for _ in range(6)]

# Function to select a random race
def select_random_race():
    races = list(racial_stat_bonuses.keys())  # Dynamically get races from the bonuses dictionary
    return random.choice(races)

# Function to select a random class
def select_random_class():
    classes = ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"]
    return random.choice(classes)

# Function to select a random level
def select_random_level():
    return random.randint(1, 3)

# Racial stat bonuses
racial_stat_bonuses = {
    "Human": {"Str": 1, "Dex": 1, "Con": 1, "Int": 1, "Wis": 1, "Cha": 1},
    "Elf": {"Dex": 2},
    "Dwarf": {"Con": 2},
    "Halfling": {"Dex": 2},
    "Gnome": {"Int": 2},
    "Tiefling": {"Int": 1, "Cha": 2},
    "Dragonborn": {"Str": 2, "Cha": 1},
    "Half-Orc": {"Str": 2, "Con": 1},
    "Half-Elf": {"Cha": 2, "Free": 2},  # Assuming 2 free points to distribute
    "Aarakocra": {"Dex": 2, "Wis": 1},
    "Genasi": {"Con": 2},  # Note: Subraces have additional bonuses
    "Goliath": {"Str": 2, "Con": 1},
    "Aasimar": {"Cha": 2, "Wis": 1},  # Variant subraces have different bonuses
    "Bugbear": {"Str": 2, "Dex": 1},
    "Firbolg": {"Wis": 2, "Str": 1},
    "Kenku": {"Dex": 2, "Wis": 1},
    "Lizardfolk": {"Con": 2, "Wis": 1},
    "Tabaxi": {"Dex": 2, "Cha": 1},
    "Triton": {"Str": 1, "Con": 1, "Cha": 1},
    "Kobold": {"Dex": 2, "Str": -2},  # Note the strength penalty
    "Yuan-Ti Pureblood": {"Cha": 2, "Int": 1},
    "Goblin": {"Dex": 2, "Con": 1},
    "Hobgoblin": {"Con": 2, "Int": 1},
    "Orc": {"Str": 2, "Con": 1, "Int": -2},  # Note the intelligence penalty
    "Tortle": {"Str": 2, "Wis": 1},
    "Changeling": {"Cha": 2, "Dex": 1},  # Assuming default bonuses, can vary
    "Kalashtar": {"Wis": 2, "Cha": 1},
    "Warforged": {"Con": 2, "Free": 1},  # 1 free point to distribute
    "Shifter": {"Dex": 1, "Wis": 1},  # Basic bonuses, subraces add more
    "Centaur": {"Str": 2, "Wis": 1},
    "Loxodon": {"Con": 2, "Wis": 1},
    "Minotaur": {"Str": 2, "Con": 1},
    "Simic Hybrid": {"Con": 2, "Free": 1},  # 1 free point to distribute
    "Vedalken": {"Int": 2, "Wis": 1}
    # Note: This list might not be exhaustive and reflects the races available as of the last update.
}

# Apply racial bonuses to stats
def apply_racial_bonuses(base_stats, race):
    bonuses = racial_stat_bonuses.get(race, {})
    stats_names = ["Str", "Dex", "Con", "Int", "Wis", "Cha"]
    modified_stats = {name: value for name, value in zip(stats_names, base_stats)}

    for stat, bonus in bonuses.items():
        if stat == "Free":
            print(f"You have {bonus} free points to distribute for being a {race}.")
            for _ in range(bonus):
                free_stat = input("Where do you wish to add the stat bonus? (Str, Dex, Con, Int, Wis, Cha): ").capitalize()
                if free_stat in modified_stats:
                    modified_stats[free_stat] += 1
                else:
                    print("Invalid stat. Please choose from Str, Dex, Con, Int, Wis, Cha.")
                    continue  # Ask again if the input is invalid
        else:
            modified_stats[stat] += bonus

    return [modified_stats[stat] for stat in stats_names]

# Generating a random character
def generate_random_character():
    base_stats = generate_random_stats()
    race = select_random_race()
    modified_stats = apply_racial_bonuses(base_stats, race)
    char_class = select_random_class()
    level = select_random_level()
    
    # Formatting stats for output
    stats_names = ["Str", "Dex", "Con", "Int", "Wis", "Cha"]
    formatted_stats = "\n".join(f"{name}: {value}" for name, value in zip(stats_names, modified_stats))
    
    character_details = {
        "Stats": formatted_stats,
        "Race": race,
        "Class": char_class,
        "Level": level
    }
    return character_details

# Generate and display the random character
random_character = generate_random_character()
print(f"Stats:\n{random_character['Stats']}")
print(f"Race: {random_character['Race']}")
print(f"Class: {random_character['Class']}")
print(f"Level: {random_character['Level']}")
input("Press enter to exit.")
