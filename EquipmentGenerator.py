import random

vehicles = [
    {
        "name": "AEGIS RAPTOR APC",
        "size": "Huge",
        "strength": 12,
        "speed": "4 (air)",
        "defense": 6,
        "toughness": 12,
        "powers": [
            {"name": "Impervious Toughness", "rank": 8},
            {"name": "Ranged Damage", "rank": 8, "extras": ["Ranged", "Burst Area", "Damage 5"]},
        ],
        "features": ["Autopilot (+4)", "Communications", "Navigation System"],
        "cost": 45
    },
    {
        "name": "IMPERIUM STAR-CRUISER",
        "size": "Colossal",
        "strength": 18,
        "speed": "14 (space)",
        "defense": 2,
        "toughness": 15,
        "powers": [
            {"name": "Laser Batteries", "rank": 12, "extras": ["Ranged", "Damage 12"]},
            {"name": "Energy Torpedoes", "rank": 10, "extras": ["Ranged", "Burst Area", "Damage 10", "Direct Hit Damage +2", "Homing 8"]},
            {"name": "Movement", "rank": 2, "extras": ["Space Flight"]}
        ],
        "features": [
            "Autopilot (+8)",
            "Communications 2",
            "Computer",
            "Navigation System",
            "Rooms (Hangar, Holding Cells, Infirmary, Living Space, Personnel, Security System, Workshop)"
        ],
        "cost": 95
    },
    {
        "name": "SHADOW SOBEK GUNSHIP",
        "size": "Huge",
        "strength": 8,
        "speed": "8 (air)",
        "defense": 6,
        "toughness": 9,
        "powers": [
            {"name": "Tartarus Blaster Cannons", "rank": 8, "extras": ["Ranged", "Multiattack", "Damage 8"]},
            {"name": "Apep Rockets", "rank": 6, "extras": ["Ranged", "Burst Area", "Damage 6", "Direct Hit Damage +3"]},
            {"name": "Camo-Cloak", "rank": 4, "extras": ["Visual Concealment 4"]},
            {"name": "Radarbane", "rank": 2, "extras": ["Radio Concealment 2"]}
        ],
        "features": ["Autopilot (+4)", "Communications", "Navigation System", "Stealth (Subtle Flight)"],
        "cost": 55
    },
    {
        "name": "PEGASUS SPACEPLANE",
        "size": "Gargantuan",
        "strength": 12,
        "speed": "12 (space)",
        "defense": 6,
        "toughness": 13,
        "powers": [
            {"name": "Movement", "rank": 2, "extras": ["Space Flight"]}
        ],
        "features": ["Autopilot (+4)", "Communications", "Computer", "Navigation System", "Remote Control"],
        "cost": 40
    },
    {
        "name": "URBAN TANK",
        "size": "Huge",
        "strength": 10,
        "speed": "6 (ground)",
        "defense": 7,
        "toughness": 12,
        "powers": [
            {"name": "Impervious Toughness", "rank": 8}
        ],
        "features": [
            "Alternate Vehicle (emergency motorcycle)",
            "Autopilot (+4)",
            "Caltrops",
            "Communications",
            "Computer",
            "Navigation System",
            "Oil Slick",
            "Remote Control"
        ],
        "cost": 30
    },
    {
        "name": "THE PHANTOM CYCLE",
        "size": "Medium",
        "strength": 1,
        "speed": "11 (ground)",
        "defense": 10,
        "toughness": 10,
        "powers": [
            {"name": "Movement", "rank": 4, "extras": ["Permeate 2", "Wall-crawling 2"]}
        ],
        "extras": ["Summonable (+2 to Equipment rank cost)"],
        "features": ["Autopilot (+4)", "Communications", "Computer", "Navigation System"],
        "cost": 25
    },
    {
        "name": "WYLDRIDE",
        "size": "Medium",
        "strength": 5,
        "speed": "20 (space)",
        "defense": 10,
        "toughness": 15,
        "powers": [
            {"name": "Cosmic Blaster", "rank": 12, "extras": ["Ranged", "Damage 12"]},
            {"name": "Immunity", "rank": 5, "extras": ["Warpwold", "Affects Others"]},
            {"name": "Wyldwarp", "rank": 3, "extras": ["Space Travel 3"]}
        ],
        "features": ["Communications"],
        "cost": 90
    },
    {
        "name": "ROCKET SKATEBOARD",
        "powers": [
            {"name": "Speed", "rank": 5}
        ],
        "cost": 5  # Adjust the cost as needed
    }
]

basic_equipment = [
    {"name": "Flashlight", "cost": 1, "rank": 1, "damage": None, "armour": None, "damage_type": None, "total_cost": None},
    {"name": "First Aid Kit", "cost": 2, "rank": 2, "damage": None, "armour": None, "damage_type": None, "total_cost": None},
    # Add more basic equipment options here
]

headquarters = [
    {"name": "Safehouse", "cost": 10, "rank": 10, "damage": None, "armour": 10, "damage_type": None, "total_cost": None},
    {"name": "Secret Lair", "cost": 20, "rank": 20, "damage": None, "armour": 20, "damage_type": None, "total_cost": None},
    # Add more headquarters options here
]


# Function to calculate total cost
def calculate_total_cost(equipment):
    if "rank" in equipment:
        return equipment["cost"] * equipment["rank"]
    else:
        return equipment["cost"]

# Function to display equipment details
def display_equipment_details(equipment):
    print(f"Selected: {equipment['name']}")
    print(f"Size: {equipment['size']}")
    print(f"Strength: {equipment['strength']}")
    print(f"Speed: {equipment['speed']}")
    print(f"Defense: {equipment['defense']}")
    print(f"Toughness: {equipment['toughness']}")
    
    if 'powers' in equipment:
        print("Powers:")
        for power in equipment['powers']:
            print(f"- {power['name']} (Rank {power['rank']})")
            
    if 'features' in equipment:
        print("Features:")
        for feature in equipment['features']:
            print(f"- {feature}")
    
    print(f"Cost: {equipment['cost']}")

# Function to generate random equipment
def generate_equipment(points):
    selected_equipment = []
    total_cost = 0

    while total_cost < points:
        choice = input("Press V for Vehicles, B for Basic equipment, H for Headquarters, A for All, R for Retry, or E for Exit: ").lower()

        if choice == "e":
            break
        elif choice == "v":
            equipment = random.choice(vehicles)
        elif choice == "b":
            equipment = random.choice(basic_equipment)
        elif choice == "h":
            equipment = random.choice(headquarters)
        elif choice == "a":
            category_choices = vehicles + basic_equipment + headquarters
            equipment = random.choice(category_choices)
        elif choice == "r":
            continue
        else:
            print("Invalid choice. Please choose a valid option.")
            continue

        equipment_cost = calculate_total_cost(equipment)

        if total_cost + equipment_cost <= points:
            selected_equipment.append(equipment)
            total_cost += equipment_cost
            display_equipment_details(equipment)

    if total_cost < points:
        unspent_points = points - total_cost
        print(f"Unspent Points: {unspent_points}")

    print(f"Total Points Spent: {total_cost}")

# Main program
if __name__ == "__main__":
    points = int(input("How many points do you wish to spend? "))
    generate_equipment(points)