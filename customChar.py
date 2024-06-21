import tkinter as tk
from tkinter import ttk, messagebox
import random

def open_custom_character_window():
    custom_char_window = tk.Toplevel()
    custom_char_window.title("Create Custom Character")

    # Labels and Entry fields for inputs
    tk.Label(custom_char_window, text="Power Level:").grid(row=0, column=0, padx=10, pady=5)
    power_level_entry = tk.Entry(custom_char_window)
    power_level_entry.grid(row=0, column=1, padx=10, pady=5)

    tk.Label(custom_char_window, text="Min Points:").grid(row=1, column=0, padx=10, pady=5)
    min_points_entry = tk.Entry(custom_char_window)
    min_points_entry.grid(row=1, column=1, padx=10, pady=5)

    tk.Label(custom_char_window, text="Max Points:").grid(row=2, column=0, padx=10, pady=5)
    max_points_entry = tk.Entry(custom_char_window)
    max_points_entry.grid(row=2, column=1, padx=10, pady=5)

    tk.Label(custom_char_window, text="Max Advantages:").grid(row=3, column=0, padx=10, pady=5)
    max_advantages_entry = tk.Entry(custom_char_window)
    max_advantages_entry.grid(row=3, column=1, padx=10, pady=5)

    tk.Label(custom_char_window, text="Max Powers:").grid(row=4, column=0, padx=10, pady=5)
    max_powers_entry = tk.Entry(custom_char_window)
    max_powers_entry.grid(row=4, column=1, padx=10, pady=5)

    def generate_custom_character():
        power_level = int(power_level_entry.get())
        min_points = int(min_points_entry.get())
        max_points = int(max_points_entry.get())
        max_advantages = int(max_advantages_entry.get())
        max_powers = int(max_powers_entry.get())
        
        # Validate input values
        if min_points > max_points:
            messagebox.showerror("Error", "Min Points should be less than or equal to Max Points")
            return

        # Generate the character within the given constraints
        character = generate_character_with_constraints(power_level, min_points, max_points, max_advantages, max_powers)

        # Display character details in a new window or a message box
        character_details = f"Character:\nPower Level: {character['power_level']}\nTotal Points: {character['total_cost']}\nAdvantages: {len(character['advantages'])}\nPowers: {len(character['powers'])}\n"
        messagebox.showinfo("Generated Character", character_details)

    generate_button = ttk.Button(custom_char_window, text="Generate Character", command=generate_custom_character)
    generate_button.grid(row=5, columnspan=2, pady=10)

def generate_character_with_constraints(power_level, min_points, max_points, max_advantages, max_powers):
    # Implementation for generating a character based on given constraints
    # This is a simplified placeholder. You need to replace it with actual character generation logic
    character = {
        "power_level": power_level,
        "total_cost": random.randint(min_points, max_points),
        "advantages": [{} for _ in range(max_advantages)],
        "powers": [{} for _ in range(max_powers)],
    }
    return character
