import tkinter as tk
from tkinter import ttk
import random
import json

# Load JSON files
with open('json/stats.json') as f:
    stats_data = json.load(f)['STATS']

with open('json/skills.json') as f:
    skills_data = json.load(f)

with open('json/flaws.json') as f:
    flaws_data = json.load(f)

with open('json/extras.json') as f:
    extras_data = json.load(f)

with open('json/powers.json') as f:
    powers_data = json.load(f)

with open('json/advantages.json') as f:
    advantages_data = json.load(f)

# Helper functions for point calculation and random selection
def calculate_skill_cost(points):
    return (points + 1) // 2

def calculate_power_cost(base_cost, rank, extras, flaws):
    return max(1, (base_cost + extras - flaws) * rank)

def random_select_from_list(data_list, min_val, max_val):
    return random.sample(data_list, random.randint(min_val, max_val))

def remove_duplicates(items):
    unique_items = []
    names_seen = set()
    for item in items:
        if item['name'] not in names_seen:
            unique_items.append(item)
            names_seen.add(item['name'])
    return unique_items

# GUI implementation
class CharacterGenerator(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("DC Adventures M&M 3E Random Character Generator")
        self.geometry("800x600")

        # Power Level input
        tk.Label(self, text="Power Level (PL):").grid(row=0, column=0, padx=10, pady=10)
        self.pl_var = tk.IntVar()
        tk.Entry(self, textvariable=self.pl_var).grid(row=0, column=1, padx=10, pady=10)

        # Point Range input
        tk.Label(self, text="Point Range (min-max):").grid(row=1, column=0, padx=10, pady=10)
        self.min_points_var = tk.IntVar()
        self.max_points_var = tk.IntVar()
        tk.Entry(self, textvariable=self.min_points_var).grid(row=1, column=1, padx=10, pady=10)
        tk.Entry(self, textvariable=self.max_points_var).grid(row=1, column=2, padx=10, pady=10)

        # Skills input
        tk.Label(self, text="Skills Range (min-max):").grid(row=2, column=0, padx=10, pady=10)
        self.min_skills_var = tk.IntVar()
        self.max_skills_var = tk.IntVar()
        tk.Entry(self, textvariable=self.min_skills_var).grid(row=2, column=1, padx=10, pady=10)
        tk.Entry(self, textvariable=self.max_skills_var).grid(row=2, column=2, padx=10, pady=10)

        # Advantages input
        tk.Label(self, text="Advantages Range (min-max):").grid(row=3, column=0, padx=10, pady=10)
        self.min_advantages_var = tk.IntVar()
        self.max_advantages_var = tk.IntVar()
        tk.Entry(self, textvariable=self.min_advantages_var).grid(row=3, column=1, padx=10, pady=10)
        tk.Entry(self, textvariable=self.max_advantages_var).grid(row=3, column=2, padx=10, pady=10)

        # Powers input
        tk.Label(self, text="Powers Range (min-max):").grid(row=4, column=0, padx=10, pady=10)
        self.min_powers_var = tk.IntVar()
        self.max_powers_var = tk.IntVar()
        tk.Entry(self, textvariable=self.min_powers_var).grid(row=4, column=1, padx=10, pady=10)
        tk.Entry(self, textvariable=self.max_powers_var).grid(row=4, column=2, padx=10, pady=10)

        # Generate Character button
        tk.Button(self, text="Generate Character", command=self.generate_character).grid(row=5, column=1, padx=10, pady=10)

        # Character display
        self.character_text = tk.Text(self, width=80, height=20)
        self.character_text.grid(row=6, column=0, columnspan=3, padx=10, pady=10)

    def generate_character(self):
        while True:
            try:
                pl = self.pl_var.get()
                min_points = self.min_points_var.get()
                max_points = self.max_points_var.get()
                min_skills = self.min_skills_var.get()
                max_skills = self.max_skills_var.get()
                min_advantages = self.min_advantages_var.get()
                max_advantages = self.max_advantages_var.get()
                min_powers = self.min_powers_var.get()
                max_powers = self.max_powers_var.get()

                # Points allocation
                total_points = random.randint(min_points, max_points)

                # Randomly select skills, advantages, and powers within the input ranges
                selected_skills = random_select_from_list(skills_data, min_skills, max_skills)
                selected_advantages = random_select_from_list(advantages_data, min_advantages, max_advantages)
                selected_powers = random_select_from_list(powers_data, min_powers, max_powers)

                # Ensure no duplicates
                selected_advantages = remove_duplicates(selected_advantages)
                selected_powers = remove_duplicates(selected_powers)

                # Generate attributes
                attributes = {stat['name']: random.randint(0, 10) for stat in stats_data}  # Random values for example
                attribute_costs = {stat['name']: attributes[stat['name']] * 2 for stat in stats_data}

                # Generate defenses
                defense_points = {
                    'Dodge': random.randint(0, 10),
                    'Parry': random.randint(0, 10),
                    'Will': random.randint(0, 10),
                    'Fortitude': random.randint(0, 10)
                }
                defenses = {
                    'Dodge': attributes['Agility'] + defense_points['Dodge'],
                    'Parry': attributes['Fighting'] + defense_points['Parry'],
                    'Toughness': attributes['Stamina'],
                    'Will': attributes['Awareness'] + defense_points['Will'],
                    'Fortitude': attributes['Stamina'] + defense_points['Fortitude']
                }
                defense_costs = {defense: defense_points[defense] for defense in defense_points}

                # Calculate total costs
                attribute_total_cost = sum(attribute_costs.values())
                defense_total_cost = sum(defense_costs.values())

                skill_ranks = {skill['name']: random.randint(0, pl + 10) for skill in selected_skills}
                skill_total_cost = sum(calculate_skill_cost(rank) for rank in skill_ranks.values())

                advantage_total_cost = sum(adv['cost'] for adv in selected_advantages)

                power_total_cost = 0
                for power in selected_powers:
                    rank = random.randint(1, pl)
                    extras = random.sample(extras_data, random.randint(0, 3))
                    flaws = random.sample(flaws_data, random.randint(0, 3))
                    extras = remove_duplicates(extras)
                    flaws = remove_duplicates(flaws)
                    flat_total = sum(extra['value'] for extra in extras) - sum(flaw['value'] for flaw in flaws)
                    total_cost = calculate_power_cost(power['cost'], rank, sum(extra['value'] for extra in extras), sum(flaw['value'] for flaw in flaws))
                    power_total_cost += total_cost

                total_cost = attribute_total_cost + defense_total_cost + skill_total_cost + advantage_total_cost + power_total_cost

                # Generate character details
                character_details = f"Power Level (PL): {pl}\n"
                character_details += f"Total Points: {total_cost}\n\n"

                # Breakdown of costs
                character_details += f"Attribute Total Cost: {attribute_total_cost} | Total: {attribute_total_cost}\n"
                character_details += f"Defense Total Cost: {defense_total_cost} | Total: {defense_total_cost}\n"
                character_details += f"Skills Total Cost: {skill_total_cost} | Total: {skill_total_cost}\n"
                character_details += f"Advantages Total Cost: {advantage_total_cost} | Total: {advantage_total_cost}\n"
                character_details += f"Powers Total Cost: {power_total_cost} | Total: {power_total_cost}\n\n"

                # Attributes details
                character_details += "Attributes:\n"
                for stat in stats_data:
                    character_details += f"- {stat['name']} | Value: {attributes[stat['name']]} | Cost: {attribute_costs[stat['name']]}\n"

                # Defenses details
                character_details += "\nDefenses:\n"
                for defense in defenses:
                    total_value = defenses[defense]
                    cost_value = defense_costs.get(defense, 0)
                    derived_stat = attributes[defense.split()[0]] if defense != 'Toughness' else attributes['Stamina']
                    character_details += f"- {defense} | Value: {total_value} | Cost: {cost_value} | Total: {derived_stat + cost_value}\n"

                # Skills details
                character_details += "\nSkills:\n"
                for skill in selected_skills:
                    if skill['name'] == 'Expertise':
                        sub_skill = random.choice(skill['sub_skills'])
                        skill_name = f"{skill['name']} | {sub_skill}"
                    else:
                        skill_name = skill['name']
                    rank = min(skill_ranks[skill['name']], pl + 10)  # Enforce skill limit
                    stat = next((s['name'] for s in stats_data if s['name'] in skill['tags']), "Unknown")
                    total = rank + attributes[stat]
                    character_details += f"- {skill_name} | Rank: {rank} | Ability Stat: {stat} | Total: {total}\n"

                # Advantages details
                character_details += "\nAdvantages:\n"
                for advantage in selected_advantages:
                    rank = 1  # Assuming rank 1 for all advantages as no rank is provided in JSON
                    character_details += f"- {advantage['name']} | Rank: {rank} | Cost: {advantage['cost']}\n"

                # Powers details
                character_details += "\nPowers:\n"
                for power in selected_powers:
                    rank = random.randint(1, pl)
                    extras = random.sample(extras_data, random.randint(0, 3))
                    flaws = random.sample(flaws_data, random.randint(0, 3))
                    extras = remove_duplicates(extras)
                    flaws = remove_duplicates(flaws)
                    flat_total = sum(extra['value'] for extra in extras) - sum(flaw['value'] for flaw in flaws)
                    total_cost = calculate_power_cost(power['cost'], rank, sum(extra['value'] for extra in extras), sum(flaw['value'] for flaw in flaws))
                    character_details += f"- {power['name']} | Extras: {', '.join(f'{extra['name']} ({extra['value']})' for extra in extras)} | Flaws: {', '.join(f'{flaw['name']} ({flaw['value']})' for flaw in flaws)} | Flat Total: {flat_total} | Total Power Cost: {total_cost}\n"

                # Display character details
                self.character_text.delete("1.0", tk.END)
                self.character_text.insert(tk.END, character_details)

                break  # Exit the loop if character generation is successful

            except KeyError:
                continue  # If there is a KeyError, retry the character generation

if __name__ == "__main__":
    app = CharacterGenerator()
    app.mainloop()
