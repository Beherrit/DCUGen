import tkinter as tk
from tkinter import ttk
import json

# Load creatures from the JSON file
def load_creatures():
    with open('json/beastiary.json') as f:
        data = json.load(f)
    return {creature['name']: creature for creature in data['Creatures']}

# Function to display creature information
def show_creature_info(selected_creature):
    if not selected_creature:  # Check if a creature is selected
        return  # Exit the function if no creature is selected
    creature = creatures[selected_creature]
    info_window = tk.Toplevel()
    info_window.title(selected_creature)
    
    # Create a frame for the creature information
    info_frame = ttk.Frame(info_window, padding="10")
    info_frame.pack(fill=tk.BOTH, expand=True)

    # Display creature information in a more organized manner
    ttk.Label(info_frame, text=creature['name'], font=("Arial", 16, "bold")).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 10))
    ttk.Label(info_frame, text=f"Power Level: {creature['PL']}", font=("Arial", 12)).grid(row=1, column=0, columnspan=2, sticky="w", pady=(0, 10))

    # Stats
    ttk.Label(info_frame, text="Stats:", font=("Arial", 12, "bold")).grid(row=2, column=0, sticky="w", pady=(10, 5))
    for i, (stat, value) in enumerate(creature['stats'].items()):
        ttk.Label(info_frame, text=f"{stat}: {value}").grid(row=i+3, column=0, sticky="w")

    # Skills
    ttk.Label(info_frame, text="Skills:", font=("Arial", 12, "bold")).grid(row=2, column=1, sticky="w", pady=(10, 5))
    for i, skill in enumerate(creature['skills']):
        ttk.Label(info_frame, text=skill).grid(row=i+3, column=1, sticky="w")

    # Powers
    ttk.Label(info_frame, text="Powers:", font=("Arial", 12, "bold")).grid(row=len(creature['stats'])+3, column=0, sticky="w", pady=(10, 5))
    for i, power in enumerate(creature['powers']):
        ttk.Label(info_frame, text=f"{power['name']}: {power['effect']}").grid(row=len(creature['stats'])+i+4, column=0, columnspan=2, sticky="w")

    # Defenses
    ttk.Label(info_frame, text="Defenses:", font=("Arial", 12, "bold")).grid(row=len(creature['stats'])+len(creature['powers'])+4, column=0, sticky="w", pady=(10, 5))
    for i, (defense, value) in enumerate(creature['defenses'].items()):
        ttk.Label(info_frame, text=f"{defense}: {value}").grid(row=len(creature['stats'])+len(creature['powers'])+i+5, column=0, sticky="w")

    # Attacks
    ttk.Label(info_frame, text="Attacks:", font=("Arial", 12, "bold")).grid(row=len(creature['stats'])+len(creature['powers'])+4, column=1, sticky="w", pady=(10, 5))
    for i, attack in enumerate(creature['attacks']):
        ttk.Label(info_frame, text=f"{attack['name']}: {attack['effect']} (Accuracy: {attack['accuracy']})").grid(row=len(creature['stats'])+len(creature['powers'])+i+5, column=1, sticky="w")

# Function to open the Beastiary window
def open_beastiary():
    beastiary_window = tk.Toplevel()
    beastiary_window.title("Beastiary")
    beastiary_window.geometry("300x150")

    # Create a frame for the beastiary content
    beastiary_frame = ttk.Frame(beastiary_window, padding="10")
    beastiary_frame.pack(fill=tk.BOTH, expand=True)

    # Dropdown for creature selection
    creature_names = sorted(creatures.keys())
    selected_creature = tk.StringVar()
    ttk.Label(beastiary_frame, text="Select a creature:", font=("Arial", 12)).pack(pady=(0, 5))
    creature_dropdown = ttk.Combobox(beastiary_frame, textvariable=selected_creature, values=creature_names, width=30)
    creature_dropdown.pack(pady=(0, 10))

    # Button to show selected creature info
    show_info_button = ttk.Button(beastiary_frame, text="Show Info", command=lambda: show_creature_info(selected_creature.get()))
    show_info_button.pack(pady=(0, 10))

# Load creatures
creatures = load_creatures()
